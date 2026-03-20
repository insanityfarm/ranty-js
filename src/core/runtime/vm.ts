import { RuntimeError, RuntimeErrorType } from "../errors";
import { toExactInt } from "../int64";
import { lazyBinding, valueBinding, type RantyBinding } from "../binding";
import type {
  AngleAccessStatement,
  AnglePathSegment,
  AngleNode,
  AngleSetStatement,
  BinaryOpNode,
  BlockElementNode,
  BlockNode,
  FunctionDefNode,
  InvocationNode,
  ListLiteralNode,
  Sequence,
  SequenceNode
} from "../lang";
import { getMapChainValue } from "../map-proto";
import type { RantyProgram } from "../program";
import type { Ranty } from "../ranty";
import {
  areEqual,
  asInteger,
  expectArgCount,
  isTruthy,
  toFloat
} from "../stdlib/shared";
import { renderRantyValue } from "../util";
import {
  getCollectionKind,
  isTemporalValue,
  makeCollectionValue,
  makeListValue,
  makeTemporalValue,
  makeTupleValue,
  type RantyRange,
  type RantyAttributeValue,
  type RantySelectorValue,
  type RantyValue
} from "../values";

const BRANCH_ATTRIBUTES = new Set<RantyAttributeValue["name"]>([
  "if",
  "elseif",
  "else"
]);
const SILENT_ATTRIBUTE_INVOCATIONS = new Set([
  "rep",
  "sep",
  "sel",
  "if",
  "elseif",
  "else",
  "match",
  "mut",
  "reset-attrs"
]);
const SILENT_SIDE_EFFECT_INVOCATIONS = new Set([
  "@require",
  "set-proto",
  "remove",
  "take"
]);
const USER_FUNCTION = Symbol("ranty-js.user-function");

interface UserFunctionMeta {
  readonly node: FunctionDefNode;
  readonly scopes: readonly Map<string, RantyBinding>[];
}

type UserFunctionValue = ((...args: readonly RantyValue[]) => RantyValue) & {
  readonly [USER_FUNCTION]?: UserFunctionMeta;
};

class ReturnSignal {
  readonly value: RantyValue;

  constructor(value: RantyValue) {
    this.value = value;
  }
}

class ContinueSignal {
  readonly value: RantyValue;

  constructor(value: RantyValue) {
    this.value = value;
  }
}

class BreakSignal {
  readonly value: RantyValue;

  constructor(value: RantyValue) {
    this.value = value;
  }
}

interface ActiveBlockState {
  stepIndex: number;
  readonly totalSteps: number | null;
  readonly isRepeater: boolean;
}

interface BlockRepetitionPlan {
  readonly count: number | null;
  readonly totalSteps: number | null;
}

interface TemporalArgBinding {
  readonly index: number;
  readonly values: readonly RantyValue[];
}

interface TemporalDimension {
  readonly bindings: readonly TemporalArgBinding[];
  readonly length: number;
}

interface PendingBranchAttribute {
  readonly type: "branch-attribute";
  readonly name: "if" | "elseif" | "else";
  readonly condition?: Sequence;
}

type PendingAttribute = RantyAttributeValue | PendingBranchAttribute;

function isAttributeValue(value: unknown): value is RantyAttributeValue {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "attribute"
  );
}

function isSelectorValue(value: unknown): value is RantySelectorValue {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "selector"
  );
}

function isRangeValue(value: unknown): value is RantyRange {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "range"
  );
}

function rangeStep(range: RantyRange): bigint | number {
  const isBig =
    typeof range.start === "bigint" ||
    typeof range.end === "bigint" ||
    typeof range.start === "object" ||
    typeof range.end === "object" ||
    typeof range.step === "bigint" ||
    typeof range.step === "object";

  if (range.step !== undefined) {
    if (isBig) {
      const raw =
        typeof range.step === "bigint" ? range.step : toExactInt(range.step);
      if (raw === 0n) {
        return 0n;
      }
      const magnitude = raw < 0n ? -raw : raw;
      return toExactInt(range.start) <= toExactInt(range.end)
        ? magnitude
        : -magnitude;
    }

    const raw = Number(range.step);
    if (raw === 0) {
      return 0;
    }
    const magnitude = Math.abs(raw);
    return Number(range.start) <= Number(range.end) ? magnitude : -magnitude;
  }
  if (
    typeof range.start === "bigint" ||
    typeof range.end === "bigint" ||
    typeof range.start === "object" ||
    typeof range.end === "object"
  ) {
    return toExactInt(range.start) <= toExactInt(range.end) ? 1n : -1n;
  }
  return Number(range.start) <= Number(range.end) ? 1 : -1;
}

function rangeLength(range: RantyRange): number {
  const step = rangeStep(range);

  if (
    typeof range.start === "bigint" ||
    typeof range.end === "bigint" ||
    typeof step === "bigint" ||
    typeof range.start === "object" ||
    typeof range.end === "object"
  ) {
    const start = toExactInt(range.start);
    const end = toExactInt(range.end);
    const stride = typeof step === "bigint" ? step : toExactInt(step);
    if (stride === 0n) {
      return 0;
    }
    if ((stride > 0n && start >= end) || (stride < 0n && start <= end)) {
      return 0;
    }
    const distance = stride > 0n ? end - start : start - end;
    const magnitude = stride > 0n ? stride : -stride;
    return Number((distance + magnitude - 1n) / magnitude);
  }

  const start = Number(range.start);
  const end = Number(range.end);
  const stride = Number(step);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    !Number.isFinite(stride) ||
    stride === 0
  ) {
    return 0;
  }
  if ((stride > 0 && start >= end) || (stride < 0 && start <= end)) {
    return 0;
  }
  return Math.max(0, Math.ceil(Math.abs((end - start) / stride)));
}

function rangeValueAt(range: RantyRange, index: number): RantyValue {
  const step = rangeStep(range);
  if (
    typeof range.start === "bigint" ||
    typeof step === "bigint" ||
    typeof range.start === "object"
  ) {
    const start = toExactInt(range.start);
    const stride = typeof step === "bigint" ? step : toExactInt(step);
    return start + BigInt(index) * stride;
  }

  return Number(range.start) + index * Number(step);
}

function addValues(left: RantyValue, right: RantyValue): RantyValue {
  if (left == null && right == null) {
    return null;
  }
  if (right == null) {
    return left;
  }
  if (left == null) {
    return right;
  }

  if (typeof left === "bigint" && typeof right === "bigint") {
    return left + right;
  }
  if (typeof left === "bigint" && typeof right === "number") {
    return Number.isInteger(right)
      ? left + BigInt(right)
      : Number(left) + right;
  }
  if (typeof left === "number" && typeof right === "bigint") {
    return Number.isInteger(left) ? BigInt(left) + right : left + Number(right);
  }
  if (typeof left === "number" && typeof right === "number") {
    return left + right;
  }
  if (typeof left === "boolean" && typeof right === "boolean") {
    return BigInt(Number(left) + Number(right));
  }
  if (typeof left === "boolean" && typeof right === "bigint") {
    return BigInt(Number(left)) + right;
  }
  if (typeof left === "bigint" && typeof right === "boolean") {
    return left + BigInt(Number(right));
  }
  if (typeof left === "boolean" && typeof right === "number") {
    return Number(left) + right;
  }
  if (typeof left === "number" && typeof right === "boolean") {
    return left + Number(right);
  }
  if (typeof left === "string" && typeof right === "string") {
    return left + right;
  }
  if (typeof left === "string") {
    return left + renderRantyValue(right);
  }
  if (typeof right === "string") {
    return renderRantyValue(left) + right;
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    const kind =
      getCollectionKind(left) === "tuple" &&
      getCollectionKind(right) === "tuple"
        ? "tuple"
        : "list";
    return makeCollectionValue(kind, [...left, ...right]);
  }
  if (left instanceof Map && right instanceof Map) {
    const merged = new Map<string, RantyValue>();
    for (const [key, value] of left.entries()) {
      merged.set(key, value);
    }
    for (const [key, value] of right.entries()) {
      merged.set(key, value);
    }
    return merged;
  }

  return `${renderRantyValue(left)}${renderRantyValue(right)}`;
}

function numericNumber(value: RantyValue, name: string): number {
  return toFloat(value, name);
}

function compoundAssignedValue(
  op: NonNullable<AngleSetStatement["compoundOp"]>,
  current: RantyValue,
  value: RantyValue
): RantyValue {
  switch (op) {
    case "add":
      return addValues(current, value);
    case "sub":
      if (typeof current === "bigint" && typeof value === "bigint") {
        return current - value;
      }
      return numericNumber(current, op) - numericNumber(value, op);
    case "mul":
      if (typeof current === "bigint" && typeof value === "bigint") {
        return current * value;
      }
      return numericNumber(current, op) * numericNumber(value, op);
    case "div":
      if (
        typeof current === "bigint" &&
        typeof value === "bigint" &&
        value !== 0n &&
        current % value === 0n
      ) {
        return current / value;
      }
      return numericNumber(current, op) / numericNumber(value, op);
    case "mod":
      if (typeof current === "bigint" && typeof value === "bigint") {
        return current % value;
      }
      return numericNumber(current, op) % numericNumber(value, op);
    case "pow":
      if (
        typeof current === "bigint" &&
        typeof value === "bigint" &&
        value >= 0n
      ) {
        return current ** value;
      }
      return numericNumber(current, op) ** numericNumber(value, op);
    case "and":
      return isTruthy(current) && isTruthy(value);
    case "or":
      return isTruthy(current) || isTruthy(value);
    case "xor":
      return isTruthy(current) !== isTruthy(value);
  }
}

export class VM {
  readonly engine: Ranty;
  readonly program: RantyProgram;
  #scopes: Map<string, RantyBinding>[] = [new Map()];
  #blocks: ActiveBlockState[] = [];
  #functionDepth = 0;

  constructor(engine: Ranty, program: RantyProgram) {
    this.engine = engine;
    this.program = program;
  }

  run(): RantyValue {
    return renderRantyValue(this.runRaw());
  }

  runRaw(): RantyValue {
    return this.engine.withActiveVm(this, () => {
      try {
        return this.materializeValue(
          this.evaluateSequenceValue(this.program.root)
        );
      } catch (error) {
        if (error instanceof ReturnSignal) {
          return this.materializeValue(error.value);
        }
        if (error instanceof ContinueSignal || error instanceof BreakSignal) {
          throw new RuntimeError(
            RuntimeErrorType.ControlFlowError,
            "no reachable repeater to interrupt"
          );
        }
        throw error;
      }
    });
  }

