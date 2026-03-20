import { CompilerError } from "../errors";
import type {
  AnglePathSegment,
  AngleNode,
  AngleSetStatement,
  AngleStatement,
  BinaryOpNode,
  BlockEditDirective,
  BlockElementNode,
  BlockNode,
  FunctionDefNode,
  FunctionParam,
  InvocationNode,
  ListLiteralNode,
  MapLiteralEntryNode,
  MapLiteralNode,
  NumberLiteralNode,
  PipeValueNode,
  Sequence,
  SequenceNode,
  SpreadNode,
  StringLiteralNode,
  TextNode,
  TupleLiteralNode,
  UnaryOpNode
} from "../lang";
import type { Reporter } from "../messages";
import { reportCompilerMessage } from "./message";
import { lex, type RantyToken } from "./lexer";
import { TokenReader } from "./token-reader";

const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/;
const PATH_PATTERN = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;
const INTEGER_PATTERN = /^[+-]?\d+$/;
const MUTABLE_ATTRIBUTE_NAMES = new Set(["rep", "sep", "sel", "mut"]);
const READ_ONLY_ATTRIBUTE_NAMES = new Set(["step", "total"]);
const VALID_KEYWORD_NAMES = new Set([
  "require",
  "true",
  "false",
  "not",
  "neg",
  "eq",
  "neq",
  "lt",
  "le",
  "gt",
  "ge",
  "step",
  "total",
  "rep",
  "sep",
  "sel",
  "mut",
  "if",
  "elseif",
  "else",
  "return",
  "continue",
  "break",
  "on",
  "weight"
]);

type OperatorTokenName =
  | "not"
  | "neg"
  | "add"
  | "sub"
  | "mul"
  | "div"
  | "mod"
  | "pow"
  | "eq"
  | "neq"
  | "lt"
  | "le"
  | "gt"
  | "ge"
  | "and"
  | "or"
  | "xor";
type BinaryOperatorName = Exclude<OperatorTokenName, "not" | "neg">;

interface OperatorTokenNode {
  readonly kind: "operator-token";
  readonly op: OperatorTokenName;
  readonly span: { readonly start: number; readonly end: number };
}

type WorkingNode = SequenceNode | OperatorTokenNode;
type BindingRole = "normal" | "fallible_optional_arg";

interface TrackedBinding {
  readonly isConst: boolean;
  readonly role: BindingRole;
}

function syntaxError(
  reporter: Reporter,
  message: string,
  start: number,
  end: number,
  inlineMessage?: string
): never {
  reportCompilerMessage(
    reporter,
    "SYNTAX_ERROR",
    message,
    "error",
    start,
    end,
    inlineMessage
  );
  throw new CompilerError("syntax", message);
}

function compilerError(
  reporter: Reporter,
  code: string,
  message: string,
  start: number,
  end: number,
  inlineMessage?: string
): never {
  reportCompilerMessage(
    reporter,
    code,
    message,
    "error",
    start,
    end,
    inlineMessage
  );
  throw new CompilerError("syntax", message);
}

function decodeEscape(char: string): string {
  switch (char) {
    case '"':
      return '"';
    case "\\":
      return "\\";
    case "n":
      return "\n";
    case "r":
      return "\r";
    case "t":
      return "\t";
    case "s":
      return " ";
    case "[":
      return "[";
    case "]":
      return "]";
    case "{":
      return "{";
    case "}":
      return "}";
    case "<":
      return "<";
    case ">":
      return ">";
    default:
      return char;
  }
}

function decodeTextEscapes(value: string): string {
  let output = "";

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "\\" && index + 1 < value.length) {
      output += decodeEscape(value[index + 1] ?? "");
      index += 1;
      continue;
    }
    output += char ?? "";
  }

  return output;
}

function isTriviaToken(token: RantyToken | undefined): boolean {
  return token?.type === "whitespace" || token?.type === "comment";
}

function tokenValue(token: RantyToken | undefined): string | undefined {
  if (!token || token.type === "eof") {
    return undefined;
  }

  if (token.type === "string") {
    return token.raw;
  }

  return token.value;
}

function tokenEnd(token: RantyToken | undefined, fallback: number): number {
  return token?.end ?? fallback;
}

class Parser {
  readonly #reader: TokenReader;
  readonly #reporter: Reporter;

  constructor(reader: TokenReader, reporter: Reporter) {
    this.#reader = reader;
    this.#reporter = reporter;
  }

  parse(): Sequence {
    const root = this.parseSequence(new Set());
    this.validateNoMisplacedMetadata(root);
    this.validateBindingRules(root);
    this.reportUnusedTopLevelBindings(root);
    return root;
  }

  private parseSequence(
    terminators: ReadonlySet<string>,
    options: { readonly allowSymbolicOperators?: boolean } = {}
  ): Sequence {
    const nodes: WorkingNode[] = [];
    let trimLeadingWhitespace = false;
    const allowSymbolicOperators = options.allowSymbolicOperators ?? false;

    while (!this.#reader.isEof()) {
      if (trimLeadingWhitespace) {
        this.skipTrivia();
        trimLeadingWhitespace = false;
      }

      if (this.trySkipComment()) {
        continue;
      }

      const token = this.peekToken();
      if (
        !token ||
        token.type === "eof" ||
        this.isTerminatorToken(token, terminators)
      ) {
        break;
      }
      if (this.matchesSymbol("|>")) {
        break;
      }

      if (token.type === "string") {
        nodes.push(this.parseStringLiteral());
        continue;
      }

      if (this.matchesSymbol("[")) {
        nodes.push(this.parseBracketNode());
        continue;
      }

      if (this.matchesSymbol("{")) {
        nodes.push(this.parseBlock(false));
        continue;
      }

      if (this.matchesSymbol("~")) {
        this.trimTrailingWhitespace(nodes);
        this.nextToken();
        this.skipInlineWhitespace();
        if (!this.matchesSymbol("{")) {
          compilerError(
            this.#reporter,
            "R0130",
            "sink must target a supported expression unit",
            this.currentIndex(),
            this.currentIndex() + 1,
            "~"
          );
        }
        nodes.push(this.parseBlock(true));
        trimLeadingWhitespace = true;
        continue;
      }

      if (this.matchesSymbol("<")) {
        nodes.push(this.parseAngleNode());
        continue;
      }

      if (this.matchesSymbol("`")) {
        this.nextToken();
        this.skipInlineWhitespace();
        nodes.push(this.parseHintedNode());
        continue;
      }

      if (this.matchesSymbol("@")) {
        nodes.push(...this.parseKeywordNodes(terminators));
        continue;
      }

      if (allowSymbolicOperators && this.isSymbolicOperatorStart()) {
        nodes.push(this.parseSymbolOperator());
        continue;
      }

      if (this.matchesSymbol("(")) {
        nodes.push(this.parseParenNode());
        continue;
      }

      const number = this.tryParseNumberLiteral();
      if (number) {
        nodes.push(number);
        continue;
      }

      const text = this.parseText(terminators, allowSymbolicOperators);
      if (text.value.length > 0) {
        nodes.push(text);
      }
    }

    return {
      kind: "sequence",
      nodes: this.foldOperators(nodes)
    };
  }

  private peekToken(offset = 0): RantyToken | undefined {
    return this.#reader.peek(offset);
  }

  private nextToken(): RantyToken | undefined {
    return this.#reader.next();
  }

  private peekValue(offset = 0): string | undefined {
    return tokenValue(this.peekToken(offset));
  }

  private currentIndex(): number {
    return this.#reader.index();
  }

  private mark(): number {
    return this.#reader.mark();
  }

  private reset(mark: number): void {
    this.#reader.reset(mark);
  }

  private skipTrivia(): void {
    while (true) {
      const token = this.peekToken();
      if (!isTriviaToken(token)) {
        return;
      }
      this.nextToken();
    }
  }

  private matchesType(type: RantyToken["type"], offset = 0): boolean {
    return this.peekToken(offset)?.type === type;
  }

  private matchesSymbol(value: string, offset = 0): boolean {
    const token = this.peekToken(offset);
    return token?.type === "symbol" && token.value === value;
  }

  private matchesIdentifier(offset = 0): boolean {
    return this.peekToken(offset)?.type === "identifier";
  }

  private isTerminatorToken(
    token: RantyToken,
    terminators: ReadonlySet<string>
  ): boolean {
    return token.type === "symbol" && terminators.has(token.value);
  }

  private isSymbolicOperatorStart(): boolean {
    const token = this.peekToken();
    if (token?.type !== "symbol") {
      return false;
    }

    return ["+", "-", "*", "**", "/", "%", "&", "|", "^"].includes(token.value);
  }

  private tryParseNumberLiteral(): NumberLiteralNode | null {
    const token = this.peekToken();
    if (token?.type !== "number") {
      return null;
    }

    this.nextToken();

    return {
      kind: "number",
      value: INTEGER_PATTERN.test(token.value)
        ? BigInt(token.value)
        : Number(token.value),
      span: {
        start: token.start,
        end: token.end
      }
    };
  }

