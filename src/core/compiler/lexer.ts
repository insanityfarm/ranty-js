import { CompilerError } from "../errors";
import type { Reporter } from "../messages";
import { reportCompilerMessage } from "./message";
import { SourceReader } from "./reader";

interface TokenBase {
  readonly start: number;
  readonly end: number;
}

export type RantyToken =
  | (TokenBase & {
      readonly type: "whitespace";
      readonly value: string;
    })
  | (TokenBase & {
      readonly type: "comment";
      readonly value: string;
    })
  | (TokenBase & {
      readonly type: "string";
      readonly value: string;
      readonly raw: string;
    })
  | (TokenBase & {
      readonly type: "number";
      readonly value: string;
    })
  | (TokenBase & {
      readonly type: "identifier";
      readonly value: string;
    })
  | (TokenBase & {
      readonly type: "symbol";
      readonly value: string;
    })
  | (TokenBase & {
      readonly type: "eof";
    });

const MULTI_CHAR_SYMBOLS = [
  "**=",
  "|>",
  "..",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "&=",
  "|=",
  "^=",
  "?=",
  "**"
] as const;

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
    default:
      return char;
  }
}

function canStartNumber(reader: SourceReader): boolean {
  const char = reader.peek();
  const next = reader.peek(1);

  if (char == null) {
    return false;
  }

  if (/\d/.test(char)) {
    return true;
  }

  if ((char === "+" || char === "-") && next != null) {
    return /\d/.test(next) || (next === "." && /\d/.test(reader.peek(2) ?? ""));
  }

  if (char === ".") {
    return /\d/.test(next ?? "");
  }

  return false;
}

export function lex(source: string, reporter: Reporter): RantyToken[] {
  const reader = new SourceReader(source);
  const tokens: RantyToken[] = [];

  while (!reader.isEof()) {
    const start = reader.index();
    const char = reader.peek();

    if (char == null) {
      break;
    }

    if (/\s/u.test(char)) {
      const value = reader.consumeWhile((next) => /\s/u.test(next));
      tokens.push({
        type: "whitespace",
        value,
        start,
        end: reader.index()
      });
      continue;
    }

    if (char === "#") {
      const value = reader.consumeWhile(
        (next) => next !== "\n" && next !== "\r"
      );
      tokens.push({
        type: "comment",
        value,
        start,
        end: reader.index()
      });
      continue;
    }

    if (char === '"') {
      reader.next();
      let value = "";

      while (!reader.isEof()) {
        const next = reader.next();
        if (next == null) {
          break;
        }

        if (next === '"') {
          tokens.push({
            type: "string",
            value,
            raw: source.slice(start, reader.index()),
            start,
            end: reader.index()
          });
          value = "";
          break;
        }

        if (next === "\\") {
          const escaped = reader.next();
          if (escaped == null) {
            syntaxError(
              reporter,
              "unterminated string literal",
              start,
              reader.index(),
              "string"
            );
          }
          value += decodeEscape(escaped);
          continue;
        }

        value += next;
      }

      if (value !== "") {
        const previous = tokens[tokens.length - 1];
        if (previous?.type !== "string" || previous.start !== start) {
          syntaxError(
            reporter,
            "unterminated string literal",
            start,
            reader.index(),
            "string"
          );
        }
      }

      continue;
    }

    if (canStartNumber(reader)) {
      if (char === "+" || char === "-") {
        reader.next();
      }

      if (reader.peek() === ".") {
        reader.next();
      }

      reader.consumeWhile((next) => /\d/u.test(next));
      if (reader.peek() === "." && /\d/u.test(reader.peek(1) ?? "")) {
        reader.next();
        reader.consumeWhile((next) => /\d/u.test(next));
      }

      tokens.push({
        type: "number",
        value: source.slice(start, reader.index()),
        start,
        end: reader.index()
      });
      continue;
    }

    const multiChar = MULTI_CHAR_SYMBOLS.find((symbol) =>
      source.startsWith(symbol, start)
    );
    if (multiChar) {
      reader.setIndex(start + multiChar.length);
      tokens.push({
        type: "symbol",
        value: multiChar,
        start,
        end: reader.index()
      });
      continue;
    }

    if (/[A-Za-z0-9_]/u.test(char)) {
      const value = reader.consumeWhile((next) => /[A-Za-z0-9_-]/u.test(next));
      tokens.push({
        type: "identifier",
        value,
        start,
        end: reader.index()
      });
      continue;
    }

    reader.next();
    tokens.push({
      type: "symbol",
      value: char,
      start,
      end: reader.index()
    });
  }

  tokens.push({
    type: "eof",
    start: source.length,
    end: source.length
  });

  return tokens;
}