  runWith(args: Record<string, RantyValue>): RantyValue {
    const previous = new Map<string, RantyBinding | undefined>();

    for (const [key, value] of Object.entries(args)) {
      previous.set(key, this.engine.getGlobalBinding(key));
      this.engine.setGlobal(key, value);
    }

    try {
      return this.run();
    } finally {
      for (const [key, binding] of previous.entries()) {
        if (binding === undefined) {
          this.engine.deleteGlobal(key);
        } else {
          this.engine.setGlobalBindingForce(key, binding);
        }
      }
    }
  }

  readBindingValue(binding: RantyBinding): RantyValue {
    if (binding.kind === "value") {
      return binding.value;
    }

    if (binding.state.kind === "ready") {
      return binding.state.value;
    }

    if (binding.state.kind === "evaluating") {
      throw new RuntimeError(
        RuntimeErrorType.LazyBindingCycle,
        "lazy binding cycle detected"
      );
    }

    const thunk = binding.state.thunk;
    const previousScopes = this.#scopes;
    binding.state = {
      kind: "evaluating",
      thunk
    };

    this.#scopes = [...thunk.scopes];
    try {
      const value = this.evaluateSequenceValue(thunk.expr);
      binding.state = {
        kind: "ready",
        value
      };
      return value;
    } catch (error) {
      binding.state = {
        kind: "pending",
        thunk
      };
      throw error;
    } finally {
      this.#scopes = previousScopes;
    }
  }

  private evaluateSequenceValue(sequence: Sequence): RantyValue {
    const values: RantyValue[] = [];
    const pendingAttributes: PendingAttribute[] = [];
    let branchMatched: boolean | null = null;

    for (let index = 0; index < sequence.nodes.length; index += 1) {
      const node = sequence.nodes[index];
      if (!node) {
        continue;
      }
      const nextNode = sequence.nodes[index + 1];
      const normalizedText =
        node.kind === "text"
          ? this.normalizeBridgedText(node, nextNode)
          : undefined;

      if (node.kind === "text") {
        const escapedWhitespace = this.normalizedEscapedWhitespaceText(node);
        if (escapedWhitespace !== undefined) {
          if (escapedWhitespace.length > 0) {
            branchMatched = null;
            values.push(escapedWhitespace);
          }
          continue;
        }

        if (
          (normalizedText ?? node.value).trim().length === 0 &&
          values.length === 0 &&
          pendingAttributes.length === 0 &&
          branchMatched === null &&
          !this.isPureWhitespaceSequence(sequence)
        ) {
          continue;
        }

        const functionWhitespace = this.normalizeFunctionBodyWhitespace(
          sequence.nodes,
          index,
          normalizedText ?? node.value
        );
        if (functionWhitespace !== undefined) {
          if (functionWhitespace.length === 0) {
            continue;
          }
          branchMatched = null;
          values.push(functionWhitespace);
          continue;
        }

        const silentWhitespace = this.normalizeSilentAdjacentWhitespace(
          sequence.nodes,
          index,
          normalizedText ?? node.value
        );
        if (silentWhitespace !== undefined) {
          if (silentWhitespace.length === 0) {
            continue;
          }
          branchMatched = null;
          values.push(silentWhitespace);
          continue;
        }

        if (pendingAttributes.length === 0 && branchMatched === null) {
          const interstitialWhitespace = this.normalizeInterstitialWhitespace(
            sequence.nodes,
            index,
            normalizedText ?? node.value
          );
          if (interstitialWhitespace !== undefined) {
            if (interstitialWhitespace.length === 0) {
              continue;
            }
            branchMatched = null;
            values.push(interstitialWhitespace);
            continue;
          }
        }
      }

      if (node.kind === "block") {
        const attributes = [...pendingAttributes];
        pendingAttributes.length = 0;

        const branchAttribute = [...attributes]
          .reverse()
          .find((attribute) => this.isBranchAttribute(attribute));
        const blockAttributes = attributes.filter(
          (attribute): attribute is RantyAttributeValue =>
            !this.isBranchAttribute(attribute)
        );

        let shouldRun = true;
        if (branchAttribute) {
          switch (branchAttribute.name) {
            case "if":
              branchMatched = this.evaluateBranchAttribute(branchAttribute);
              shouldRun = branchMatched;
              break;
            case "elseif":
              if (branchMatched === true) {
                shouldRun = false;
              } else {
                branchMatched = this.evaluateBranchAttribute(branchAttribute);
                shouldRun = branchMatched;
              }
              break;
            case "else":
              shouldRun = branchMatched !== true;
              branchMatched = true;
              break;
          }
        } else {
          branchMatched = null;
        }

        if (shouldRun) {
          try {
            if (this.blockHasEditDirective(node)) {
              this.trimTrailingLayoutValues(values);
              const priorValue =
                values.length === 0 ? null : this.combineValues(values);
              values.length = 0;
              values.push(
                this.evaluateEditBlock(node, blockAttributes, priorValue)
              );
            } else {
              values.push(this.evaluateBlock(node, blockAttributes));
            }
          } catch (error) {
            if (
              error instanceof ReturnSignal ||
              error instanceof ContinueSignal ||
              error instanceof BreakSignal
            ) {
              throw this.withBufferedSequenceValue(error, values);
            }
            throw error;
          }
        }
        continue;
      }

      if (node.kind === "invoke" && this.isBranchInvocation(node)) {
        pendingAttributes.push({
          type: "branch-attribute",
          name: node.name.slice(1) as PendingBranchAttribute["name"],
          ...(node.name === "@else" ? {} : { condition: node.args[0] })
        });
        continue;
      }

      if (
        node.kind === "text" &&
        (normalizedText ?? "").trim().length === 0 &&
        (pendingAttributes.length > 0 ||
          branchMatched !== null ||
          (nextNode == null &&
            this.hasSubstantiveOutput(values) &&
            !this.isPureWhitespaceSequence(sequence)) ||
          (!this.hasSubstantiveOutput(values) &&
            !this.isPureWhitespaceSequence(sequence)))
      ) {
        continue;
      }

      let value: RantyValue;
      try {
        value =
          node.kind === "text"
            ? (normalizedText ?? node.value)
            : this.evaluateNode(node);
      } catch (error) {
        if (
          error instanceof ReturnSignal ||
          error instanceof ContinueSignal ||
          error instanceof BreakSignal
        ) {
          throw this.withBufferedSequenceValue(error, values);
        }
        throw error;
      }

      if (isAttributeValue(value)) {
        if (value.name === "reset") {
          pendingAttributes.length = 0;
        } else {
          pendingAttributes.push(value);
        }
        continue;
      }

      if (pendingAttributes.length > 0) {
        pendingAttributes.length = 0;
      }

      if (
        this.isSilentSequenceNode(node) &&
        this.isRenderableEmptyValue(value)
      ) {
        branchMatched = null;
        continue;
      }

      branchMatched = null;
      values.push(value);
    }

    return this.combineValues(values);
  }

  private evaluateNode(node: SequenceNode): RantyValue {
    switch (node.kind) {
      case "text":
      case "string":
        return node.value;
      case "number":
        return node.value;
      case "pipe-value":
        throw new RuntimeError(
          RuntimeErrorType.InvalidOperation,
          "pipe value is not available here"
        );
      case "map":
        return this.evaluateMapLiteral(node.entries);
      case "list":
        return this.evaluateListLiteral(node);
      case "tuple":
        return this.evaluateTupleLiteral(node);
      case "unary-op":
        return this.evaluateUnaryOp(node);
      case "binary-op":
        return this.evaluateBinaryOp(node);
      case "spread":
        throw new RuntimeError(
          RuntimeErrorType.InvalidOperation,
          "spread is only valid in function calls"
        );
      case "invoke":
        return this.invoke(node);
      case "block":
        return this.evaluateBlock(node, []);
      case "angle":
        return this.evaluateAngle(node);
      case "function":
        return this.evaluateFunctionDefinition(node);
    }
  }

  private evaluateAngle(node: AngleNode): RantyValue {
    const outputs: RantyValue[] = [];

    for (const statement of node.statements) {
      if (statement.kind === "access") {
        outputs.push(this.getAngleAccessValue(statement));
        continue;
      }

      if (statement.isLazy && !statement.compoundOp) {
        this.setStatementValue(statement);
        continue;
      }

      const value = this.sequenceValueOrNothing(statement.value);
      this.setStatementValue(
        statement,
        statement.compoundOp
          ? compoundAssignedValue(
              statement.compoundOp,
              this.getStatementValue(statement),
              value
            )
          : value
      );
    }

    return outputs.length === 0 ? null : this.combineValues(outputs);
  }

  private getAngleAccessValue(statement: AngleAccessStatement): RantyValue {
    try {
      return this.getStatementValue(statement);
    } catch (error) {
      if (
        statement.fallback &&
        error instanceof RuntimeError &&
        error.errorType === RuntimeErrorType.InvalidAccess
      ) {
        return statement.fallback.nodes.length === 0
          ? null
          : this.evaluateSequenceValue(statement.fallback);
      }
      throw error;
    }
  }