  private parseText(
    terminators: ReadonlySet<string>,
    allowSymbolicOperators: boolean
  ): TextNode {
    const start = this.currentIndex();
    let value = "";
    let end = start;

    while (!this.#reader.isEof()) {
      const token = this.peekToken();
      if (!token || token.type === "eof") {
        break;
      }

      if (token.type === "comment") {
        break;
      }
      if (token.type === "string") {
        break;
      }
      if (token.type === "symbol" && token.value === "\\") {
        value += tokenValue(this.nextToken()) ?? "";
        end = this.currentIndex();
        if (this.#reader.isEof()) {
          break;
        }
        value += tokenValue(this.nextToken()) ?? "";
        end = this.currentIndex();
        continue;
      }
      if (this.isTerminatorToken(token, terminators)) {
        break;
      }
      if (
        token.type === "symbol" &&
        ["[", "{", "<", "(", "@", "~", "`"].includes(token.value)
      ) {
        break;
      }
      if (
        allowSymbolicOperators &&
        token.type === "symbol" &&
        ["+", "-", "*", "**", "/", "%", "&", "|", "^"].includes(token.value)
      ) {
        break;
      }
      if (token.type === "symbol" && token.value === "|>") {
        break;
      }
      if (
        token.type === "symbol" &&
        token.value === "~" &&
        this.matchesSymbol("{", 1)
      ) {
        break;
      }
      if (token.type === "number" && value.trim().length === 0) {
        break;
      }

      value += tokenValue(this.nextToken()) ?? "";
      end = token.end;
    }

    return {
      kind: "text",
      value: decodeTextEscapes(value),
      span: {
        start,
        end
      }
    };
  }

  private parseParenNode():
    | MapLiteralNode
    | ListLiteralNode
    | TupleLiteralNode {
    const start = this.currentIndex();
    this.expect("(");
    this.skipInlineWhitespace();

    if (this.matchesSymbol(":")) {
      this.nextToken();
      if (this.matchesSymbol(":")) {
        this.nextToken();
        return this.parseMapLiteralBody(start);
      }
      return this.parseCollectionLiteralBody(start, "list");
    }

    return this.parseCollectionLiteralBody(start, "tuple");
  }