  private evaluateFunctionDefinition(node: FunctionDefNode): RantyValue {
    const capturedScopes = [...this.#scopes];
    const fn = ((...args: readonly RantyValue[]): RantyValue => {
      const previousScopes = this.#scopes;
      this.#scopes = [...capturedScopes];
      this.pushScope();
      this.#functionDepth += 1;

      try {
        this.bindFunctionParams(node, undefined, args);

        try {
          return this.evaluateSequenceValue(node.body);
        } catch (error) {
          if (error instanceof ReturnSignal) {
            return error.value;
          }
          throw error;
        }
      } finally {
        this.#functionDepth = Math.max(0, this.#functionDepth - 1);
        this.#scopes = previousScopes;
      }
    }) as UserFunctionValue;
    Object.defineProperty(fn, USER_FUNCTION, {
      value: {
        node,
        scopes: capturedScopes
      } satisfies UserFunctionMeta,
      configurable: true
    });

    if (node.name != null) {
      if (node.global) {
        this.engine.setGlobalBindingForce(
          node.name,
          valueBinding(fn, node.isConst)
        );
      } else if (node.descope > 0 && !node.name.includes("/")) {
        const scope = this.#scopes[this.#scopes.length - 1 - node.descope];
        if (!scope) {
          throw new RuntimeError(
            RuntimeErrorType.InvalidAccess,
            `cannot define descoped variable '${node.name}'`
          );
        }
        if (scope.get(node.name)?.const) {
          throw new RuntimeError(
            RuntimeErrorType.InvalidOperation,
            `cannot redefine constant '${node.name}'`
          );
        }
        scope.set(node.name, valueBinding(fn, node.isConst));
      } else if (node.name.includes("/")) {
        const [baseName, ...segments] = this.splitPath(node.name);
        if (!baseName) {
          throw new RuntimeError(
            RuntimeErrorType.InvalidAccess,
            "function path is empty"
          );
        }
        this.setNamedPath(
          baseName,
          segments.map(
            (segment) => ({ kind: "static", value: segment }) as const
          ),
          fn,
          true,
          node.global,
          node.descope,
          node.isConst
        );
      } else {
        this.defineLocal(node.name, fn, node.isConst);
      }
      return "";
    }

    return fn;
  }

  private bindFunctionParams(
    node: FunctionDefNode,
    argSequences?: readonly Sequence[],
    evaluatedArgs: readonly RantyValue[] = []
  ): void {
    let argIndex = 0;

    for (const param of node.params) {
      if (param.variadic !== "none") {
        const rest = argSequences
          ? argSequences
              .slice(argIndex)
              .map((arg) => this.evaluateSequenceValue(arg))
          : evaluatedArgs.slice(argIndex);
        if (param.variadic === "plus" && rest.length === 0) {
          throw new RuntimeError(
            RuntimeErrorType.ArgumentMismatch,
            `'${node.name ?? "function"}' expected at least 1 argument for variadic parameter '${param.name}'`
          );
        }
        this.defineLocal(param.name, makeListValue(rest));
        argIndex = argSequences ? argSequences.length : evaluatedArgs.length;
        continue;
      }

      const argSequence = argSequences?.[argIndex];
      if (param.isLazy) {
        if (argSequence) {
          this.defineLocalBinding(
            param.name,
            lazyBinding({
              name: param.name,
              expr: argSequence,
              scopes: [...this.#scopes]
            })
          );
          argIndex += 1;
          continue;
        }

        if (param.defaultValue) {
          this.defineLocalBinding(
            param.name,
            lazyBinding({
              name: param.name,
              expr: param.defaultValue,
              scopes: [...this.#scopes]
            })
          );
        } else if (!param.optional) {
          this.defineLocal(param.name, null);
        }
        continue;
      }

      const arg = argSequence
        ? this.evaluateSequenceValue(argSequence)
        : evaluatedArgs[argIndex];
      if (arg === undefined) {
        if (param.defaultValue) {
          this.defineLocal(
            param.name,
            this.evaluateSequenceValue(param.defaultValue)
          );
        } else if (!param.optional) {
          this.defineLocal(param.name, null);
        }
        continue;
      }

      this.defineLocal(param.name, arg);
      argIndex += 1;
    }
  }

  private invokeUserFunction(
    meta: UserFunctionMeta,
    args: readonly Sequence[]
  ): RantyValue {
    const previousScopes = this.#scopes;
    this.#scopes = [...meta.scopes];
    this.pushScope();
    this.#functionDepth += 1;

    try {
      this.bindFunctionParams(
        meta.node,
        meta.node.params.some((param) => param.isLazy) ? args : undefined,
        meta.node.params.some((param) => param.isLazy)
          ? []
          : this.evaluateInvocationArgs(args)
      );

      try {
        return this.evaluateSequenceValue(meta.node.body);
      } catch (error) {
        if (error instanceof ReturnSignal) {
          return error.value;
        }
        if (error instanceof ContinueSignal || error instanceof BreakSignal) {
          throw new RuntimeError(
            RuntimeErrorType.ControlFlowError,
            "no reachable repeater to interrupt"
          );
        }
        throw error;
      }
    } finally {
      this.#functionDepth = Math.max(0, this.#functionDepth - 1);
      this.#scopes = previousScopes;
    }
  }

  private evaluateMapLiteral(
    entries: readonly { readonly key: string; readonly value: Sequence }[]
  ): RantyValue {
    const map = new Map<string, RantyValue>();
    for (const entry of entries) {
      map.set(entry.key, this.evaluateSequenceValue(entry.value));
    }
    return map;
  }

  private evaluateListLiteral(node: ListLiteralNode): RantyValue {
    return makeListValue(
      node.items.map((item) => this.evaluateSequenceValue(item))
    );
  }

  private evaluateTupleLiteral(
    node: Extract<SequenceNode, { readonly kind: "tuple" }>
  ): RantyValue {
    return makeTupleValue(
      node.items.map((item) => this.evaluateSequenceValue(item))
    );
  }

  private evaluateBlock(
    node: BlockNode,
    attributes: readonly RantyAttributeValue[]
  ): RantyValue {
    const repetition = this.blockRepetitionPlan(
      attributes,
      node.elements.length
    );
    const separator = this.blockSeparator(attributes);
    const selector = this.blockSelector(attributes);
    const mutator = this.blockMutator(attributes);
    const outputs: RantyValue[] = [];
    const isRepeater = attributes.some((attribute) => attribute.name === "rep");
    const blockState: ActiveBlockState = {
      stepIndex: 0,
      totalSteps: repetition.totalSteps,
      isRepeater
    };

    this.#blocks.push(blockState);
    this.pushScope();
    try {
      for (
        let index = 0;
        repetition.count == null || index < repetition.count;
        index += 1
      ) {
        blockState.stepIndex = index;
        if (index > 0 && separator !== undefined) {
          outputs.push(this.resolveSeparator(separator));
        }

        const elementIndex = this.selectBlockElementIndex(
          selector,
          node.elements,
          index
        );
        if (elementIndex == null) {
          continue;
        }
        const element = node.elements[elementIndex] ?? node.elements[0];
        if (element) {
          try {
            outputs.push(
              this.applyMutator(
                this.evaluateSequenceValue(element.sequence),
                mutator
              )
            );
          } catch (error) {
            if (error instanceof ContinueSignal) {
              if (!isRepeater) {
                throw error;
              }
              outputs.push(this.applyMutator(error.value, mutator));
              continue;
            }
            if (error instanceof BreakSignal) {
              if (!isRepeater) {
                throw error;
              }
              outputs.push(this.applyMutator(error.value, mutator));
              break;
            }
            throw error;
          }
        }
      }
    } finally {
      this.popScope();
      this.#blocks.pop();
    }

    if (
      outputs.length > 0 &&
      outputs.every(
        (value) => typeof value === "string" && value.trim().length === 0
      ) &&
      node.elements.every((element) =>
        this.isSilentOrWhitespaceSequence(element.sequence)
      )
    ) {
      return "";
    }

    return outputs.length === 0 ? null : this.combineValues(outputs);
  }

  private evaluateEditBlock(
    node: BlockNode,
    attributes: readonly RantyAttributeValue[],
    initialValue: RantyValue
  ): RantyValue {
    const repetition = this.blockRepetitionPlan(
      attributes,
      node.elements.length
    );
    const separator = this.blockSeparator(attributes);
    const selector = this.blockSelector(attributes);
    const mutator = this.blockMutator(attributes);
    const outputs: RantyValue[] = [];
    const isRepeater = attributes.some((attribute) => attribute.name === "rep");
    const blockState: ActiveBlockState = {
      stepIndex: 0,
      totalSteps: repetition.totalSteps,
      isRepeater
    };
    let current = initialValue;

    this.#blocks.push(blockState);
    this.pushScope();
    try {
      for (
        let index = 0;
        repetition.count == null || index < repetition.count;
        index += 1
      ) {
        blockState.stepIndex = index;
        if (index > 0 && separator !== undefined) {
          const resolvedSeparator = this.resolveSeparator(separator);
          if (outputs.length === 0 && !this.isRenderableEmptyValue(current)) {
            current = this.combineValues([current, resolvedSeparator]);
          } else {
            outputs.push(resolvedSeparator);
          }
        }

        const elementIndex = this.selectBlockElementIndex(
          selector,
          node.elements,
          index
        );
        if (elementIndex == null) {
          continue;
        }
        const element = node.elements[elementIndex] ?? node.elements[0];
        if (!element) {
          continue;
        }

        if (element.edit) {
          const baseValue =
            outputs.length > 0 ? this.combineValues(outputs) : current;
          outputs.length = 0;
          try {
            current = this.applyMutator(
              this.evaluateEditDirective(element.edit, baseValue),
              mutator
            );
          } catch (error) {
            if (error instanceof ContinueSignal) {
              if (!isRepeater) {
                throw error;
              }
              current = this.applyMutator(error.value, mutator);
              continue;
            }
            if (error instanceof BreakSignal) {
              if (!isRepeater) {
                throw error;
              }
              current = this.applyMutator(error.value, mutator);
              break;
            }
            throw error;
          }
          continue;
        }

        try {
          if (!this.isRenderableEmptyValue(current)) {
            outputs.push(current);
            current = null;
          }
          outputs.push(
            this.applyMutator(
              this.evaluateSequenceValue(element.sequence),
              mutator
            )
          );
        } catch (error) {
          if (error instanceof ContinueSignal) {
            if (!isRepeater) {
              throw error;
            }
            if (!this.isRenderableEmptyValue(current)) {
              outputs.push(current);
              current = null;
            }
            outputs.push(this.applyMutator(error.value, mutator));
            continue;
          }
          if (error instanceof BreakSignal) {
            if (!isRepeater) {
              throw error;
            }
            if (!this.isRenderableEmptyValue(current)) {
              outputs.push(current);
              current = null;
            }
            outputs.push(this.applyMutator(error.value, mutator));
            break;
          }
          throw error;
        }
      }
    } finally {
      this.popScope();
      this.#blocks.pop();
    }

    if (outputs.length === 0) {
      return current;
    }
    if (!this.isRenderableEmptyValue(current)) {
      outputs.unshift(current);
    }
    return this.combineValues(outputs);
  }

  private evaluateEditDirective(
    edit: NonNullable<BlockElementNode["edit"]>,
    parentValue: RantyValue
  ): RantyValue {
    this.pushScope();
    try {
      if (edit.name) {
        this.defineLocal(edit.name, parentValue);
      }
      return this.evaluateSequenceValue(edit.body);
    } finally {
      this.popScope();
    }
  }

  private evaluateUnaryOp(
    node: Extract<SequenceNode, { readonly kind: "unary-op" }>
  ): RantyValue {
    switch (node.op) {
      case "not":
        return !isTruthy(this.evaluateSequenceValue(node.operand));
      case "neg": {
        const value = this.evaluateSequenceValue(node.operand);
        if (typeof value === "bigint") {
          return -value;
        }
        return -toFloat(value, "@neg");
      }
    }
  }

  private evaluateBinaryOp(node: BinaryOpNode): RantyValue {
    switch (node.op) {
      case "add":
        return addValues(
          this.evaluateSequenceValue(node.left),
          this.evaluateSequenceValue(node.right)
        );
      case "sub": {
        const left = this.evaluateSequenceValue(node.left);
        const right = this.evaluateSequenceValue(node.right);
        if (typeof left === "bigint" && typeof right === "bigint") {
          return left - right;
        }
        return toFloat(left, "-") - toFloat(right, "-");
      }
      case "mul": {
        const left = this.evaluateSequenceValue(node.left);
        const right = this.evaluateSequenceValue(node.right);
        if (typeof left === "bigint" && typeof right === "bigint") {
          return left * right;
        }
        return toFloat(left, "*") * toFloat(right, "*");
      }
      case "div": {
        const left = this.evaluateSequenceValue(node.left);
        const right = this.evaluateSequenceValue(node.right);
        if (
          typeof left === "bigint" &&
          typeof right === "bigint" &&
          right !== 0n &&
          left % right === 0n
        ) {
          return left / right;
        }
        return toFloat(left, "/") / toFloat(right, "/");
      }
      case "mod": {
        const left = this.evaluateSequenceValue(node.left);
        const right = this.evaluateSequenceValue(node.right);
        if (typeof left === "bigint" && typeof right === "bigint") {
          return left % right;
        }
        return toFloat(left, "%") % toFloat(right, "%");
      }
      case "pow": {
        const left = this.evaluateSequenceValue(node.left);
        const right = this.evaluateSequenceValue(node.right);
        if (
          typeof left === "bigint" &&
          typeof right === "bigint" &&
          right >= 0n
        ) {
          return left ** right;
        }
        return toFloat(left, "**") ** toFloat(right, "**");
      }
      case "and": {
        const left = this.evaluateSequenceValue(node.left);
        return isTruthy(left) ? this.evaluateSequenceValue(node.right) : left;
      }
      case "or": {
        const left = this.evaluateSequenceValue(node.left);
        return isTruthy(left) ? left : this.evaluateSequenceValue(node.right);
      }
      case "xor": {
        const left = this.evaluateSequenceValue(node.left);
        const right = this.evaluateSequenceValue(node.right);
        return isTruthy(left) !== isTruthy(right);
      }
      case "eq":
        return areEqual(
          this.evaluateSequenceValue(node.left),
          this.evaluateSequenceValue(node.right)
        );
      case "neq":
        return !areEqual(
          this.evaluateSequenceValue(node.left),
          this.evaluateSequenceValue(node.right)
        );
      case "lt":
        return (
          toFloat(this.evaluateSequenceValue(node.left), "@lt") <
          toFloat(this.evaluateSequenceValue(node.right), "@lt")
        );
      case "le":
        return (
          toFloat(this.evaluateSequenceValue(node.left), "@le") <=
          toFloat(this.evaluateSequenceValue(node.right), "@le")
        );
      case "gt":
        return (
          toFloat(this.evaluateSequenceValue(node.left), "@gt") >
          toFloat(this.evaluateSequenceValue(node.right), "@gt")
        );
      case "ge":
        return (
          toFloat(this.evaluateSequenceValue(node.left), "@ge") >=
          toFloat(this.evaluateSequenceValue(node.right), "@ge")
        );
    }
  }

  private invoke(node: InvocationNode): RantyValue {
    const special = this.tryInvokeSpecial(node);
    if (special !== undefined) {
      return special;
    }

    const value = this.getNamedValue(node.name, true);
    if (value == null) {
      throw new RuntimeError(
        RuntimeErrorType.InvalidAccess,
        `global '${node.name}' does not exist`
      );
    }

    const temporal = this.tryInvokeTemporal(value, node);
    if (temporal !== undefined) {
      return temporal;
    }

    const userFunction =
      typeof value === "function"
        ? (value as UserFunctionValue)[USER_FUNCTION]
        : undefined;
    if (userFunction) {
      return this.invokeUserFunction(userFunction, node.args);
    }

    const args = this.evaluateInvocationArgs(node.args);

    if (typeof value === "function") {
      try {
        return value(...args);
      } catch (error) {
        if (error instanceof ContinueSignal || error instanceof BreakSignal) {
          throw new RuntimeError(
            RuntimeErrorType.ControlFlowError,
            "no reachable repeater to interrupt"
          );
        }
        throw error;
      }
    }

    if (args.length > 0) {
      throw new RuntimeError(
        RuntimeErrorType.CannotInvokeValue,
        `global '${node.name}' is not callable`
      );
    }

    return value;
  }

  private evaluateInvocationArgs(args: readonly Sequence[]): RantyValue[] {
    const evaluated: RantyValue[] = [];

    for (const arg of args) {
      const spread =
        arg.nodes.length === 1 && arg.nodes[0]?.kind === "spread"
          ? arg.nodes[0]
          : null;
      if (!spread) {
        evaluated.push(this.materializeValue(this.evaluateSequenceValue(arg)));
        continue;
      }

      const value = this.materializeValue(
        this.evaluateSequenceValue(spread.value)
      );
      if (this.expandSpreadArg(evaluated, value)) {
        continue;
      }
      evaluated.push(value);
    }

    return evaluated;
  }

  private tryInvokeTemporal(
    value: RantyValue,
    node: InvocationNode
  ): RantyValue | undefined {
    const hasExplicitTemporal = node.args.some((arg) => {
      const spread =
        arg.nodes.length === 1 && arg.nodes[0]?.kind === "spread"
          ? arg.nodes[0]
          : null;
      return spread?.temporal === true;
    });
    if (!hasExplicitTemporal) {
      return undefined;
    }

    const baseArgs: RantyValue[] = [];
    const explicitTemporalArgs: Array<{
      index: number;
      label: string | null;
      values: readonly RantyValue[];
    }> = [];
    const implicitTemporalArgs: Array<{
      index: number;
      values: readonly RantyValue[];
    }> = [];

    for (const arg of node.args) {
      const spread =
        arg.nodes.length === 1 && arg.nodes[0]?.kind === "spread"
          ? arg.nodes[0]
          : null;
      if (!spread) {
        const evaluated = this.evaluateSequenceValue(arg);
        if (isTemporalValue(evaluated)) {
          const index = baseArgs.length;
          baseArgs.push(evaluated);
          implicitTemporalArgs.push({ index, values: evaluated.values });
        } else {
          baseArgs.push(this.materializeValue(evaluated));
        }
        continue;
      }

      const spreadValue = this.evaluateSequenceValue(spread.value);
      if (spread.temporal) {
        baseArgs.push(null);
        explicitTemporalArgs.push({
          index: baseArgs.length - 1,
          label: spread.label ?? null,
          values: this.temporalItems(spreadValue)
        });
        continue;
      }

      const materialized = this.materializeValue(spreadValue);
      if (this.expandSpreadArg(baseArgs, materialized)) {
        continue;
      }
      baseArgs.push(materialized);
    }

    const dimensions = this.temporalDimensions(
      explicitTemporalArgs,
      implicitTemporalArgs
    );
    const resolvedArgs = [...baseArgs];
    const results: RantyValue[] = [];

    const visit = (dimensionIndex: number): void => {
      if (dimensionIndex < 0) {
        results.push(this.invokeResolvedValue(value, node.name, resolvedArgs));
        return;
      }

      const dimension = dimensions[dimensionIndex];
      if (!dimension || dimension.length === 0) {
        visit(dimensionIndex - 1);
        return;
      }

      const previous = dimension.bindings.map(
        (binding) => resolvedArgs[binding.index]
      );
      for (let index = 0; index < dimension.length; index += 1) {
        for (const binding of dimension.bindings) {
          resolvedArgs[binding.index] = this.materializeValue(
            binding.values[index] ?? null
          );
        }
        visit(dimensionIndex - 1);
      }
      for (const [bindingIndex, binding] of dimension.bindings.entries()) {
        resolvedArgs[binding.index] = previous[bindingIndex] ?? null;
      }
    };

    visit(dimensions.length - 1);
    return makeTemporalValue(results);
  }

  private temporalDimensions(
    explicitArgs: readonly {
      index: number;
      label: string | null;
      values: readonly RantyValue[];
    }[],
    implicitArgs: readonly { index: number; values: readonly RantyValue[] }[]
  ): TemporalDimension[] {
    const dimensions: TemporalDimension[] = [];
    const labeled = new Map<string, TemporalArgBinding[]>();
    const labeledOrder: string[] = [];

    for (const arg of explicitArgs) {
      if (!arg.label) {
        dimensions.push({
          bindings: [{ index: arg.index, values: arg.values }],
          length: arg.values.length
        });
        continue;
      }

      if (!labeled.has(arg.label)) {
        labeled.set(arg.label, []);
        labeledOrder.push(arg.label);
      }
      labeled.get(arg.label)?.push({ index: arg.index, values: arg.values });
    }

    for (const label of labeledOrder) {
      const bindings = labeled.get(label) ?? [];
      const length = bindings.reduce(
        (smallest, binding) => Math.min(smallest, binding.values.length),
        Number.POSITIVE_INFINITY
      );
      dimensions.push({
        bindings,
        length: Number.isFinite(length) ? length : 0
      });
    }

    for (const arg of implicitArgs) {
      dimensions.push({
        bindings: [{ index: arg.index, values: arg.values }],
        length: arg.values.length
      });
    }

    return dimensions;
  }

  private temporalItems(value: RantyValue): readonly RantyValue[] {
    if (isTemporalValue(value)) {
      return value.values;
    }
    if (Array.isArray(value)) {
      return value;
    }
    if (typeof value === "string") {
      return Array.from(value);
    }
    if (isRangeValue(value)) {
      return Array.from({ length: rangeLength(value) }, (_, index) =>
        rangeValueAt(value, index)
      );
    }
    return [this.materializeValue(value)];
  }

  private materializeValue(value: RantyValue): RantyValue {
    if (!isTemporalValue(value)) {
      return value;
    }
    return this.combineValues(
      value.values.map((item) => this.materializeValue(item))
    );
  }

  private invokeResolvedValue(
    value: RantyValue,
    name: string,
    args: readonly RantyValue[]
  ): RantyValue {
    if (typeof value === "function") {
      try {
        return value(...args);
      } catch (error) {
        if (error instanceof ContinueSignal || error instanceof BreakSignal) {
          throw new RuntimeError(
            RuntimeErrorType.ControlFlowError,
            "no reachable repeater to interrupt"
          );
        }
        throw error;
      }
    }

    if (args.length > 0) {
      throw new RuntimeError(
        RuntimeErrorType.CannotInvokeValue,
        `global '${name}' is not callable`
      );
    }

    return value;
  }

  private expandSpreadArg(out: RantyValue[], value: RantyValue): boolean {
    if (Array.isArray(value)) {
      out.push(...value);
      return true;
    }

    if (typeof value === "string") {
      out.push(...Array.from(value));
      return true;
    }

    if (isRangeValue(value)) {
      for (let index = 0; index < rangeLength(value); index += 1) {
        out.push(rangeValueAt(value, index));
      }
      return true;
    }

    return false;
  }

  private tryInvokeSpecial(node: InvocationNode): RantyValue | undefined {
    if (node.name.startsWith("@")) {
      return this.invokeKeyword(node);
    }

    switch (node.name) {
      case "step":
        if (node.args.length !== 0) {
          throw new RuntimeError(
            RuntimeErrorType.ArgumentMismatch,
            `'step' expected 0 argument(s), got ${node.args.length}`
          );
        }
        return BigInt((this.currentBlock()?.stepIndex ?? 0) + 1);
      case "step-index":
        if (node.args.length !== 0) {
          throw new RuntimeError(
            RuntimeErrorType.ArgumentMismatch,
            `'step-index' expected 0 argument(s), got ${node.args.length}`
          );
        }
        return BigInt(this.currentBlock()?.stepIndex ?? 0);
      case "step-count":
        if (node.args.length !== 0) {
          throw new RuntimeError(
            RuntimeErrorType.ArgumentMismatch,
            `'step-count' expected 0 argument(s), got ${node.args.length}`
          );
        }
        return BigInt(this.currentBlock()?.totalSteps ?? 0);
      default:
        return undefined;
    }
  }

  private invokeKeyword(node: InvocationNode): RantyValue {
    const args = node.args.map((arg) => this.evaluateSequenceValue(arg));

    switch (node.name) {
      case "@true":
        expectArgCount("@true", args, 0);
        return true;
      case "@false":
        expectArgCount("@false", args, 0);
        return false;
      case "@step":
        expectArgCount("@step", args, 0);
        return BigInt(this.currentBlock()?.stepIndex ?? 0);
      case "@total":
        expectArgCount("@total", args, 0);
        return this.currentBlock()?.totalSteps == null
          ? null
          : BigInt(this.currentBlock()?.totalSteps ?? 0);
      case "@rep":
        expectArgCount("@rep", args, 1);
        return { type: "attribute", name: "rep", value: args[0] ?? null };
      case "@sep":
        expectArgCount("@sep", args, 1);
        return { type: "attribute", name: "sep", value: args[0] ?? null };
      case "@sel":
        expectArgCount("@sel", args, 1);
        return { type: "attribute", name: "sel", value: args[0] ?? null };
      case "@mut":
        if (args.length > 1) {
          throw new RuntimeError(
            RuntimeErrorType.ArgumentMismatch,
            "'@mut' expected at most 1 argument"
          );
        }
        return { type: "attribute", name: "mut", value: args[0] ?? null };
      case "@if":
        expectArgCount("@if", args, 1);
        return {
          type: "attribute",
          name: "if",
          value: isTruthy(args[0] ?? null)
        };
      case "@elseif":
        expectArgCount("@elseif", args, 1);
        return {
          type: "attribute",
          name: "elseif",
          value: isTruthy(args[0] ?? null)
        };
      case "@else":
        expectArgCount("@else", args, 0);
        return { type: "attribute", name: "else", value: true };
      case "@return":
        if (args.length > 1) {
          throw new RuntimeError(
            RuntimeErrorType.ArgumentMismatch,
            "'@return' expected at most 1 argument"
          );
        }
        throw new ReturnSignal(args[0] ?? "");
      case "@continue":
        if (args.length > 1) {
          throw new RuntimeError(
            RuntimeErrorType.ArgumentMismatch,
            "'@continue' expected at most 1 argument"
          );
        }
        throw new ContinueSignal(args[0] ?? "");
      case "@break":
        if (args.length > 1) {
          throw new RuntimeError(
            RuntimeErrorType.ArgumentMismatch,
            "'@break' expected at most 1 argument"
          );
        }
        throw new BreakSignal(args[0] ?? "");
      case "@require": {
        if (args.length < 1 || args.length > 2) {
          throw new RuntimeError(
            RuntimeErrorType.ArgumentMismatch,
            "'@require' expected 1 or 2 argument(s)"
          );
        }

        const modulePath = this.expectString(
          args[args.length - 1] ?? null,
          "@require"
        );
        const alias =
          args.length === 2
            ? this.expectString(args[0] ?? null, "@require")
            : this.defaultModuleAlias(modulePath);
        const moduleValue = this.engine.loadModule(
          modulePath,
          this.program.info
        );
        this.defineLocal(alias, moduleValue);
        return "";
      }
      default:
        throw new RuntimeError(
          RuntimeErrorType.InvalidOperation,
          `invalid keyword '${node.name}'`
        );
    }
  }

  private blockRepetitionPlan(
    attributes: readonly RantyAttributeValue[],
    elementCount: number
  ): BlockRepetitionPlan {
    const attr = [...attributes].reverse().find((item) => item.name === "rep");
    if (!attr) {
      return { count: 1, totalSteps: 1 };
    }

    if (typeof attr.value === "string") {
      switch (attr.value) {
        case "once":
          return { count: 1, totalSteps: 1 };
        case "all":
          return {
            count: Math.max(0, elementCount),
            totalSteps: Math.max(0, elementCount)
          };
        case "forever":
          return { count: null, totalSteps: null };
        default:
          throw new RuntimeError(
            RuntimeErrorType.ArgumentError,
            `unknown repetition mode: '${attr.value}'`
          );
      }
    }

    const value = Number(asInteger(attr.value, "rep"));
    const count = Number.isFinite(value) ? Math.max(0, value) : 1;
    return { count, totalSteps: count };
  }

  private blockSeparator(
    attributes: readonly RantyAttributeValue[]
  ): RantyValue | undefined {
    return [...attributes].reverse().find((item) => item.name === "sep")?.value;
  }

  private blockSelector(
    attributes: readonly RantyAttributeValue[]
  ): RantySelectorValue | undefined {
    const value = [...attributes]
      .reverse()
      .find((item) => item.name === "sel")?.value;
    if (isSelectorValue(value)) {
      return value;
    }
    if (
      typeof value === "string" &&
      ["forward", "reverse", "ping", "pong"].includes(value)
    ) {
      return {
        type: "selector",
        mode: value,
        index: 0,
        direction: 1,
        frozen: false,
        initialized: false
      };
    }
    return undefined;
  }

  private blockMutator(
    attributes: readonly RantyAttributeValue[]
  ): ((...args: readonly RantyValue[]) => RantyValue) | undefined {
    const value = [...attributes]
      .reverse()
      .find((item) => item.name === "mut")?.value;
    if (value == null) {
      return undefined;
    }
    if (typeof value === "function") {
      return value;
    }
    throw new RuntimeError(
      RuntimeErrorType.ValueError,
      "mutator must be a function or nothing"
    );
  }

  private resolveSeparator(separator: RantyValue): RantyValue {
    if (typeof separator === "function") {
      return separator();
    }

    return separator;
  }

  private applyMutator(
    value: RantyValue,
    mutator: ((...args: readonly RantyValue[]) => RantyValue) | undefined
  ): RantyValue {
    if (!mutator) {
      return value;
    }
    return mutator(value);
  }

  private selectBlockElementIndex(
    selector: RantySelectorValue | undefined,
    elements: readonly BlockElementNode[],
    fallbackIndex: number
  ): number | null {
    const count = elements.length;
    if (count === 0) {
      return null;
    }
    if (selector?.mode === "match") {
      return this.selectMatchElementIndex(selector, elements);
    }

    if (!selector) {
      if (elements.some((element) => element.weight != null)) {
        const weights = elements.map((element) =>
          this.blockElementWeight(element)
        );
        const sum = weights.reduce((total, weight) => total + weight, 0);
        if (sum <= 0) {
          return null;
        }
        return this.engine.rng().nextWeightedIndex(count, weights, sum);
      }
      if (count <= 1) {
        return 0;
      }
      return fallbackIndex % count;
    }

    if (count <= 1) {
      return 0;
    }

    if (!selector.initialized) {
      selector.initialized = true;
      selector.index =
        selector.mode === "reverse" || selector.mode === "pong" ? count - 1 : 0;
      selector.direction =
        selector.mode === "reverse" || selector.mode === "pong" ? -1 : 1;
    }

    const current = selector.index;
    if (selector.frozen) {
      return Math.max(0, Math.min(count - 1, current));
    }

    switch (selector.mode) {
      case "reverse":
        selector.index = (current - 1 + count) % count;
        break;
      case "ping":
      case "pong": {
        if (count > 1) {
          const next = current + selector.direction;
          if (next >= count) {
            selector.direction = -1;
            selector.index = count - 2;
          } else if (next < 0) {
            selector.direction = 1;
            selector.index = 1;
          } else {
            selector.index = next;
          }
        }
        break;
      }
      case "forward":
      default:
        selector.index = (current + 1) % count;
        break;
    }

    return Math.max(0, Math.min(count - 1, current));
  }

  private selectMatchElementIndex(
    selector: RantySelectorValue,
    elements: readonly BlockElementNode[]
  ): number {
    const tagged: number[] = [];
    const fallback: number[] = [];

    for (const [index, element] of elements.entries()) {
      if (element.on) {
        const trigger = this.evaluateSequenceValue(element.on);
        if (areEqual(trigger, selector.matchValue ?? null)) {
          tagged.push(index);
        }
      } else {
        fallback.push(index);
      }
    }

    const candidates = tagged.length > 0 ? tagged : fallback;
    if (candidates.length === 0) {
      throw new RuntimeError(
        RuntimeErrorType.SelectorError,
        "match selector could not find a selectable branch"
      );
    }

    const weights = candidates.map((index) =>
      this.blockElementWeight(elements[index])
    );
    const sum = weights.reduce((total, weight) => total + weight, 0);
    if (sum <= 0) {
      throw new RuntimeError(
        RuntimeErrorType.SelectorError,
        "match selector could not find a selectable branch"
      );
    }

    return (
      candidates[
        this.engine.rng().nextWeightedIndex(candidates.length, weights, sum)
      ] ??
      candidates[0] ??
      0
    );
  }

  private blockElementWeight(element: BlockElementNode | undefined): number {
    if (!element?.weight) {
      return 1;
    }

    const value = this.evaluateSequenceValue(element.weight);
    const weight = toFloat(value, "@weight");
    return Number.isFinite(weight) && weight > 0 ? weight : 0;
  }

  private combineValues(values: readonly RantyValue[]): RantyValue {
    if (values.length === 0) {
      return "";
    }

    const rendered = values.map((value) => renderRantyValue(value));
    const hasSubstantiveOutput = rendered.some(
      (value) => value.trim().length > 0
    );
    if (!hasSubstantiveOutput) {
      return values.length === 1 ? (values[0] as RantyValue) : "";
    }

    const nonWhitespaceValues = values.filter(
      (value) => !(typeof value === "string" && value.trim().length === 0)
    );

    if (
      nonWhitespaceValues.length === 1 &&
      typeof nonWhitespaceValues[0] !== "string" &&
      values.some(
        (value) => typeof value === "string" && value.trim().length === 0
      )
    ) {
      return nonWhitespaceValues[0] as RantyValue;
    }

    const mergedStructured = this.mergeStructuredValues(nonWhitespaceValues);
    if (mergedStructured !== undefined) {
      return mergedStructured;
    }

    if (values.length === 1) {
      return values[0] as RantyValue;
    }

    return rendered.join("");
  }

  private isPendingBranchAttribute(
    attribute: PendingAttribute
  ): attribute is PendingBranchAttribute {
    return attribute.type === "branch-attribute";
  }

  private isBranchAttribute(
    attribute: PendingAttribute
  ): attribute is PendingBranchAttribute | RantyAttributeValue {
    return (
      this.isPendingBranchAttribute(attribute) ||
      BRANCH_ATTRIBUTES.has(attribute.name)
    );
  }

  private evaluateBranchAttribute(
    attribute: PendingBranchAttribute | RantyAttributeValue
  ): boolean {
    if (!this.isPendingBranchAttribute(attribute)) {
      return isTruthy(attribute.value);
    }

    switch (attribute.name) {
      case "else":
        return true;
      case "if":
      case "elseif":
        return isTruthy(
          attribute.condition == null
            ? null
            : this.evaluateSequenceValue(attribute.condition)
        );
    }
  }

  private isBranchInvocation(node: InvocationNode): boolean {
    return (
      ((node.name === "@if" || node.name === "@elseif") &&
        node.args.length === 1) ||
      (node.name === "@else" && node.args.length === 0)
    );
  }

  private blockHasEditDirective(node: BlockNode): boolean {
    return node.elements.some((element) => element.edit != null);
  }

  private isRenderableEmptyValue(value: RantyValue): boolean {
    return value == null || (typeof value === "string" && value.length === 0);
  }

  private sequenceValueOrNothing(sequence: Sequence): RantyValue {
    return sequence.nodes.length === 0
      ? null
      : this.evaluateSequenceValue(sequence);
  }

  private trimTrailingLayoutValues(values: RantyValue[]): void {
    while (values.length > 0) {
      const last = values[values.length - 1];
      if (typeof last !== "string" || last.trim().length !== 0) {
        return;
      }
      values.pop();
    }
  }

  private hasSubstantiveOutput(values: readonly RantyValue[]): boolean {
    return values.some((value) => renderRantyValue(value).trim().length > 0);
  }

  private isSilentSequenceNode(node: SequenceNode | undefined): boolean {
    return (
      (node?.kind === "function" && node.name != null) ||
      (node?.kind === "angle" &&
        node.statements.length > 0 &&
        node.statements.every((statement) => statement.kind === "set")) ||
      (node?.kind === "invoke" &&
        (SILENT_ATTRIBUTE_INVOCATIONS.has(node.name) ||
          SILENT_SIDE_EFFECT_INVOCATIONS.has(node.name)))
    );
  }

  private isWhitespaceTextNode(node: SequenceNode | undefined): boolean {
    return (
      node?.kind === "text" &&
      node.value.trim().length === 0 &&
      !this.isEscapedWhitespaceTextNode(node)
    );
  }

  private isEscapedWhitespaceTextNode(node: SequenceNode | undefined): boolean {
    if (node?.kind !== "text" || node.value.trim().length !== 0) {
      return false;
    }
    return this.program.source
      .slice(node.span.start, node.span.end)
      .includes("\\");
  }

  private normalizedEscapedWhitespaceText(
    node: SequenceNode | undefined
  ): string | undefined {
    if (!this.isEscapedWhitespaceTextNode(node)) {
      return undefined;
    }

    const textNode = node as Extract<SequenceNode, { readonly kind: "text" }>;
    const raw = this.program.source
      .slice(textNode.span.start, textNode.span.end)
      .replace(/^\s+/u, "")
      .replace(/\s+$/u, "");

    if (raw.length === 0) {
      return "";
    }

    return this.decodeRuntimeTextEscapes(raw);
  }

  private decodeRuntimeTextEscapes(value: string): string {
    let output = "";

    for (let index = 0; index < value.length; index += 1) {
      const char = value[index];
      if (char === "\\" && index + 1 < value.length) {
        output += this.decodeRuntimeEscape(value[index + 1] ?? "");
        index += 1;
        continue;
      }
      output += char ?? "";
    }

    return output;
  }

  private decodeRuntimeEscape(char: string): string {
    switch (char) {
      case "n":
        return "\n";
      case "r":
        return "\r";
      case "t":
        return "\t";
      case "s":
        return " ";
      case "\\":
        return "\\";
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

  private isSilentOrWhitespaceSequence(sequence: Sequence): boolean {
    return sequence.nodes.every(
      (node) =>
        this.isWhitespaceTextNode(node) || this.isSilentSequenceNode(node)
    );
  }

  private isWhitespaceRunAdjacentToSilentNode(
    nodes: readonly SequenceNode[],
    index: number
  ): boolean {
    let left = index - 1;
    while (left >= 0 && this.isWhitespaceTextNode(nodes[left])) {
      left -= 1;
    }
    if (this.isSilentSequenceNode(nodes[left])) {
      return true;
    }

    let right = index + 1;
    while (right < nodes.length && this.isWhitespaceTextNode(nodes[right])) {
      right += 1;
    }
    return this.isSilentSequenceNode(nodes[right]);
  }

  private normalizeSilentAdjacentWhitespace(
    nodes: readonly SequenceNode[],
    index: number,
    normalizedText: string
  ): string | undefined {
    if (this.isEscapedWhitespaceTextNode(nodes[index])) {
      return undefined;
    }
    if (
      normalizedText.trim().length !== 0 ||
      !this.isWhitespaceRunAdjacentToSilentNode(nodes, index)
    ) {
      return undefined;
    }

    if (index > 0 && this.isWhitespaceTextNode(nodes[index - 1])) {
      return "";
    }

    const left = this.closestNonWhitespaceNode(nodes, index, -1);
    const right = this.closestNonWhitespaceNode(nodes, index, 1);
    const hasLineBreak = normalizedText.includes("\n");

    if (
      left &&
      left.kind !== "text" &&
      !this.isSilentSequenceNode(left) &&
      right &&
      this.preservesLeadingLayoutForSilentNode(right) &&
      hasLineBreak
    ) {
      return "\n";
    }

    return "";
  }

  private normalizeInterstitialWhitespace(
    nodes: readonly SequenceNode[],
    index: number,
    normalizedText: string
  ): string | undefined {
    if (this.isEscapedWhitespaceTextNode(nodes[index])) {
      return undefined;
    }
    if (
      normalizedText.trim().length === 0 &&
      !normalizedText.includes("\n") &&
      this.isCompactedAnonymousWhitespace(nodes, index)
    ) {
      return "";
    }

    if (normalizedText.trim().length !== 0 || !normalizedText.includes("\n")) {
      return undefined;
    }

    if (index > 0 && this.isWhitespaceTextNode(nodes[index - 1])) {
      return "";
    }

    const left = this.closestNonWhitespaceNode(nodes, index, -1);
    const right = this.closestNonWhitespaceNode(nodes, index, 1);
    if (
      !left ||
      !right ||
      this.isSilentSequenceNode(left) ||
      this.isSilentSequenceNode(right)
    ) {
      return undefined;
    }

    return "\n";
  }

  private normalizeFunctionBodyWhitespace(
    nodes: readonly SequenceNode[],
    index: number,
    normalizedText: string
  ): string | undefined {
    if (this.isEscapedWhitespaceTextNode(nodes[index])) {
      return undefined;
    }
    if (this.#functionDepth === 0 || normalizedText.trim().length !== 0) {
      return undefined;
    }

    const left = this.closestNonWhitespaceNode(nodes, index, -1);
    const right = this.closestNonWhitespaceNode(nodes, index, 1);
    if (!left || !right || left.kind === "text" || right.kind === "text") {
      return undefined;
    }

    return "";
  }

  private closestNonWhitespaceNode(
    nodes: readonly SequenceNode[],
    index: number,
    direction: -1 | 1
  ): SequenceNode | undefined {
    let cursor = index + direction;
    while (cursor >= 0 && cursor < nodes.length) {
      const node = nodes[cursor];
      if (!this.isWhitespaceTextNode(node)) {
        return node;
      }
      cursor += direction;
    }
    return undefined;
  }

  private isPureWhitespaceSequence(sequence: Sequence): boolean {
    return (
      sequence.nodes.length > 0 &&
      sequence.nodes.every(
        (node) => node.kind === "text" && node.value.trim().length === 0
      )
    );
  }

  private normalizeBridgedText(
    node: Extract<SequenceNode, { readonly kind: "text" }>,
    nextNode: SequenceNode | undefined
  ): string {
    const raw = this.program.source.slice(node.span.start, node.span.end);
    let value = node.value;

    if (!raw.includes("\\")) {
      value = value.replace(/\r?\n[ \t\r\n]*/gu, "");
      value = value.replace(/[ \t]{2,}/gu, " ");
    }

    if (!nextNode) {
      return value;
    }

    const trimmed = value.replace(/\r?\n[ \t\r\n]*$/u, "");
    return trimmed.trim().length > 0 ? trimmed : value;
  }

  private isCompactedAnonymousWhitespace(
    nodes: readonly SequenceNode[],
    index: number
  ): boolean {
    const left = this.closestNonWhitespaceNode(nodes, index, -1);
    const right = this.closestNonWhitespaceNode(nodes, index, 1);
    return (
      this.isCompactedAngleAccess(left) && this.isCompactedAngleAccess(right)
    );
  }

  private isCompactedAngleAccess(node: SequenceNode | undefined): boolean {
    if (node?.kind !== "angle" || node.statements.length !== 1) {
      return false;
    }
    const [statement] = node.statements;
    return statement?.kind === "access" && statement.path.length > 0;
  }

  private preservesLeadingLayoutForSilentNode(
    node: SequenceNode | undefined
  ): boolean {
    return (
      (node?.kind === "function" && node.name != null) ||
      (node?.kind === "angle" &&
        node.statements.every((statement) => statement.kind === "set"))
    );
  }

  private mergeStructuredValues(
    values: readonly RantyValue[]
  ): RantyValue | undefined {
    if (values.length < 2) {
      return undefined;
    }

    if (values.every((value) => Array.isArray(value))) {
      const kind = values.every((value) => getCollectionKind(value) === "tuple")
        ? "tuple"
        : "list";
      const items = values.flatMap((value) =>
        Array.isArray(value) ? value : []
      );
      return makeCollectionValue(kind, items);
    }

    if (values.every((value) => value instanceof Map)) {
      const merged = new Map<string, RantyValue>();
      for (const value of values) {
        if (!(value instanceof Map)) {
          continue;
        }
        for (const [key, item] of value.entries()) {
          merged.set(key, item);
        }
      }
      return merged;
    }

    return undefined;
  }

  private currentBlock(): ActiveBlockState | undefined {
    return this.#blocks[this.#blocks.length - 1];
  }

  private withBufferedSequenceValue(
    signal: ReturnSignal | ContinueSignal | BreakSignal,
    values: readonly RantyValue[]
  ): ReturnSignal | ContinueSignal | BreakSignal {
    if (values.length === 0 || !this.isEmptySignalValue(signal.value)) {
      return signal;
    }

    const combined = this.trimBufferedControlFlowValue(
      this.combineValues(values)
    );

    if (signal instanceof ReturnSignal) {
      return new ReturnSignal(combined);
    }
    if (signal instanceof ContinueSignal) {
      return new ContinueSignal(combined);
    }
    return new BreakSignal(combined);
  }

  private isEmptySignalValue(value: RantyValue): boolean {
    return typeof value === "string" && value.length === 0;
  }

  private trimBufferedControlFlowValue(value: RantyValue): RantyValue {
    if (typeof value !== "string") {
      return value;
    }
    return value.replace(/[ \t]+$/u, "");
  }

  private pushScope(): void {
    this.#scopes.push(new Map());
  }

  private popScope(): void {
    if (this.#scopes.length > 1) {
      this.#scopes.pop();
    }
  }

  private defineLocalBinding(name: string, binding: RantyBinding): void {
    this.#scopes[this.#scopes.length - 1]?.set(name, binding);
  }

  private defineLocal(name: string, value: RantyValue, isConst = false): void {
    this.defineLocalBinding(name, valueBinding(value, isConst));
  }

  bindLocal(name: string, value: RantyValue): void {
    this.defineLocal(name, value);
  }

  private getLocalBinding(name: string): RantyBinding | undefined {
    for (let index = this.#scopes.length - 1; index >= 0; index -= 1) {
      const scope = this.#scopes[index];
      if (scope?.has(name)) {
        return scope.get(name);
      }
    }
    return undefined;
  }

  private getLocal(name: string): RantyValue | undefined {
    const binding = this.getLocalBinding(name);
    return binding ? this.readBindingValue(binding) : undefined;
  }

  private getNamedValue(
    name: string,
    preferCallable = false
  ): RantyValue | undefined {
    const segments = this.splitPath(name);
    const baseName = segments[0] ?? "";
    if (preferCallable && !name.includes("/")) {
      const callable = this.getPercolatingCallable(baseName);
      if (callable !== undefined) {
        return callable;
      }
    }

    const base = this.getLocal(baseName) ?? this.engine.getGlobal(baseName);
    if (base === undefined) {
      return undefined;
    }
    return this.getPathFromValue(base, segments.slice(1), name);
  }

  private getPercolatingCallable(name: string): RantyValue | undefined {
    let shadowed: RantyValue | undefined;

    for (let index = this.#scopes.length - 1; index >= 0; index -= 1) {
      const scope = this.#scopes[index];
      if (!scope?.has(name)) {
        continue;
      }

      const binding = scope.get(name);
      if (!binding) {
        continue;
      }
      const value = this.readBindingValue(binding);
      if (shadowed === undefined) {
        shadowed = value;
      }

      if (typeof value === "function") {
        return value;
      }
    }

    const globalBinding = this.engine.getGlobalBinding(name);
    if (globalBinding) {
      const globalValue = this.readBindingValue(globalBinding);
      if (typeof globalValue === "function") {
        return globalValue;
      }
      if (shadowed === undefined) {
        shadowed = globalValue;
      }
    }

    return shadowed;
  }

  private getPathFromValue(
    value: RantyValue,
    path: readonly string[],
    fullName: string
  ): RantyValue {
    let current = value;

    for (const segment of path) {
      current = this.getSegmentValue(current, segment, fullName);
    }

    return current;
  }

  private getVariable(
    name: string,
    path: readonly AnglePathSegment[] = [],
    global: boolean,
    descope: number
  ): RantyValue {
    const baseName = name;

    if (global) {
      const binding = this.engine.getGlobalBinding(baseName);
      if (!binding) {
        throw new RuntimeError(
          RuntimeErrorType.InvalidAccess,
          `global '${baseName}' does not exist`
        );
      }
      const value = this.readBindingValue(binding);
      return this.getAccessPathFromValue(
        value,
        path,
        this.pathDisplayName(baseName, path)
      );
    }

    if (descope > 0) {
      const scope = this.#scopes[this.#scopes.length - 1 - descope];
      const binding = scope?.get(baseName);
      if (binding) {
        return this.getAccessPathFromValue(
          this.readBindingValue(binding),
          path,
          this.pathDisplayName(baseName, path)
        );
      }
      const globalBinding = this.engine.getGlobalBinding(baseName);
      if (!globalBinding) {
        throw new RuntimeError(
          RuntimeErrorType.InvalidAccess,
          `descoped variable '${baseName}' does not exist`
        );
      }
      return this.getAccessPathFromValue(
        this.readBindingValue(globalBinding),
        path,
        this.pathDisplayName(baseName, path)
      );
    }

    const binding =
      this.getLocalBinding(baseName) ?? this.engine.getGlobalBinding(baseName);
    if (!binding) {
      throw new RuntimeError(
        RuntimeErrorType.InvalidAccess,
        `variable '${baseName}' does not exist`
      );
    }
    const value = this.readBindingValue(binding);

    return this.getAccessPathFromValue(
      value,
      path,
      this.pathDisplayName(baseName, path)
    );
  }

  private getStatementValue(
    statement: AngleAccessStatement | AngleSetStatement
  ): RantyValue {
    if (!statement.base) {
      return this.getVariable(
        statement.name,
        statement.path,
        statement.global,
        statement.descope
      );
    }

    const base = this.evaluateSequenceValue(statement.base);
    if (statement.path.length === 0) {
      return base;
    }

    return this.getAccessPathFromValue(
      base,
      statement.path,
      this.pathDisplayName("(...)", statement.path)
    );
  }

  private setStatementValue(
    statement: AngleSetStatement,
    value?: RantyValue
  ): void {
    if (!statement.base) {
      this.setVariable(statement, value);
      return;
    }

    if (statement.path.length === 0) {
      throw new RuntimeError(
        RuntimeErrorType.InvalidAccess,
        "anonymous assignments require an access path"
      );
    }

    const displayName = this.pathDisplayName("(...)", statement.path);
    let current = this.evaluateSequenceValue(statement.base);

    for (const segment of statement.path.slice(0, -1)) {
      current = this.getAngleSegmentValue(current, segment, displayName);
    }

    const last = statement.path[statement.path.length - 1];
    if (!last) {
      throw new RuntimeError(
        RuntimeErrorType.InvalidAccess,
        "anonymous assignments require an access path"
      );
    }
    this.setAngleSegmentValue(
      current,
      last,
      value ?? this.sequenceValueOrNothing(statement.value),
      displayName
    );
  }

  private setVariable(statement: AngleSetStatement, value?: RantyValue): void {
    if (statement.path.length > 0) {
      this.setNamedPath(
        statement.name,
        statement.path,
        value ?? this.sequenceValueOrNothing(statement.value),
        statement.define,
        statement.global,
        statement.descope,
        statement.isConst
      );
      return;
    }

    const nextBinding = statement.isLazy
      ? lazyBinding(
          {
            name: statement.name,
            expr: statement.value,
            scopes: [...this.#scopes]
          },
          statement.isConst
        )
      : valueBinding(
          value ?? this.sequenceValueOrNothing(statement.value),
          statement.isConst
        );

    if (statement.define) {
      if (statement.global) {
        this.engine.setGlobalBindingForce(statement.name, nextBinding);
      } else if (statement.descope > 0) {
        const scope = this.#scopes[this.#scopes.length - 1 - statement.descope];
        if (!scope) {
          throw new RuntimeError(
            RuntimeErrorType.InvalidAccess,
            `cannot define descoped variable '${statement.name}'`
          );
        }
        if (scope.get(statement.name)?.const) {
          throw new RuntimeError(
            RuntimeErrorType.InvalidOperation,
            `cannot redefine constant '${statement.name}'`
          );
        }
        scope.set(statement.name, nextBinding);
      } else {
        this.defineLocalBinding(statement.name, nextBinding);
      }
      return;
    }

    if (statement.global) {
      const binding = this.engine.getGlobalBinding(statement.name);
      if (!binding) {
        throw new RuntimeError(
          RuntimeErrorType.InvalidAccess,
          `global '${statement.name}' does not exist`
        );
      }
      if (binding.const) {
        throw new RuntimeError(
          RuntimeErrorType.InvalidOperation,
          `cannot reassign constant '${statement.name}'`
        );
      }
      this.engine.setGlobalBindingForce(
        statement.name,
        valueBinding(value ?? null)
      );
      return;
    }

    if (statement.descope > 0) {
      const scope = this.#scopes[this.#scopes.length - 1 - statement.descope];
      const binding = scope?.get(statement.name);
      if (!scope || !binding) {
        throw new RuntimeError(
          RuntimeErrorType.InvalidAccess,
          `descoped variable '${statement.name}' does not exist`
        );
      }
      if (binding.const) {
        throw new RuntimeError(
          RuntimeErrorType.InvalidOperation,
          `cannot reassign constant '${statement.name}'`
        );
      }
      scope.set(statement.name, valueBinding(value ?? null));
      return;
    }

    for (let index = this.#scopes.length - 1; index >= 0; index -= 1) {
      const scope = this.#scopes[index];
      if (scope?.has(statement.name)) {
        if (scope.get(statement.name)?.const) {
          throw new RuntimeError(
            RuntimeErrorType.InvalidOperation,
            `cannot reassign constant '${statement.name}'`
          );
        }
        scope.set(statement.name, valueBinding(value ?? null));
        return;
      }
    }

    if (this.engine.hasGlobal(statement.name)) {
      const binding = this.engine.getGlobalBinding(statement.name);
      if (binding?.const) {
        throw new RuntimeError(
          RuntimeErrorType.InvalidOperation,
          `cannot reassign constant '${statement.name}'`
        );
      }
      this.engine.setGlobalBindingForce(
        statement.name,
        valueBinding(value ?? null)
      );
      return;
    }

    if (statement.name.startsWith("@")) {
      this.defineLocal(statement.name, value ?? null);
      return;
    }

    throw new RuntimeError(
      RuntimeErrorType.InvalidAccess,
      `variable '${statement.name}' does not exist`
    );
  }

  private setNamedPath(
    baseName: string,
    path: readonly AnglePathSegment[],
    value: RantyValue,
    define: boolean,
    global = false,
    descope = 0,
    isConst = false
  ): void {
    if (path.length === 0) {
      if (define) {
        this.defineLocal(baseName, value, isConst);
        return;
      }

      this.setVariable(
        {
          kind: "set",
          span: { start: 0, end: 0 },
          name: baseName,
          path: [],
          global,
          descope,
          define,
          isConst,
          isLazy: false,
          value: { kind: "sequence", nodes: [] }
        },
        value
      );
      return;
    }

    const displayName = this.pathDisplayName(baseName, path);
    const target = this.getVariable(baseName, [], global, descope);
    let current: RantyValue = target;
    for (const segment of path.slice(0, -1)) {
      current = this.getAngleSegmentValue(current, segment, displayName);
    }

    const last = path[path.length - 1];
    if (last == null) {
      throw new RuntimeError(
        RuntimeErrorType.InvalidAccess,
        `variable '${displayName}' does not exist`
      );
    }
    this.setAngleSegmentValue(current, last, value, displayName);
  }

  private getAccessPathFromValue(
    value: RantyValue,
    path: readonly AnglePathSegment[],
    fullName: string
  ): RantyValue {
    let current = value;

    for (const segment of path) {
      current = this.getAngleSegmentValue(current, segment, fullName);
    }

    return current;
  }

  private getAngleSegmentValue(
    current: RantyValue,
    segment: AnglePathSegment,
    fullName: string
  ): RantyValue {
    if (segment.kind === "slice") {
      return this.sliceOrderedValue(
        current,
        segment.start,
        segment.end,
        fullName
      );
    }

    const keyValue =
      segment.kind === "static"
        ? segment.value
        : this.evaluateSequenceValue(segment.value);

    if (current instanceof Map) {
      const key =
        typeof keyValue === "string" ? keyValue : renderRantyValue(keyValue);
      const result = getMapChainValue(current, key);
      if (!result.found) {
        throw new RuntimeError(
          RuntimeErrorType.InvalidAccess,
          `variable '${fullName}' does not exist`
        );
      }
      return result.value;
    }

    const index =
      segment.kind === "static"
        ? this.parseIndexSegment(segment.value)
        : this.pathIndexValue(keyValue, fullName);
    if (index == null) {
      throw new RuntimeError(
        RuntimeErrorType.InvalidAccess,
        `variable '${fullName}' does not exist`
      );
    }

    return this.getIndexedValue(current, index, fullName);
  }

  private setAngleSegmentValue(
    current: RantyValue,
    segment: AnglePathSegment,
    value: RantyValue,
    fullName: string
  ): void {
    if (segment.kind === "slice") {
      this.spliceOrderedValue(
        current,
        segment.start,
        segment.end,
        value,
        fullName
      );
      return;
    }

    const keyValue =
      segment.kind === "static"
        ? segment.value
        : this.evaluateSequenceValue(segment.value);

    if (current instanceof Map) {
      current.set(
        typeof keyValue === "string" ? keyValue : renderRantyValue(keyValue),
        value
      );
      return;
    }

    const index =
      segment.kind === "static"
        ? this.parseIndexSegment(segment.value)
        : this.pathIndexValue(keyValue, fullName);
    if (index == null) {
      throw new RuntimeError(
        RuntimeErrorType.InvalidAccess,
        `variable '${fullName}' does not exist`
      );
    }

    if (Array.isArray(current)) {
      const normalized = this.normalizeIndex(index, current.length);
      if (normalized == null) {
        throw new RuntimeError(
          RuntimeErrorType.IndexError,
          "index is out of range of list size"
        );
      }
      current[normalized] = value;
      return;
    }

    throw new RuntimeError(
      RuntimeErrorType.TypeError,
      `variable '${fullName}' is not index-settable`
    );
  }

  private pathDisplayName(
    baseName: string,
    path: readonly AnglePathSegment[]
  ): string {
    return [
      baseName,
      ...path.map((segment) => {
        switch (segment.kind) {
          case "static":
            return `/${segment.value}`;
          case "dynamic":
            return "/(...)";
          case "slice":
            return "/..";
        }
      })
    ].join("");
  }

  private splitPath(name: string): string[] {
    return name.split("/").filter((segment) => segment.length > 0);
  }

  private getSegmentValue(
    current: RantyValue,
    segment: string,
    fullName: string
  ): RantyValue {
    if (current instanceof Map) {
      const result = getMapChainValue(current, segment);
      if (!result.found) {
        throw new RuntimeError(
          RuntimeErrorType.InvalidAccess,
          `variable '${fullName}' does not exist`
        );
      }
      return result.value;
    }

    const index = this.parseIndexSegment(segment);
    if (index == null) {
      throw new RuntimeError(
        RuntimeErrorType.InvalidAccess,
        `variable '${fullName}' does not exist`
      );
    }

    return this.getIndexedValue(current, index, fullName);
  }

  private setSegmentValue(
    current: RantyValue,
    segment: string,
    value: RantyValue,
    fullName: string
  ): void {
    if (current instanceof Map) {
      current.set(segment, value);
      return;
    }

    const index = this.parseIndexSegment(segment);
    if (index == null) {
      throw new RuntimeError(
        RuntimeErrorType.InvalidAccess,
        `variable '${fullName}' does not exist`
      );
    }

    if (Array.isArray(current)) {
      const normalized = this.normalizeIndex(index, current.length);
      if (normalized == null) {
        throw new RuntimeError(
          RuntimeErrorType.IndexError,
          "index is out of range of list size"
        );
      }
      current[normalized] = value;
      return;
    }

    throw new RuntimeError(
      RuntimeErrorType.TypeError,
      `variable '${fullName}' is not index-settable`
    );
  }

  private parseIndexSegment(segment: string): number | null {
    if (!/^-?\d+$/u.test(segment)) {
      return null;
    }
    const index = Number(segment);
    return Number.isInteger(index) ? index : null;
  }

  private normalizeIndex(index: number, length: number): number | null {
    const normalized = index < 0 ? length + index : index;
    if (
      !Number.isInteger(normalized) ||
      normalized < 0 ||
      normalized >= length
    ) {
      return null;
    }
    return normalized;
  }

  private pathIndexValue(value: RantyValue, fullName: string): number {
    const index = Number(asInteger(value, fullName));
    if (!Number.isInteger(index)) {
      throw new RuntimeError(
        RuntimeErrorType.InvalidAccess,
        `variable '${fullName}' does not exist`
      );
    }
    return index;
  }

  private getIndexedValue(
    current: RantyValue,
    index: number,
    fullName: string
  ): RantyValue {
    if (Array.isArray(current)) {
      const normalized = this.normalizeIndex(index, current.length);
      if (normalized == null) {
        throw new RuntimeError(
          RuntimeErrorType.InvalidAccess,
          `variable '${fullName}' does not exist`
        );
      }
      return current[normalized] ?? null;
    }

    if (typeof current === "string") {
      const chars = Array.from(current);
      const normalized = this.normalizeIndex(index, chars.length);
      if (normalized == null) {
        throw new RuntimeError(
          RuntimeErrorType.InvalidAccess,
          `variable '${fullName}' does not exist`
        );
      }
      return chars[normalized] ?? "";
    }

    if (isRangeValue(current)) {
      const normalized = this.normalizeIndex(index, rangeLength(current));
      if (normalized == null) {
        throw new RuntimeError(
          RuntimeErrorType.InvalidAccess,
          `variable '${fullName}' does not exist`
        );
      }
      return rangeValueAt(current, normalized);
    }

    throw new RuntimeError(
      RuntimeErrorType.InvalidAccess,
      `variable '${fullName}' does not exist`
    );
  }

  private normalizeSliceIndex(index: number, length: number): number {
    const normalized = index < 0 ? length + index : index;
    return Math.max(0, Math.min(length, normalized));
  }

  private sliceBounds(
    length: number,
    start: Sequence | undefined,
    end: Sequence | undefined,
    fullName: string
  ): { readonly from: number; readonly to: number } {
    const startIndex =
      start == null
        ? 0
        : this.normalizeSliceIndex(
            this.pathIndexValue(this.evaluateSequenceValue(start), fullName),
            length
          );
    const endIndex =
      end == null
        ? length
        : this.normalizeSliceIndex(
            this.pathIndexValue(this.evaluateSequenceValue(end), fullName),
            length
          );

    return {
      from: Math.min(startIndex, endIndex),
      to: Math.max(startIndex, endIndex)
    };
  }

  private sliceOrderedValue(
    current: RantyValue,
    start: Sequence | undefined,
    end: Sequence | undefined,
    fullName: string
  ): RantyValue {
    if (typeof current === "string") {
      const chars = Array.from(current);
      const { from, to } = this.sliceBounds(chars.length, start, end, fullName);
      return chars.slice(from, to).join("");
    }

    if (Array.isArray(current)) {
      const { from, to } = this.sliceBounds(
        current.length,
        start,
        end,
        fullName
      );
      return makeCollectionValue(
        getCollectionKind(current) ?? "list",
        current.slice(from, to)
      );
    }

    if (isRangeValue(current)) {
      const length = rangeLength(current);
      const { from, to } = this.sliceBounds(length, start, end, fullName);
      const items: RantyValue[] = [];
      for (let index = from; index < to; index += 1) {
        items.push(rangeValueAt(current, index));
      }
      return makeListValue(items);
    }

    throw new RuntimeError(
      RuntimeErrorType.InvalidAccess,
      `variable '${fullName}' does not exist`
    );
  }

  private spliceOrderedValue(
    current: RantyValue,
    start: Sequence | undefined,
    end: Sequence | undefined,
    value: RantyValue,
    fullName: string
  ): void {
    if (!Array.isArray(current)) {
      throw new RuntimeError(
        RuntimeErrorType.TypeError,
        `variable '${fullName}' is not index-settable`
      );
    }

    const { from, to } = this.sliceBounds(current.length, start, end, fullName);
    const replacement = Array.isArray(value) ? [...value] : [value];
    current.splice(from, to - from, ...replacement);
  }

  private expectString(value: RantyValue, name: string): string {
    if (typeof value === "string") {
      return value;
    }

    throw new RuntimeError(
      RuntimeErrorType.TypeError,
      `'${name}' expected a string value`
    );
  }

  private defaultModuleAlias(modulePath: string): string {
    const normalized = modulePath.replaceAll("\\", "/");
    const base = normalized.split("/").at(-1) ?? normalized;
    return base.replace(/\.(ranty|rant)$/u, "");
  }
}