  private parseMapLiteralBody(start: number): MapLiteralNode {
    const entries: MapLiteralEntryNode[] = [];

    while (true) {
      this.skipInlineWhitespace();
      if (this.trySkipComment()) {
        this.skipInlineWhitespace();
      }

      if (this.matchesSymbol(")")) {
        this.nextToken();
        break;
      }

      const key = this.parseIdentifier("map key");
      this.skipInlineWhitespace();
      this.expect("=");
      this.skipInlineWhitespace();

      const value = this.trimSequenceWhitespace(
        this.parseSequence(new Set([";", ")"]), {
          allowSymbolicOperators: true
        })
      );
      entries.push({ key, value });

      this.skipInlineWhitespace();
      if (this.matchesSymbol(";")) {
        this.nextToken();
        continue;
      }
      if (this.matchesSymbol(")")) {
        this.nextToken();
        break;
      }

      syntaxError(
        this.#reporter,
        "expected ';' or ')' in map literal",
        this.#reader.index(),
        this.#reader.index() + 1,
        "map"
      );
    }

    return {
      kind: "map",
      entries,
      span: { start, end: this.#reader.index() }
    };
  }

  private parseCollectionLiteralBody(
    start: number,
    kind: "list" | "tuple"
  ): ListLiteralNode | TupleLiteralNode {
    const items: Sequence[] = [];

    while (true) {
      this.skipInlineWhitespace();
      if (this.trySkipComment()) {
        this.skipInlineWhitespace();
      }

      if (this.matchesSymbol(")")) {
        this.nextToken();
        break;
      }

      items.push(
        this.trimSequenceWhitespace(
          this.parseSequence(new Set([";", ")"]), {
            allowSymbolicOperators: true
          })
        )
      );

      this.skipInlineWhitespace();
      if (this.matchesSymbol(";")) {
        this.nextToken();
        continue;
      }
      if (this.matchesSymbol(")")) {
        this.nextToken();
        break;
      }

      syntaxError(
        this.#reporter,
        `expected ';' or ')' in ${kind} literal`,
        this.#reader.index(),
        this.#reader.index() + 1,
        kind
      );
    }

    return {
      kind,
      items,
      span: { start, end: this.#reader.index() }
    };
  }

  private parseStringLiteral(): StringLiteralNode {
    const token = this.nextToken();
    if (!token || token.type !== "string") {
      const start = this.currentIndex();
      syntaxError(
        this.#reporter,
        "unterminated string literal",
        start,
        start + 1,
        "string"
      );
    }

    return {
      kind: "string",
      value: token.value,
      span: { start: token.start, end: token.end }
    };
  }

  private parseKeywordNodes(terminators: ReadonlySet<string>): WorkingNode[] {
    const start = this.currentIndex();
    this.expect("@");
    const keyword = this.parseIdentifier("keyword");
    const name = `@${keyword}`;

    if (!VALID_KEYWORD_NAMES.has(keyword)) {
      compilerError(
        this.#reporter,
        "R0200",
        `invalid keyword: '${name}'`,
        start,
        this.#reader.index(),
        name
      );
    }

    if (["not", "neg", "eq", "neq", "lt", "le", "gt", "ge"].includes(keyword)) {
      return [
        this.makeKeywordOperatorToken(
          start,
          keyword as Extract<
            OperatorTokenName,
            "not" | "neg" | "eq" | "neq" | "lt" | "le" | "gt" | "ge"
          >
        )
      ];
    }

    if (keyword === "require") {
      return [this.parseRequireInvocation(start, terminators)];
    }

    if (READ_ONLY_ATTRIBUTE_NAMES.has(keyword)) {
      const checkpoint = this.mark();
      this.skipInlineWhitespace();
      const next = this.peekToken();
      if (
        next &&
        next.type !== "eof" &&
        !this.isTerminatorToken(next, terminators)
      ) {
        compilerError(
          this.#reporter,
          "R0206",
          `attribute keyword '@${keyword}' is read-only`,
          start,
          this.#reader.index(),
          name
        );
      }
      this.reset(checkpoint);
    }

    if (
      ["if", "elseif", "else", "rep", "sep", "sel", "mut"].includes(keyword)
    ) {
      const checkpoint = this.mark();
      this.skipInlineWhitespace();

      if (this.matchesSymbol(":")) {
        return this.finishKeywordBlockSugar(start, name, []);
      }

      const argCheckpoint = this.mark();
      const arg = this.parseSequence(new Set([":"]), {
        allowSymbolicOperators: true
      });
      if (this.matchesSymbol(":")) {
        return this.finishKeywordBlockSugar(start, name, [
          this.trimSequenceWhitespace(arg)
        ]);
      }

      this.reset(argCheckpoint);
      this.reset(checkpoint);
    } else if (
      ["return", "break", "continue", "on", "weight"].includes(keyword)
    ) {
      const checkpoint = this.mark();
      this.skipInlineWhitespace();
      const next = this.peekToken();
      if (
        !next ||
        next.type === "eof" ||
        this.isTerminatorToken(next, terminators)
      ) {
        if (keyword === "on" || keyword === "weight") {
          compilerError(
            this.#reporter,
            "R0207",
            `@${keyword} metadata must appear on a block element with a value`,
            start,
            this.#reader.index(),
            name
          );
        }
        this.reset(checkpoint);
        return [this.makeInvocationNode(start, name, [])];
      }

      const arg = this.trimSequenceWhitespace(
        this.parseSequence(
          keyword === "on" || keyword === "weight"
            ? new Set([...terminators, "@"])
            : terminators,
          { allowSymbolicOperators: true }
        )
      );
      return [this.makeInvocationNode(start, name, [arg])];
    }

    return [this.makeInvocationNode(start, name, [])];
  }

  private parseRequireInvocation(
    start: number,
    terminators: ReadonlySet<string>
  ): InvocationNode {
    this.skipInlineWhitespace();
    const next = this.peekToken();
    if (
      !next ||
      next.type === "eof" ||
      this.isTerminatorToken(next, terminators)
    ) {
      syntaxError(
        this.#reporter,
        "missing argument for @require",
        start,
        this.#reader.index(),
        "@require"
      );
    }

    const args: Sequence[] = [];
    const aliasStart = this.currentIndex();

    if (next.type !== "string") {
      const alias = this.parseIdentifier("module alias");
      this.skipInlineWhitespace();
      if (!this.matchesSymbol(":")) {
        compilerError(
          this.#reporter,
          "R0203",
          "@require path should be a string literal",
          aliasStart,
          this.#reader.index(),
          "@require"
        );
      }
      this.nextToken();
      args.push(
        this.stringSequence(alias, aliasStart, aliasStart + alias.length)
      );
      this.skipInlineWhitespace();
    }

    if (!this.matchesType("string")) {
      compilerError(
        this.#reporter,
        "R0203",
        "@require path should be a string literal",
        start,
        this.#reader.index(),
        "@require"
      );
    }

    const pathNode = this.parseStringLiteral();
    args.push({
      kind: "sequence",
      nodes: [pathNode]
    });

    return {
      kind: "invoke",
      name: "@require",
      args,
      span: { start, end: this.#reader.index() }
    };
  }

  private finishKeywordBlockSugar(
    start: number,
    name: string,
    args: readonly Sequence[]
  ): SequenceNode[] {
    this.expect(":");
    this.skipInlineWhitespace();

    if (!this.matchesSymbol("{")) {
      syntaxError(
        this.#reporter,
        `${name} block sugar must be followed by a block`,
        start,
        this.#reader.index(),
        name
      );
    }

    return [this.makeInvocationNode(start, name, args), this.parseBlock(false)];
  }

  private makeInvocationNode(
    start: number,
    name: string,
    args: readonly Sequence[]
  ): InvocationNode {
    return {
      kind: "invoke",
      name,
      args,
      span: { start, end: this.#reader.index() }
    };
  }

  private stringSequence(value: string, start: number, end: number): Sequence {
    return {
      kind: "sequence",
      nodes: [
        {
          kind: "string",
          value,
          span: { start, end }
        }
      ]
    };
  }

  private parseBracketNode(): SequenceNode {
    const start = this.currentIndex();
    this.expect("[");
    const marker = this.peekValue();

    if (this.matchesSymbol("]")) {
      this.nextToken();
      const node: PipeValueNode = {
        kind: "pipe-value",
        span: { start, end: this.currentIndex() }
      };
      return node;
    }

    if (marker === "$" || marker === "%" || marker === "?") {
      return this.parseFunctionDefinition(start);
    }

    return this.parseInvocation(start);
  }

  private parseFunctionDefinition(start: number): FunctionDefNode {
    let name: string | null = null;
    let global = false;
    let descope = 0;
    let isConst = false;
    const params: FunctionParam[] = [];

    const marker = this.peekValue();
    this.nextToken();
    if (marker === "$" || marker === "%") {
      isConst = marker === "%";
      if (this.matchesSymbol("/")) {
        global = true;
        this.nextToken();
      } else {
        while (this.matchesSymbol("^")) {
          descope += 1;
          this.nextToken();
        }
      }
      name = this.parsePathIdentifier("function");
    } else if (marker !== "?") {
      syntaxError(
        this.#reporter,
        "invalid function definition",
        start,
        this.currentIndex(),
        "function"
      );
    }

    if (this.matchesSymbol(":")) {
      this.nextToken();
      this.skipInlineWhitespace();

      while (true) {
        params.push(this.parseFunctionParam());
        if (this.matchesSymbol(";")) {
          this.nextToken();
          this.skipInlineWhitespace();
          continue;
        }
        break;
      }
    }

    if (!this.matchesSymbol("]")) {
      syntaxError(
        this.#reporter,
        "unterminated function signature",
        start,
        this.currentIndex(),
        name ?? "function"
      );
    }
    this.nextToken();
    this.skipInlineWhitespace();

    if (!this.matchesSymbol("{")) {
      syntaxError(
        this.#reporter,
        "function definition must be followed by a body block",
        start,
        this.currentIndex(),
        name ?? "function"
      );
    }

    const bodyBlock = this.parseBlock(false);
    return {
      kind: "function",
      name,
      global,
      descope,
      isConst,
      params,
      body: bodyBlock.elements[0]?.sequence ?? { kind: "sequence", nodes: [] },
      span: { start, end: bodyBlock.span.end }
    };
  }

  private parseFunctionParam(): FunctionParam {
    const start = this.currentIndex();
    let isLazy = false;

    if (
      this.matchesSymbol("@") &&
      this.matchesIdentifier(1) &&
      this.peekValue(1) === "lazy"
    ) {
      this.nextToken();
      this.nextToken();
      this.skipInlineWhitespace();
      isLazy = true;
    }

    const name = this.parseIdentifier("parameter");
    let optional = false;
    let variadic: FunctionParam["variadic"] = "none";
    let defaultValue: Sequence | undefined;

    this.skipInlineWhitespace();

    if (this.matchesSymbol("?")) {
      optional = true;
      this.nextToken();
      this.skipInlineWhitespace();
      if (!this.matchesSymbol(";") && !this.matchesSymbol("]")) {
        defaultValue = this.trimSequenceWhitespace(
          this.parseSequence(new Set([";", "]"]), {
            allowSymbolicOperators: true
          })
        );
      }
    } else if (this.matchesSymbol("*")) {
      variadic = "star";
      this.nextToken();
    } else if (this.matchesSymbol("+")) {
      variadic = "plus";
      this.nextToken();
    }

    return {
      span: { start, end: this.currentIndex() },
      name,
      isLazy,
      optional,
      variadic,
      ...(defaultValue ? { defaultValue } : {})
    };
  }

  private parseInvocation(start: number): SequenceNode {
    let current = this.sequenceOf(this.parseInvocationStage(start));

    while (true) {
      this.skipInlineWhitespace();
      if (this.matchesSymbol("|>")) {
        this.nextToken();
        current = this.lowerPipeStage(current);
        continue;
      }

      if (this.matchesSymbol(">")) {
        this.nextToken();
        const assignment = this.parseAssignmentPipe(start, current);
        if (!this.matchesSymbol("]")) {
          syntaxError(
            this.#reporter,
            "unterminated invocation",
            start,
            this.currentIndex(),
            "invoke"
          );
        }
        this.nextToken();
        return {
          ...assignment,
          span: { start, end: this.currentIndex() }
        };
      }

      if (this.matchesSymbol("]")) {
        this.nextToken();
        const node = current.nodes[0];
        if (!node || current.nodes.length !== 1 || node.kind !== "invoke") {
          syntaxError(
            this.#reporter,
            "invalid invocation pipeline",
            start,
            this.currentIndex(),
            "invoke"
          );
        }
        return {
          ...node,
          span: { start, end: this.currentIndex() }
        };
      }

      syntaxError(
        this.#reporter,
        "unterminated invocation",
        start,
        this.currentIndex(),
        "invoke"
      );
    }
  }

  private parseInvocationStage(start: number): InvocationNode {
    this.skipInlineWhitespace();

    let name = "call";
    const args: Sequence[] = [];

    if (this.tryConsumePipeCallTarget()) {
      // `[]` and `([])` lower to `call`; the pipe value is injected later.
    } else if (this.matchesSymbol("(")) {
      args.push(this.parseParenthesizedGroupSequence("invocation"));
    } else {
      name = this.parsePathIdentifier("invocation");
    }

    this.skipInlineWhitespace();
    if (this.matchesSymbol(":")) {
      this.nextToken();

      while (true) {
        this.skipInlineWhitespace();
        if (this.trySkipComment()) {
          this.skipInlineWhitespace();
        }

        const separator = this.peekToken();
        if (!separator || separator.type === "eof") {
          syntaxError(
            this.#reporter,
            "unterminated invocation",
            start,
            this.currentIndex(),
            name
          );
        }
        if (
          separator.type === "symbol" &&
          (separator.value === "]" ||
            separator.value === ">" ||
            separator.value === "|>")
        ) {
          break;
        }

        args.push(this.parseInvocationArg());
        this.skipInlineWhitespace();
        const delimiter = this.peekToken();
        if (delimiter?.type === "symbol" && delimiter.value === ";") {
          this.nextToken();
          continue;
        }
        if (
          delimiter?.type === "symbol" &&
          (delimiter.value === "]" ||
            delimiter.value === ">" ||
            delimiter.value === "|>")
        ) {
          break;
        }

        syntaxError(
          this.#reporter,
          "expected ';', '|>', '>' or ']' after invocation argument",
          this.currentIndex(),
          this.currentIndex() + 1,
          name
        );
      }
    } else if (!this.isInvocationStageTerminator()) {
      syntaxError(
        this.#reporter,
        "unterminated invocation",
        start,
        this.currentIndex(),
        name
      );
    }

    return {
      kind: "invoke",
      name,
      args,
      span: { start, end: this.currentIndex() }
    };
  }

  private parseInvocationArg(): Sequence {
    const start = this.currentIndex();
    let spread = false;
    let temporal = false;
    let label: string | undefined;

    if (this.matchesSymbol("**")) {
      spread = true;
      temporal = true;
      this.nextToken();
      this.skipInlineWhitespace();
    } else if (
      this.matchesSymbol("*") &&
      this.matchesIdentifier(1) &&
      this.matchesSymbol("*", 2)
    ) {
      spread = true;
      temporal = true;
      this.nextToken();
      label = this.parseIdentifier("temporal label");
      this.expect("*");
      this.skipInlineWhitespace();
    } else if (this.matchesSymbol("*") && !this.matchesSymbol("*", 1)) {
      spread = true;
      this.nextToken();
      this.skipInlineWhitespace();
    }

    const parsed = this.parseSequence(new Set([";", "]", ">"]), {
      allowSymbolicOperators: true
    });
    const value = this.normalizeInvocationArg(
      this.stripInvocationArgLayoutWhitespace(parsed)
    );

    if (!spread) {
      return value;
    }

    const spreadNode: SpreadNode = {
      kind: "spread",
      value,
      ...(temporal ? { temporal: true } : {}),
      ...(label ? { label } : {}),
      span: { start, end: this.#reader.index() }
    };

    return {
      kind: "sequence",
      nodes: [spreadNode]
    };
  }

  private stripInvocationArgLayoutWhitespace(sequence: Sequence): Sequence {
    if (sequence.nodes.length !== 1 || sequence.nodes[0]?.kind !== "text") {
      return sequence;
    }

    const node = sequence.nodes[0];
    const raw = this.#reader.source.slice(node.span.start, node.span.end);
    const trimmedRaw = raw.replace(/\s+$/u, "");
    if (trimmedRaw.length === raw.length) {
      return sequence;
    }

    return {
      kind: "sequence",
      nodes: [
        {
          ...node,
          value: decodeTextEscapes(trimmedRaw),
          span: {
            start: node.span.start,
            end: node.span.start + trimmedRaw.length
          }
        }
      ]
    };
  }

  private tryConsumePipeCallTarget(): boolean {
    if (this.matchesSymbol("[") && this.matchesSymbol("]", 1)) {
      this.nextToken();
      this.nextToken();
      return true;
    }

    if (
      this.matchesSymbol("(") &&
      this.matchesSymbol("[", 1) &&
      this.matchesSymbol("]", 2) &&
      this.matchesSymbol(")", 3)
    ) {
      this.nextToken();
      this.nextToken();
      this.nextToken();
      this.nextToken();
      return true;
    }

    return false;
  }

  private isInvocationStageTerminator(): boolean {
    return (
      this.matchesSymbol("]") ||
      this.matchesSymbol(">") ||
      this.matchesSymbol("|>")
    );
  }

  private lowerPipeStage(current: Sequence): Sequence {
    const stage = this.parseInvocationStage(this.currentIndex());
    let usesPipeValue = false;

    const args = stage.args.map((arg) => {
      const replaced = this.replacePipeValueInSequence(arg, current);
      usesPipeValue ||= replaced.used;
      return replaced.sequence;
    });

    return {
      kind: "sequence",
      nodes: [
        {
          ...stage,
          args: usesPipeValue ? args : [current, ...args]
        }
      ]
    };
  }

  private parseAssignmentPipe(start: number, current: Sequence): AngleNode {
    this.skipInlineWhitespace();

    let define = false;
    let isConst = false;
    let global = false;
    let descope = 0;

    if (this.matchesSymbol("$") || this.matchesSymbol("%")) {
      define = true;
      isConst = this.matchesSymbol("%");
      this.nextToken();
      if (this.matchesSymbol("/")) {
        global = true;
        this.nextToken();
      }
    } else if (this.matchesSymbol("/")) {
      global = true;
      this.nextToken();
    } else {
      while (this.matchesSymbol("^")) {
        descope += 1;
        this.nextToken();
      }
    }

    const name = this.matchesSymbol("@")
      ? this.parseAttributeAccessorName()
      : this.parseIdentifier("identifier");
    const path: AnglePathSegment[] = [];

    while (true) {
      this.skipInlineWhitespace();
      if (!this.matchesSymbol("/") || this.matchesSymbol("/=", 0)) {
        break;
      }
      this.nextToken();
      path.push(this.parseAnglePathSegment(name));
    }

    return {
      kind: "angle",
      statements: [
        {
          kind: "set",
          span: { start, end: this.#reader.index() },
          name,
          path,
          global,
          descope,
          define,
          isConst,
          isLazy: false,
          value: current
        }
      ],
      span: { start, end: this.#reader.index() }
    };
  }

  private parseBlock(sink: boolean): BlockNode {
    const start = this.currentIndex();
    this.expect("{");
    const elements: BlockElementNode[] = [];

    while (true) {
      elements.push(this.parseBlockElement(start));
      if (this.matchesSymbol("|")) {
        this.nextToken();
        continue;
      }
      if (this.matchesSymbol("}")) {
        this.nextToken();
        break;
      }
      syntaxError(
        this.#reporter,
        "unterminated block",
        start,
        this.currentIndex(),
        "block"
      );
    }

    return {
      kind: "block",
      elements,
      sink,
      span: { start, end: this.currentIndex() }
    };
  }

  private parseBlockElement(blockStart: number): BlockElementNode {
    const edit = this.tryParseBlockEditDirective();
    if (edit) {
      return {
        sequence: {
          kind: "sequence",
          nodes: []
        },
        edit
      };
    }

    const rawSequence = this.parseSequence(new Set(["|", "}"]));
    const nodes = [...rawSequence.nodes];
    let on: Sequence | undefined;
    let weight: Sequence | undefined;

    while (true) {
      this.trimTrailingWhitespace(nodes);
      const last = nodes.at(-1);
      if (
        last?.kind !== "invoke" ||
        (last.name !== "@on" && last.name !== "@weight")
      ) {
        break;
      }

      if (last.args.length !== 1) {
        compilerError(
          this.#reporter,
          "R0207",
          `${last.name} metadata must have exactly one value`,
          last.span.start,
          last.span.end,
          last.name
        );
      }

      if (last.name === "@on") {
        if (on) {
          compilerError(
            this.#reporter,
            "R0041",
            "duplicate @on modifier on block element",
            last.span.start,
            last.span.end,
            last.name
          );
        }
        on = last.args[0];
      } else {
        if (weight) {
          compilerError(
            this.#reporter,
            "R0041",
            "duplicate @weight modifier on block element",
            last.span.start,
            last.span.end,
            last.name
          );
        }
        weight = last.args[0];
      }

      nodes.pop();
    }

    const sequence = this.trimSequenceWhitespace({
      kind: "sequence",
      nodes
    });

    this.validateNoMisplacedMetadata(sequence, blockStart);

    return {
      sequence,
      ...(on ? { on } : {}),
      ...(weight ? { weight } : {})
    };
  }

  private tryParseBlockEditDirective(): BlockEditDirective | null {
    const start = this.mark();
    this.skipTrivia();

    if (!this.matchesSymbol("@")) {
      this.reset(start);
      return null;
    }

    this.nextToken();
    const keyword = this.parseIdentifier("keyword");
    if (keyword !== "edit") {
      this.reset(start);
      return null;
    }

    this.skipInlineWhitespace();

    let name: string | undefined;
    if (this.matchesSymbol(":")) {
      this.nextToken();
    } else {
      name = this.parseIdentifier("edit binding");
      this.skipInlineWhitespace();
      if (!this.matchesSymbol(":")) {
        syntaxError(
          this.#reporter,
          "expected ':' after @edit binding",
          this.currentIndex(),
          this.currentIndex() + 1,
          "@edit"
        );
      }
      this.nextToken();
    }

    this.skipInlineWhitespace();

    return {
      ...(name ? { name } : {}),
      body: this.trimSequenceWhitespace(
        this.parseSequence(new Set(["|", "}"]), {
          allowSymbolicOperators: true
        })
      )
    };
  }

  private parseHintedNode(): SequenceNode {
    if (this.matchesSymbol("<")) {
      return this.parseAngleNode();
    }
    if (this.matchesSymbol("{")) {
      return this.parseBlock(false);
    }
    if (this.matchesSymbol("[")) {
      return this.parseBracketNode();
    }
    if (this.matchesSymbol("(")) {
      return this.parseParenNode();
    }
    if (this.matchesType("string")) {
      return this.parseStringLiteral();
    }

    const number = this.tryParseNumberLiteral();
    if (number) {
      return number;
    }

    compilerError(
      this.#reporter,
      "R0131",
      "hint must target a supported expression unit",
      this.currentIndex(),
      this.currentIndex() + 1,
      "`"
    );
  }

  private parseAngleNode(): AngleNode {
    const start = this.currentIndex();
    this.expect("<");
    const statements: AngleStatement[] = [];

    while (true) {
      this.skipInlineWhitespace();
      if (this.trySkipComment()) {
        this.skipInlineWhitespace();
      }

      const token = this.peekToken();
      if (!token || token.type === "eof") {
        syntaxError(
          this.#reporter,
          "unterminated angle expression",
          start,
          this.currentIndex(),
          ">"
        );
      }
      if (this.matchesSymbol(">")) {
        this.nextToken();
        break;
      }

      statements.push(this.parseAngleStatement());
      this.skipInlineWhitespace();

      if (this.matchesSymbol(";")) {
        this.nextToken();
        continue;
      }
      if (this.matchesSymbol(">")) {
        this.nextToken();
        break;
      }

      syntaxError(
        this.#reporter,
        "expected ';' or '>' in angle expression",
        this.currentIndex(),
        this.currentIndex() + 1,
        "angle"
      );
    }

    return {
      kind: "angle",
      statements,
      span: { start, end: this.currentIndex() }
    };
  }

  private parseAngleStatement(): AngleStatement {
    const start = this.currentIndex();
    let define = false;
    let isConst = false;
    let global = false;
    let descope = 0;
    const autoHintText = this.consumeAutoHintText();

    if (this.matchesSymbol("$") || this.matchesSymbol("%")) {
      define = true;
      isConst = this.matchesSymbol("%");
      this.nextToken();
      if (this.matchesSymbol("/")) {
        global = true;
        this.nextToken();
      }
    } else {
      if (this.matchesSymbol("/")) {
        global = true;
        this.nextToken();
      } else {
        while (this.matchesSymbol("^")) {
          descope += 1;
          this.nextToken();
        }
      }
    }

    if (autoHintText && !define) {
      syntaxError(
        this.#reporter,
        "invalid attribute '@text'",
        this.currentIndex(),
        this.currentIndex() + 1,
        "@text"
      );
    }

    let base: Sequence | undefined;
    if (this.matchesSymbol("(")) {
      if (define || global || descope > 0 || autoHintText) {
        syntaxError(
          this.#reporter,
          "anonymous accessors do not support this form",
          start,
          this.currentIndex(),
          "anonymous access"
        );
      }
      base = this.parseAnglePathParenthesizedSequence();
    }

    const pathStart = this.currentIndex();
    const name = base
      ? ""
      : this.matchesSymbol("@")
        ? this.parseAttributeAccessorName()
        : this.parseIdentifier("identifier");
    const path: AnglePathSegment[] = [];

    while (true) {
      this.skipInlineWhitespace();
      if (!this.matchesSymbol("/")) {
        break;
      }
      this.nextToken();
      path.push(this.parseAnglePathSegment(name));
    }

    const displayName = base
      ? this.#reader.source.slice(start, this.currentIndex())
      : this.#reader.source.slice(pathStart, this.currentIndex());
    this.skipInlineWhitespace();

    if (
      !base &&
      name.startsWith("@") &&
      (path.length > 0 ||
        (this.peekValue() != null &&
          !["=", "?=", ";", ">", "?"].includes(this.peekValue() ?? "")))
    ) {
      compilerError(
        this.#reporter,
        "R0205",
        `attribute keyword '${name}' does not support this accessor form`,
        this.currentIndex(),
        this.currentIndex() + 1,
        name
      );
    }

    let fallback: Sequence | undefined;
    if (this.matchesSymbol("?")) {
      this.nextToken();
      this.skipInlineWhitespace();
      fallback = this.trimSequenceWhitespace(
        this.parseSequence(new Set([";", ">"]), {
          allowSymbolicOperators: true
        })
      );
      this.skipInlineWhitespace();
    }

    if (this.matchesSymbol("?=")) {
      if (base) {
        syntaxError(
          this.#reporter,
          "anonymous accessors do not support lazy assignment",
          start,
          this.#reader.index(),
          displayName
        );
      }
      if (fallback) {
        syntaxError(
          this.#reporter,
          "fallback access cannot be combined with assignment",
          pathStart,
          this.#reader.index(),
          displayName
        );
      }
      if (READ_ONLY_ATTRIBUTE_NAMES.has(name.slice(1))) {
        compilerError(
          this.#reporter,
          "R0206",
          `attribute keyword '${name}' is read-only`,
          this.currentIndex(),
          this.currentIndex() + 1,
          name
        );
      }
      this.nextToken();
      this.skipInlineWhitespace();
      return {
        kind: "set",
        span: { start, end: this.currentIndex() },
        ...(base ? { base } : {}),
        name,
        path,
        global,
        descope,
        define,
        isConst,
        isLazy: true,
        value: this.trimSequenceWhitespace(
          this.parseSequence(new Set([";", ">"]), {
            allowSymbolicOperators: true
          })
        )
      };
    }

    if (this.matchesSymbol("^=")) {
      syntaxError(
        this.#reporter,
        "unexpected token: '^='",
        this.currentIndex(),
        this.currentIndex() + 2,
        "^="
      );
    }

    const compoundOp = this.parseCompoundAssignmentOperator();

    if (compoundOp || this.matchesSymbol("=")) {
      if (base && path.length === 0) {
        syntaxError(
          this.#reporter,
          "anonymous assignments require an access path",
          start,
          this.#reader.index(),
          displayName
        );
      }
      if (fallback) {
        syntaxError(
          this.#reporter,
          "fallback access cannot be combined with assignment",
          pathStart,
          this.#reader.index(),
          displayName
        );
      }
      if (READ_ONLY_ATTRIBUTE_NAMES.has(name.slice(1))) {
        compilerError(
          this.#reporter,
          "R0206",
          `attribute keyword '${name}' is read-only`,
          this.currentIndex(),
          this.currentIndex() + 1,
          name
        );
      }
      if (!compoundOp) {
        this.nextToken();
      }
      this.skipInlineWhitespace();
      const value = this.trimSequenceWhitespace(
        this.parseSequence(new Set([";", ">"]), {
          allowSymbolicOperators: true
        })
      );
      const statement: AngleSetStatement = {
        kind: "set",
        span: { start, end: this.currentIndex() },
        ...(base ? { base } : {}),
        name,
        path,
        global,
        descope,
        define,
        isConst,
        isLazy: false,
        ...(compoundOp ? { compoundOp } : {}),
        value
      };
      return statement;
    }

    if (define) {
      return {
        kind: "set",
        span: { start, end: this.currentIndex() },
        ...(base ? { base } : {}),
        name,
        path,
        global,
        descope,
        define,
        isConst,
        isLazy: false,
        value: { kind: "sequence", nodes: [] }
      };
    }

    return {
      kind: "access",
      span: { start, end: this.currentIndex() },
      ...(base ? { base } : {}),
      name,
      path,
      ...(fallback ? { fallback } : {}),
      global,
      descope
    };
  }

  private parseAnglePathSegment(baseName: string): AnglePathSegment {
    this.skipInlineWhitespace();

    if (this.matchesSymbol("..")) {
      this.nextToken();
      this.skipInlineWhitespace();
      const end = this.parseAnglePathBound();
      return end ? { kind: "slice", end } : { kind: "slice" };
    }

    if (this.matchesSymbol("(")) {
      const value = this.parseAnglePathParenthesizedSequence();
      this.skipInlineWhitespace();
      if (this.matchesSymbol("..")) {
        this.nextToken();
        this.skipInlineWhitespace();
        const end = this.parseAnglePathBound();
        return {
          kind: "slice",
          start: value,
          ...(end ? { end } : {})
        };
      }
      return {
        kind: "dynamic",
        value
      };
    }

    const numeric = this.tryParseAnglePathInteger();
    if (numeric) {
      this.skipInlineWhitespace();
      if (this.matchesSymbol("..")) {
        this.nextToken();
        this.skipInlineWhitespace();
        const end = this.parseAnglePathBound();
        return {
          kind: "slice",
          start: numeric,
          ...(end ? { end } : {})
        };
      }
      return {
        kind: "static",
        value: this.sequenceAsStaticPathValue(numeric)
      };
    }

    const value = this.parseIdentifier("identifier");
    this.skipInlineWhitespace();
    if (this.matchesSymbol("..")) {
      compilerError(
        this.#reporter,
        "R0204",
        `invalid slice syntax in access path '${baseName}'`,
        this.currentIndex(),
        this.currentIndex() + 2,
        baseName
      );
    }

    return {
      kind: "static",
      value
    };
  }

  private parseAnglePathBound(): Sequence | null {
    if (this.matchesSymbol("(")) {
      return this.parseAnglePathParenthesizedSequence();
    }

    return this.tryParseAnglePathInteger();
  }

  private parseAnglePathParenthesizedSequence(): Sequence {
    this.expect("(");
    const value = this.trimSequenceWhitespace(
      this.parseSequence(new Set([")"]), { allowSymbolicOperators: true })
    );
    if (!this.matchesSymbol(")")) {
      syntaxError(
        this.#reporter,
        "unterminated access path expression",
        this.currentIndex(),
        this.currentIndex() + 1,
        "path"
      );
    }
    this.nextToken();
    return value;
  }

  private parseParenthesizedGroupSequence(contextName: string): Sequence {
    const start = this.currentIndex();
    this.expect("(");
    const value = this.trimSequenceWhitespace(
      this.parseSequence(new Set([")"]), { allowSymbolicOperators: true })
    );
    if (!this.matchesSymbol(")")) {
      syntaxError(
        this.#reporter,
        `unterminated ${contextName} expression`,
        start,
        this.currentIndex(),
        contextName
      );
    }
    this.nextToken();
    return value;
  }

  private tryParseAnglePathInteger(): Sequence | null {
    const token = this.peekToken();
    if (token?.type !== "number" || !INTEGER_PATTERN.test(token.value)) {
      return null;
    }
    this.nextToken();

    return {
      kind: "sequence",
      nodes: [
        {
          kind: "number",
          value: BigInt(token.value),
          span: { start: token.start, end: token.end }
        }
      ]
    };
  }

  private sequenceAsStaticPathValue(sequence: Sequence): string {
    const node = sequence.nodes[0];
    if (sequence.nodes.length !== 1 || node?.kind !== "number") {
      return "";
    }
    return String(node.value);
  }

  private parseCompoundAssignmentOperator():
    | "add"
    | "sub"
    | "mul"
    | "div"
    | "mod"
    | "pow"
    | "and"
    | "or"
    | "xor"
    | undefined {
    const symbol = this.peekValue();

    switch (symbol) {
      case "**=":
        this.nextToken();
        return "pow";
      case "+=":
        this.nextToken();
        return "add";
      case "-=":
        this.nextToken();
        return "sub";
      case "*=":
        this.nextToken();
        return "mul";
      case "/=":
        this.nextToken();
        return "div";
      case "%=":
        this.nextToken();
        return "mod";
      case "&=":
        this.nextToken();
        return "and";
      case "|=":
        this.nextToken();
        return "or";
      default:
        return undefined;
    }
  }

  private consumeAutoHintText(): boolean {
    const start = this.mark();
    if (!this.matchesSymbol("@")) {
      return false;
    }

    this.nextToken();
    const ident = this.parseIdentifier("attribute");
    if (ident !== "text") {
      this.reset(start);
      return false;
    }

    this.skipInlineWhitespace();
    return true;
  }

  private parseIdentifier(contextName: string): string {
    const token = this.peekToken();
    const start = this.currentIndex();
    if (token?.type !== "identifier" || !IDENTIFIER_PATTERN.test(token.value)) {
      const value = tokenValue(token);
      if (value != null) {
        syntaxError(
          this.#reporter,
          `'${value}' is not a valid identifier; identifiers may only use alphanumerics, underscores, and hyphens (but cannot be only digits)`,
          start,
          tokenEnd(token, start + 1),
          value
        );
      }
      syntaxError(
        this.#reporter,
        `invalid ${contextName} '${tokenValue(token) ?? ""}'`,
        start,
        tokenEnd(token, start + 1),
        tokenValue(token) || contextName
      );
    }
    this.nextToken();
    return token.value;
  }

  private parseAttributeAccessorName(): string {
    const start = this.currentIndex();
    this.expect("@");
    const attr = this.parseIdentifier("attribute");

    if (
      !MUTABLE_ATTRIBUTE_NAMES.has(attr) &&
      !READ_ONLY_ATTRIBUTE_NAMES.has(attr)
    ) {
      syntaxError(
        this.#reporter,
        `invalid attribute '@${attr}'`,
        start,
        this.currentIndex(),
        `@${attr}`
      );
    }

    return `@${attr}`;
  }

  private parsePathIdentifier(contextName: string): string {
    const start = this.currentIndex();
    let value = this.parseIdentifier(contextName);

    while (this.matchesSymbol("/")) {
      this.nextToken();
      const segment = this.parseIdentifier(contextName);
      value += `/${segment}`;
    }

    if (!PATH_PATTERN.test(value)) {
      syntaxError(
        this.#reporter,
        `invalid ${contextName} '${value}'`,
        start,
        this.currentIndex(),
        value || contextName
      );
    }

    return value;
  }

  private makeKeywordOperatorToken(
    start: number,
    op: Extract<
      OperatorTokenName,
      "not" | "neg" | "eq" | "neq" | "lt" | "le" | "gt" | "ge"
    >
  ): OperatorTokenNode {
    return {
      kind: "operator-token",
      op,
      span: { start, end: this.currentIndex() }
    };
  }

  private parseSymbolOperator(): OperatorTokenNode {
    const start = this.currentIndex();
    const symbol = this.peekValue();
    this.nextToken();

    switch (symbol) {
      case "+":
        return {
          kind: "operator-token",
          op: "add",
          span: { start, end: this.currentIndex() }
        };
      case "-":
        return {
          kind: "operator-token",
          op: "sub",
          span: { start, end: this.currentIndex() }
        };
      case "*":
        return {
          kind: "operator-token",
          op: "mul",
          span: { start, end: this.currentIndex() }
        };
      case "**":
        return {
          kind: "operator-token",
          op: "pow",
          span: { start, end: this.currentIndex() }
        };
      case "/":
        return {
          kind: "operator-token",
          op: "div",
          span: { start, end: this.currentIndex() }
        };
      case "%":
        return {
          kind: "operator-token",
          op: "mod",
          span: { start, end: this.currentIndex() }
        };
      case "&":
        return {
          kind: "operator-token",
          op: "and",
          span: { start, end: this.currentIndex() }
        };
      case "|":
        return {
          kind: "operator-token",
          op: "or",
          span: { start, end: this.currentIndex() }
        };
      case "^":
        return {
          kind: "operator-token",
          op: "xor",
          span: { start, end: this.currentIndex() }
        };
      default:
        syntaxError(
          this.#reporter,
          `unsupported syntax starting with '${symbol ?? ""}'`,
          start,
          this.currentIndex(),
          symbol ?? ""
        );
    }
  }

  private foldOperators(rawNodes: readonly WorkingNode[]): SequenceNode[] {
    if (!rawNodes.some((node) => node.kind === "operator-token")) {
      return rawNodes as SequenceNode[];
    }

    let nodes = rawNodes.filter(
      (node) => !this.isDiscardableOperatorWhitespace(node)
    );

    nodes = this.foldPrefixOperators(nodes);
    nodes = this.foldBinaryOperators(nodes, new Set(["pow"]));
    nodes = this.foldBinaryOperators(nodes, new Set(["mul", "div", "mod"]));
    nodes = this.foldBinaryOperators(nodes, new Set(["add", "sub"]));
    nodes = this.foldBinaryOperators(
      nodes,
      new Set(["eq", "neq", "lt", "le", "gt", "ge"])
    );
    nodes = this.foldBinaryOperators(nodes, new Set(["and", "or", "xor"]));

    const leftover = nodes.find((node) => node.kind === "operator-token");
    if (leftover) {
      syntaxError(
        this.#reporter,
        `invalid use of operator '${this.operatorDisplay(leftover.op)}'`,
        leftover.span.start,
        leftover.span.end,
        this.operatorDisplay(leftover.op)
      );
    }

    return nodes as SequenceNode[];
  }

  private foldPrefixOperators(nodes: readonly WorkingNode[]): WorkingNode[] {
    const result: WorkingNode[] = [];

    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      if (!node) {
        continue;
      }
      if (
        node?.kind === "operator-token" &&
        (node.op === "not" || node.op === "neg")
      ) {
        const operand = nodes[index + 1];
        if (!operand || operand.kind === "operator-token") {
          syntaxError(
            this.#reporter,
            `missing operand for '${this.operatorDisplay(node.op)}'`,
            node.span.start,
            node.span.end,
            this.operatorDisplay(node.op)
          );
        }
        const unary: UnaryOpNode = {
          kind: "unary-op",
          op: node.op,
          operand: this.sequenceOf(operand),
          span: { start: node.span.start, end: operand.span.end }
        };
        result.push(unary);
        index += 1;
        continue;
      }
      result.push(node);
    }

    return result;
  }

  private foldBinaryOperators(
    nodes: readonly WorkingNode[],
    ops: ReadonlySet<BinaryOperatorName>
  ): WorkingNode[] {
    const result: WorkingNode[] = [];

    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      if (!node) {
        continue;
      }
      if (
        node?.kind === "operator-token" &&
        node.op !== "not" &&
        node.op !== "neg" &&
        ops.has(node.op)
      ) {
        const left = result.pop();
        const right = nodes[index + 1];
        if (
          !left ||
          left.kind === "operator-token" ||
          !right ||
          right.kind === "operator-token"
        ) {
          syntaxError(
            this.#reporter,
            `missing operand for '${this.operatorDisplay(node.op)}'`,
            node.span.start,
            node.span.end,
            this.operatorDisplay(node.op)
          );
        }
        const binary: BinaryOpNode = {
          kind: "binary-op",
          op: node.op,
          left: this.sequenceOf(left),
          right: this.sequenceOf(right),
          span: { start: left.span.start, end: right.span.end }
        };
        result.push(binary);
        index += 1;
        continue;
      }
      result.push(node);
    }

    return result;
  }

  private sequenceOf(node: SequenceNode): Sequence {
    return {
      kind: "sequence",
      nodes: [node]
    };
  }

  private isDiscardableOperatorWhitespace(node: WorkingNode): boolean {
    return node.kind === "text" && node.value.trim().length === 0;
  }

  private operatorDisplay(op: OperatorTokenName): string {
    switch (op) {
      case "pow":
        return "**";
      case "mul":
        return "*";
      case "div":
        return "/";
      case "mod":
        return "%";
      case "and":
        return "&";
      case "or":
        return "|";
      case "xor":
        return "^";
      case "add":
        return "+";
      case "sub":
        return "-";
      default:
        return `@${op}`;
    }
  }

  private skipInlineWhitespace(): void {
    while (this.matchesType("whitespace")) {
      this.nextToken();
    }
  }

  private trimSequenceWhitespace(sequence: Sequence): Sequence {
    const nodes = [...sequence.nodes];
    const first = nodes[0];
    if (first?.kind === "text") {
      const trimmed = this.trimTextNodeEdge(first, "start");
      if (trimmed == null) {
        nodes.shift();
      } else if (trimmed !== first) {
        nodes[0] = trimmed;
      }
    }

    const last = nodes.at(-1);
    if (last?.kind === "text") {
      const trimmed = this.trimTextNodeEdge(last, "end");
      if (trimmed == null) {
        nodes.pop();
      } else if (trimmed !== last) {
        nodes[nodes.length - 1] = trimmed;
      }
    }

    return {
      kind: "sequence",
      nodes
    };
  }

  private trimTextNodeEdge(
    node: Extract<SequenceNode, { readonly kind: "text" }>,
    edge: "start" | "end"
  ): Extract<SequenceNode, { readonly kind: "text" }> | null {
    const raw = this.#reader.source.slice(node.span.start, node.span.end);
    const trimmedRaw =
      edge === "start" ? raw.replace(/^\s+/u, "") : raw.replace(/\s+$/u, "");
    if (trimmedRaw === raw) {
      return node;
    }
    if (trimmedRaw.length === 0) {
      return null;
    }

    const removed = raw.length - trimmedRaw.length;
    return {
      ...node,
      value: decodeTextEscapes(trimmedRaw),
      span: {
        start: edge === "start" ? node.span.start + removed : node.span.start,
        end: edge === "end" ? node.span.end - removed : node.span.end
      }
    };
  }

  private normalizeInvocationArg(sequence: Sequence): Sequence {
    const trimmed = this.trimSequenceWhitespace(sequence);
    const removedOnlyWhitespace =
      trimmed.nodes.length === 0 &&
      sequence.nodes.some(
        (node) => node.kind === "text" && node.value.trim().length === 0
      );

    if (
      sequence.nodes.length === 1 &&
      trimmed.nodes.length === 1 &&
      sequence.nodes[0]?.kind === "text" &&
      trimmed.nodes[0]?.kind === "text" &&
      sequence.nodes[0].value !== trimmed.nodes[0].value &&
      /^[^\p{L}\p{N}_-]+$/u.test(trimmed.nodes[0].value)
    ) {
      return sequence;
    }

    return removedOnlyWhitespace ? sequence : trimmed;
  }

  private trySkipComment(): boolean {
    if (!this.matchesType("comment")) {
      return false;
    }

    this.nextToken();
    return true;
  }

  private trimTrailingWhitespace(nodes: WorkingNode[]): void {
    const last = nodes.at(-1);
    if (!last || last.kind !== "text") {
      return;
    }

    const trimmed = this.trimTextNodeEdge(last, "end");
    if (trimmed === last) {
      return;
    }
    if (trimmed == null) {
      nodes.pop();
      return;
    }

    nodes[nodes.length - 1] = trimmed;
  }

  private validateNoMisplacedMetadata(
    sequence: Sequence,
    _contextStart = 0
  ): void {
    for (const node of sequence.nodes) {
      if (
        node.kind === "invoke" &&
        (node.name === "@on" || node.name === "@weight")
      ) {
        compilerError(
          this.#reporter,
          "R0207",
          `${node.name} is not allowed in this context`,
          node.span.start,
          node.span.end,
          node.name
        );
      }

      if (node.kind === "block") {
        for (const element of node.elements) {
          this.validateNoMisplacedMetadata(element.sequence);
          if (element.edit) {
            this.validateNoMisplacedMetadata(element.edit.body);
          }
          if (element.on) {
            this.validateNoMisplacedMetadata(element.on);
          }
          if (element.weight) {
            this.validateNoMisplacedMetadata(element.weight);
          }
        }
        continue;
      }

      if (node.kind === "function") {
        this.validateNoMisplacedMetadata(node.body);
        continue;
      }

      if (node.kind === "angle") {
        for (const statement of node.statements) {
          if (statement.base) {
            this.validateNoMisplacedMetadata(statement.base);
          }
          for (const segment of statement.path) {
            if (segment.kind === "dynamic") {
              this.validateNoMisplacedMetadata(segment.value);
            } else if (segment.kind === "slice") {
              if (segment.start) {
                this.validateNoMisplacedMetadata(segment.start);
              }
              if (segment.end) {
                this.validateNoMisplacedMetadata(segment.end);
              }
            }
          }
          if (statement.kind === "access" && statement.fallback) {
            this.validateNoMisplacedMetadata(statement.fallback);
          }
          if (statement.kind === "set") {
            this.validateNoMisplacedMetadata(statement.value);
          }
        }
        continue;
      }

      if (node.kind === "spread") {
        this.validateNoMisplacedMetadata(node.value);
        continue;
      }

      if (node.kind === "invoke") {
        for (const arg of node.args) {
          this.validateNoMisplacedMetadata(arg);
        }
        continue;
      }

      if (node.kind === "list" || node.kind === "tuple") {
        for (const item of node.items) {
          this.validateNoMisplacedMetadata(item);
        }
        continue;
      }

      if (node.kind === "map") {
        for (const entry of node.entries) {
          this.validateNoMisplacedMetadata(entry.value);
        }
        continue;
      }

      if (node.kind === "unary-op") {
        this.validateNoMisplacedMetadata(node.operand);
        continue;
      }

      if (node.kind === "binary-op") {
        this.validateNoMisplacedMetadata(node.left);
        this.validateNoMisplacedMetadata(node.right);
      }
    }
  }

  private validateBindingRules(sequence: Sequence): void {
    const locals: Map<string, TrackedBinding>[] = [new Map()];
    const globals = new Map<string, TrackedBinding>();
    this.validateSequenceBindings(sequence, locals, globals);
  }

  private reportUnusedTopLevelBindings(sequence: Sequence): void {
    const definitions: Array<{
      readonly name: string;
      readonly start: number;
      readonly end: number;
    }> = [];

    for (const node of sequence.nodes) {
      if (node.kind === "angle") {
        for (const statement of node.statements) {
          if (
            statement.kind === "set" &&
            statement.define &&
            !statement.base &&
            !statement.name.startsWith("@")
          ) {
            definitions.push({
              name: this.rootBindingName(statement.name),
              start: statement.span.start,
              end: statement.span.end
            });
          }
        }
        continue;
      }

      if (
        node.kind === "function" &&
        node.name != null &&
        !node.name.startsWith("@")
      ) {
        definitions.push({
          name: this.rootBindingName(node.name),
          start: node.span.start,
          end: node.span.end
        });
      }
    }

    if (definitions.length === 0) {
      return;
    }

    const references = new Set<string>();
    this.collectReferencedBindings(sequence, references);

    for (const definition of definitions) {
      if (definition.name === "module" || references.has(definition.name)) {
        continue;
      }
      reportCompilerMessage(
        this.#reporter,
        "W0001",
        `variable '${definition.name}' defined but never used`,
        "warning",
        definition.start,
        definition.end,
        definition.name
      );
    }
  }

  private collectReferencedBindings(
    sequence: Sequence,
    references: Set<string>
  ): void {
    for (const node of sequence.nodes) {
      switch (node.kind) {
        case "text":
        case "string":
        case "number":
        case "pipe-value":
          continue;
        case "map":
          for (const entry of node.entries) {
            this.collectReferencedBindings(entry.value, references);
          }
          continue;
        case "list":
        case "tuple":
          for (const item of node.items) {
            this.collectReferencedBindings(item, references);
          }
          continue;
        case "unary-op":
          this.collectReferencedBindings(node.operand, references);
          continue;
        case "binary-op":
          this.collectReferencedBindings(node.left, references);
          this.collectReferencedBindings(node.right, references);
          continue;
        case "spread":
          this.collectReferencedBindings(node.value, references);
          continue;
        case "invoke":
          if (!node.name.startsWith("@")) {
            references.add(this.rootBindingName(node.name));
          }
          for (const arg of node.args) {
            this.collectReferencedBindings(arg, references);
          }
          continue;
        case "block":
          for (const element of node.elements) {
            this.collectReferencedBindings(element.sequence, references);
            if (element.edit) {
              this.collectReferencedBindings(element.edit.body, references);
            }
            if (element.on) {
              this.collectReferencedBindings(element.on, references);
            }
            if (element.weight) {
              this.collectReferencedBindings(element.weight, references);
            }
          }
          continue;
        case "angle":
          for (const statement of node.statements) {
            if (statement.base) {
              this.collectReferencedBindings(statement.base, references);
            } else if (
              statement.kind === "access" ||
              !statement.define ||
              statement.path.length > 0
            ) {
              references.add(this.rootBindingName(statement.name));
            }

            for (const segment of statement.path) {
              if (segment.kind === "dynamic") {
                this.collectReferencedBindings(segment.value, references);
              } else if (segment.kind === "slice") {
                if (segment.start) {
                  this.collectReferencedBindings(segment.start, references);
                }
                if (segment.end) {
                  this.collectReferencedBindings(segment.end, references);
                }
              }
            }

            if (statement.kind === "access") {
              if (statement.fallback) {
                this.collectReferencedBindings(statement.fallback, references);
              }
            } else {
              this.collectReferencedBindings(statement.value, references);
            }
          }
          continue;
        case "function":
          this.collectReferencedBindings(node.body, references);
          continue;
      }
    }
  }

  private validateSequenceBindings(
    sequence: Sequence,
    locals: Map<string, TrackedBinding>[],
    globals: Map<string, TrackedBinding>
  ): void {
    for (const node of sequence.nodes) {
      this.validateBindingNode(node, locals, globals);
    }
  }

  private validateBindingNode(
    node: SequenceNode,
    locals: Map<string, TrackedBinding>[],
    globals: Map<string, TrackedBinding>
  ): void {
    switch (node.kind) {
      case "text":
      case "string":
      case "number":
      case "pipe-value":
        return;
      case "map":
        for (const entry of node.entries) {
          this.validateSequenceBindings(entry.value, locals, globals);
        }
        return;
      case "list":
      case "tuple":
        for (const item of node.items) {
          this.validateSequenceBindings(item, locals, globals);
        }
        return;
      case "unary-op":
        this.validateSequenceBindings(node.operand, locals, globals);
        return;
      case "binary-op":
        this.validateSequenceBindings(node.left, locals, globals);
        this.validateSequenceBindings(node.right, locals, globals);
        return;
      case "spread":
        this.validateSequenceBindings(node.value, locals, globals);
        return;
      case "invoke": {
        const binding = this.resolveTrackedBinding(
          this.rootBindingName(node.name),
          false,
          0,
          locals,
          globals
        );
        if (
          binding?.role === "fallible_optional_arg" &&
          !node.name.startsWith("@") &&
          !node.name.includes("/")
        ) {
          compilerError(
            this.#reporter,
            "R0067",
            `access to optional argument '${node.name}' can fail; add a fallback to the accessor or specify a default argument`,
            node.span.start,
            node.span.end,
            node.name
          );
        }
        for (const arg of node.args) {
          this.validateSequenceBindings(arg, locals, globals);
        }
        return;
      }
      case "block":
        locals.push(new Map());
        try {
          for (const element of node.elements) {
            this.validateSequenceBindings(element.sequence, locals, globals);
            if (element.edit) {
              this.validateSequenceBindings(element.edit.body, locals, globals);
            }
            if (element.on) {
              this.validateSequenceBindings(element.on, locals, globals);
            }
            if (element.weight) {
              this.validateSequenceBindings(element.weight, locals, globals);
            }
          }
        } finally {
          locals.pop();
        }
        return;
      case "function":
        if (node.name != null && !node.name.includes("/")) {
          this.trackBindingDefinition(
            node.name,
            node.global,
            node.descope,
            node.isConst,
            "normal",
            node.span.start,
            node.span.end,
            locals,
            globals
          );
        }

        locals.push(new Map());
        try {
          for (const param of node.params) {
            if (param.isLazy && param.variadic !== "none") {
              compilerError(
                this.#reporter,
                "R0029",
                "lazy parameters cannot be variadic",
                param.span.start,
                param.span.end,
                param.name
              );
            }

            if (param.defaultValue) {
              this.validateSequenceBindings(
                param.defaultValue,
                locals,
                globals
              );
            }

            this.trackBindingDefinition(
              param.name,
              false,
              0,
              false,
              param.optional && !param.defaultValue
                ? "fallible_optional_arg"
                : "normal",
              param.span.start,
              param.span.end,
              locals,
              globals
            );
          }

          this.validateSequenceBindings(node.body, locals, globals);
        } finally {
          locals.pop();
        }
        return;
      case "angle":
        for (const statement of node.statements) {
          if (statement.base) {
            this.validateSequenceBindings(statement.base, locals, globals);
          }
          for (const segment of statement.path) {
            if (segment.kind === "dynamic") {
              this.validateSequenceBindings(segment.value, locals, globals);
            } else if (segment.kind === "slice") {
              if (segment.start) {
                this.validateSequenceBindings(segment.start, locals, globals);
              }
              if (segment.end) {
                this.validateSequenceBindings(segment.end, locals, globals);
              }
            }
          }

          if (statement.kind === "access") {
            if (statement.fallback) {
              this.validateSequenceBindings(
                statement.fallback,
                locals,
                globals
              );
            } else if (!statement.base) {
              const binding = this.resolveTrackedBinding(
                statement.name,
                statement.global,
                statement.descope,
                locals,
                globals
              );
              if (binding?.role === "fallible_optional_arg") {
                compilerError(
                  this.#reporter,
                  "R0067",
                  `access to optional argument '${statement.name}' can fail; add a fallback to the accessor or specify a default argument`,
                  statement.span.start,
                  statement.span.end,
                  statement.name
                );
              }
            }
            continue;
          }

          this.validateSequenceBindings(statement.value, locals, globals);

          if (statement.define) {
            this.trackBindingDefinition(
              statement.name,
              statement.global,
              statement.descope,
              statement.isConst,
              "normal",
              statement.span.start,
              statement.span.end,
              locals,
              globals
            );
            continue;
          }

          const binding = this.resolveTrackedBinding(
            statement.name,
            statement.global,
            statement.descope,
            locals,
            globals
          );
          if (binding?.isConst) {
            compilerError(
              this.#reporter,
              "R0100",
              `reassignment of known constant '${statement.name}'`,
              statement.span.start,
              statement.span.end,
              statement.name
            );
          }
        }
        return;
    }
  }

  private resolveTrackedBinding(
    name: string,
    global: boolean,
    descope: number,
    locals: readonly Map<string, TrackedBinding>[],
    globals: ReadonlyMap<string, TrackedBinding>
  ): TrackedBinding | undefined {
    const baseName = this.rootBindingName(name);

    if (global) {
      return globals.get(baseName);
    }

    if (descope > 0) {
      return (
        locals[locals.length - 1 - descope]?.get(baseName) ??
        globals.get(baseName)
      );
    }

    for (let index = locals.length - 1; index >= 0; index -= 1) {
      const binding = locals[index]?.get(baseName);
      if (binding) {
        return binding;
      }
    }

    return globals.get(baseName);
  }

  private trackBindingDefinition(
    name: string,
    global: boolean,
    descope: number,
    isConst: boolean,
    role: BindingRole,
    start: number,
    end: number,
    locals: Map<string, TrackedBinding>[],
    globals: Map<string, TrackedBinding>
  ): void {
    const baseName = this.rootBindingName(name);
    const target = global
      ? globals
      : descope > 0
        ? locals[locals.length - 1 - descope]
        : locals[locals.length - 1];

    if (!target) {
      return;
    }

    if (target.get(baseName)?.isConst) {
      compilerError(
        this.#reporter,
        "R0101",
        `redefinition of known constant '${baseName}'`,
        start,
        end,
        baseName
      );
    }

    target.set(baseName, {
      isConst,
      role
    });
  }

  private rootBindingName(name: string): string {
    return name.split("/")[0] ?? name;
  }

  private replacePipeValueInSequence(
    sequence: Sequence,
    replacement: Sequence
  ): { readonly sequence: Sequence; readonly used: boolean } {
    const nodes: SequenceNode[] = [];
    let used = false;

    for (const node of sequence.nodes) {
      const replaced = this.replacePipeValueInNode(node, replacement);
      used ||= replaced.used;
      nodes.push(...replaced.nodes);
    }

    return {
      sequence: {
        kind: "sequence",
        nodes
      },
      used
    };
  }

  private replacePipeValueInNode(
    node: SequenceNode,
    replacement: Sequence
  ): { readonly nodes: readonly SequenceNode[]; readonly used: boolean } {
    if (node.kind === "pipe-value") {
      return {
        nodes: [...replacement.nodes],
        used: true
      };
    }

    if (node.kind === "invoke") {
      let used = false;
      const args = node.args.map((arg) => {
        const replaced = this.replacePipeValueInSequence(arg, replacement);
        used ||= replaced.used;
        return replaced.sequence;
      });
      return { nodes: [{ ...node, args }], used };
    }

    if (node.kind === "spread") {
      const replaced = this.replacePipeValueInSequence(node.value, replacement);
      return {
        nodes: [{ ...node, value: replaced.sequence }],
        used: replaced.used
      };
    }

    if (node.kind === "list" || node.kind === "tuple") {
      let used = false;
      const items = node.items.map((item) => {
        const replaced = this.replacePipeValueInSequence(item, replacement);
        used ||= replaced.used;
        return replaced.sequence;
      });
      return { nodes: [{ ...node, items }], used };
    }

    if (node.kind === "map") {
      let used = false;
      const entries = node.entries.map((entry) => {
        const replaced = this.replacePipeValueInSequence(
          entry.value,
          replacement
        );
        used ||= replaced.used;
        return { ...entry, value: replaced.sequence };
      });
      return { nodes: [{ ...node, entries }], used };
    }

    if (node.kind === "unary-op") {
      const replaced = this.replacePipeValueInSequence(
        node.operand,
        replacement
      );
      return {
        nodes: [{ ...node, operand: replaced.sequence }],
        used: replaced.used
      };
    }

    if (node.kind === "binary-op") {
      const left = this.replacePipeValueInSequence(node.left, replacement);
      const right = this.replacePipeValueInSequence(node.right, replacement);
      return {
        nodes: [{ ...node, left: left.sequence, right: right.sequence }],
        used: left.used || right.used
      };
    }

    if (node.kind === "function") {
      const body = this.replacePipeValueInSequence(node.body, replacement);
      return { nodes: [{ ...node, body: body.sequence }], used: body.used };
    }

    if (node.kind === "block") {
      let used = false;
      const elements = node.elements.map((element) => {
        const sequence = this.replacePipeValueInSequence(
          element.sequence,
          replacement
        );
        used ||= sequence.used;
        const edit = element.edit
          ? this.replacePipeValueInSequence(element.edit.body, replacement)
          : null;
        const on = element.on
          ? this.replacePipeValueInSequence(element.on, replacement)
          : null;
        const weight = element.weight
          ? this.replacePipeValueInSequence(element.weight, replacement)
          : null;
        used ||= edit?.used ?? false;
        used ||= on?.used ?? false;
        used ||= weight?.used ?? false;
        return {
          sequence: sequence.sequence,
          ...(edit
            ? {
                edit: {
                  ...(element.edit?.name ? { name: element.edit.name } : {}),
                  body: edit.sequence
                } satisfies BlockEditDirective
              }
            : {}),
          ...(on ? { on: on.sequence } : {}),
          ...(weight ? { weight: weight.sequence } : {})
        };
      });
      return { nodes: [{ ...node, elements }], used };
    }

    if (node.kind === "angle") {
      let used = false;
      const statements = node.statements.map((statement) => {
        const base = statement.base
          ? this.replacePipeValueInSequence(statement.base, replacement)
          : null;
        used ||= base?.used ?? false;
        const path = statement.path.map((segment) => {
          if (segment.kind === "dynamic") {
            const replaced = this.replacePipeValueInSequence(
              segment.value,
              replacement
            );
            used ||= replaced.used;
            return { ...segment, value: replaced.sequence };
          }
          if (segment.kind === "slice") {
            const start = segment.start
              ? this.replacePipeValueInSequence(segment.start, replacement)
              : null;
            const end = segment.end
              ? this.replacePipeValueInSequence(segment.end, replacement)
              : null;
            used ||= start?.used ?? false;
            used ||= end?.used ?? false;
            return {
              ...segment,
              ...(start ? { start: start.sequence } : {}),
              ...(end ? { end: end.sequence } : {})
            };
          }
          return segment;
        });

        if (statement.kind === "access") {
          const fallback = statement.fallback
            ? this.replacePipeValueInSequence(statement.fallback, replacement)
            : null;
          used ||= fallback?.used ?? false;
          return {
            ...statement,
            ...(base ? { base: base.sequence } : {}),
            path,
            ...(fallback ? { fallback: fallback.sequence } : {})
          };
        }

        const value = this.replacePipeValueInSequence(
          statement.value,
          replacement
        );
        used ||= value.used;
        return {
          ...statement,
          ...(base ? { base: base.sequence } : {}),
          path,
          value: value.sequence
        };
      });
      return { nodes: [{ ...node, statements }], used };
    }

    return { nodes: [node], used: false };
  }

  private expect(char: string): void {
    const token = this.nextToken();
    if (token?.type !== "symbol" || token.value !== char) {
      const start = token?.start ?? this.currentIndex();
      syntaxError(this.#reporter, `expected '${char}'`, start, start + 1, char);
    }
  }
}

export function parse(source: string, reporter: Reporter): Sequence {
  return parseTokens(lex(source, reporter), source, reporter);
}

export function parseTokens(
  tokens: readonly RantyToken[],
  source: string,
  reporter: Reporter
): Sequence {
  return new Parser(new TokenReader(tokens, source), reporter).parse();
}
