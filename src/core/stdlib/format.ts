import { RuntimeError, RuntimeErrorType } from "../errors";
import type {
  Endianness,
  InfinityStyle,
  NumeralSystem,
  SignStyle,
  WhitespaceFormatMode
} from "../format-state";
import type { Ranty } from "../ranty";
import type { RantyValue } from "../values";
import { addBuiltin } from "./shared";

const NUM_FMT_KEYS = [
  "system",
  "alt",
  "precision",
  "padding",
  "upper",
  "endian",
  "sign",
  "infinity",
  "group-sep",
  "decimal-sep"
] as const;

function expectStringArg(name: string, value: RantyValue): string {
  if (typeof value === "string") {
    return value;
  }
  throw new RuntimeError(
    RuntimeErrorType.TypeError,
    `'${name}' expected a string value`
  );
}

function expectBoolArg(name: string, value: RantyValue): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  throw new RuntimeError(
    RuntimeErrorType.TypeError,
    `'${name}' expected a bool value`
  );
}

function expectIntArg(name: string, value: RantyValue): number {
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  throw new RuntimeError(
    RuntimeErrorType.TypeError,
    `'${name}' expected an int value`
  );
}

function expectMapArg(
  name: string,
  value: RantyValue
): Map<string, RantyValue> {
  if (value instanceof Map) {
    return value;
  }
  throw new RuntimeError(
    RuntimeErrorType.TypeError,
    `'${name}' expected a map value`
  );
}

function parseWhitespaceMode(
  name: string,
  value: RantyValue
): WhitespaceFormatMode {
  const mode = expectStringArg(name, value).toLowerCase();
  if (
    mode === "default" ||
    mode === "ignore-all" ||
    mode === "verbatim" ||
    mode === "custom"
  ) {
    return mode;
  }
  throw new RuntimeError(
    RuntimeErrorType.ArgumentError,
    `invalid whitespace normalization mode: '${mode}'`
  );
}

function parseSystem(name: string, value: RantyValue): NumeralSystem {
  const system = expectStringArg(name, value).toLowerCase();
  if (
    system === "west-arabic" ||
    system === "east-arabic" ||
    system === "persian" ||
    system === "roman" ||
    system === "babylonian" ||
    system === "hex" ||
    system === "octal" ||
    system === "binary" ||
    system === "alpha"
  ) {
    return system;
  }
  throw new RuntimeError(
    RuntimeErrorType.ArgumentError,
    `invalid numeral system: '${system}'`
  );
}

function parseEndian(name: string, value: RantyValue): Endianness {
  const endian = expectStringArg(name, value).toLowerCase();
  if (endian === "big" || endian === "little") {
    return endian;
  }
  throw new RuntimeError(
    RuntimeErrorType.ArgumentError,
    `invalid endianness: '${endian}'`
  );
}

function parseSign(name: string, value: RantyValue): SignStyle {
  const sign = expectStringArg(name, value).toLowerCase();
  if (sign === "default" || sign === "negative-only") {
    return "negative-only";
  }
  if (sign === "explicit" || sign === "explicit-non-zero") {
    return sign;
  }
  throw new RuntimeError(
    RuntimeErrorType.ArgumentError,
    `invalid sign style: '${sign}'`
  );
}

function parseInfinity(name: string, value: RantyValue): InfinityStyle {
  const style = expectStringArg(name, value).toLowerCase();
  if (style === "default" || style === "keyword") {
    return "keyword";
  }
  if (style === "symbol") {
    return "symbol";
  }
  throw new RuntimeError(
    RuntimeErrorType.ArgumentError,
    `invalid infinity style: '${style}'`
  );
}

function buildNumFmtMap(context: Ranty): Map<string, RantyValue> {
  const { number } = context.formatState();
  return new Map<string, RantyValue>([
    ["system", number.system],
    ["alt", number.alt],
    ["precision", BigInt(number.precision ?? -1)],
    ["padding", BigInt(number.padding)],
    ["upper", number.upper],
    ["endian", number.endian],
    ["sign", number.sign],
    ["infinity", number.infinity],
    ["group-sep", number.groupSep],
    ["decimal-sep", number.decimalSep]
  ]);
}

export function loadFormatStdlib(context: Ranty): void {
  addBuiltin(context, "ws-fmt", (...args) => {
    if (args.length === 0) {
      const whitespace = context.formatState().whitespace;
      return whitespace.mode === "custom"
        ? whitespace.customValue
        : whitespace.mode;
    }
    if (args.length > 2) {
      throw new RuntimeError(
        RuntimeErrorType.ArgumentMismatch,
        `'ws-fmt' expected at most 2 argument(s), got ${args.length}`
      );
    }

    const mode = parseWhitespaceMode("ws-fmt", args[0] ?? null);
    const whitespace = context.formatState().whitespace;
    whitespace.mode = mode;
    whitespace.customValue = mode === "custom" ? (args[1] ?? null) : null;
    return "";
  });

  addBuiltin(context, "num-fmt", (...args) => {
    if (args.length === 0) {
      return buildNumFmtMap(context);
    }
    if (args.length > 2) {
      throw new RuntimeError(
        RuntimeErrorType.ArgumentMismatch,
        `'num-fmt' expected at most 2 argument(s), got ${args.length}`
      );
    }

    if (!(args[0] instanceof Map)) {
      if (
        args.length === 1 &&
        (typeof args[0] === "bigint" || typeof args[0] === "number")
      ) {
        return buildNumFmtMap(context);
      }
      throw new RuntimeError(
        RuntimeErrorType.TypeError,
        "'num-fmt' expected a map value"
      );
    }

    const options = expectMapArg("num-fmt", args[0]);
    const format = context.formatState().number;

    for (const [key, value] of options.entries()) {
      switch (key.toLowerCase()) {
        case "system":
          format.system = parseSystem("num-fmt", value);
          break;
        case "alt":
          format.alt = expectBoolArg("num-fmt", value);
          break;
        case "precision": {
          const precision = expectIntArg("num-fmt", value);
          format.precision = precision >= 0 ? precision : null;
          break;
        }
        case "padding":
          format.padding = Math.max(0, expectIntArg("num-fmt", value));
          break;
        case "upper":
          format.upper = expectBoolArg("num-fmt", value);
          break;
        case "endian":
          format.endian = parseEndian("num-fmt", value);
          break;
        case "sign":
          format.sign = parseSign("num-fmt", value);
          break;
        case "infinity":
          format.infinity = parseInfinity("num-fmt", value);
          break;
        case "group-sep":
          format.groupSep = expectStringArg("num-fmt", value);
          break;
        case "decimal-sep":
          format.decimalSep = expectStringArg("num-fmt", value);
          break;
        default:
          break;
      }
    }

    return "";
  });

  addBuiltin(context, "num-fmt-system", (...args) => {
    if (args.length === 0) {
      return context.formatState().number.system;
    }
    if (args.length > 2) {
      throw new RuntimeError(
        RuntimeErrorType.ArgumentMismatch,
        `'num-fmt-system' expected at most 2 argument(s), got ${args.length}`
      );
    }
    context.formatState().number.system = parseSystem(
      "num-fmt-system",
      args[0] ?? null
    );
    return "";
  });

  addBuiltin(context, "num-fmt-alt", (...args) => {
    if (args.length === 0) {
      return context.formatState().number.alt;
    }
    if (args.length > 2) {
      throw new RuntimeError(
        RuntimeErrorType.ArgumentMismatch,
        `'num-fmt-alt' expected at most 2 argument(s), got ${args.length}`
      );
    }
    context.formatState().number.alt = expectBoolArg(
      "num-fmt-alt",
      args[0] ?? null
    );
    return "";
  });

  addBuiltin(context, "num-fmt-padding", (...args) => {
    if (args.length === 0) {
      return BigInt(context.formatState().number.padding);
    }
    if (args.length > 2) {
      throw new RuntimeError(
        RuntimeErrorType.ArgumentMismatch,
        `'num-fmt-padding' expected at most 2 argument(s), got ${args.length}`
      );
    }
    context.formatState().number.padding = Math.max(
      0,
      expectIntArg("num-fmt-padding", args[0] ?? null)
    );
    return "";
  });

  addBuiltin(context, "num-fmt-precision", (...args) => {
    if (args.length === 0) {
      return BigInt(context.formatState().number.precision ?? -1);
    }
    if (args.length > 2) {
      throw new RuntimeError(
        RuntimeErrorType.ArgumentMismatch,
        `'num-fmt-precision' expected at most 2 argument(s), got ${args.length}`
      );
    }
    const precision = expectIntArg("num-fmt-precision", args[0] ?? null);
    context.formatState().number.precision = precision >= 0 ? precision : null;
    return "";
  });

  addBuiltin(context, "num-fmt-upper", (...args) => {
    if (args.length === 0) {
      return context.formatState().number.upper;
    }
    if (args.length > 2) {
      throw new RuntimeError(
        RuntimeErrorType.ArgumentMismatch,
        `'num-fmt-upper' expected at most 2 argument(s), got ${args.length}`
      );
    }
    context.formatState().number.upper = expectBoolArg(
      "num-fmt-upper",
      args[0] ?? null
    );
    return "";
  });

  addBuiltin(context, "num-fmt-endian", (...args) => {
    if (args.length === 0) {
      return context.formatState().number.endian;
    }
    if (args.length > 2) {
      throw new RuntimeError(
        RuntimeErrorType.ArgumentMismatch,
        `'num-fmt-endian' expected at most 2 argument(s), got ${args.length}`
      );
    }
    context.formatState().number.endian = parseEndian(
      "num-fmt-endian",
      args[0] ?? null
    );
    return "";
  });

  addBuiltin(context, "num-fmt-sign", (...args) => {
    if (args.length === 0) {
      return context.formatState().number.sign;
    }
    if (args.length > 2) {
      throw new RuntimeError(
        RuntimeErrorType.ArgumentMismatch,
        `'num-fmt-sign' expected at most 2 argument(s), got ${args.length}`
      );
    }
    context.formatState().number.sign = parseSign(
      "num-fmt-sign",
      args[0] ?? null
    );
    return "";
  });

  addBuiltin(context, "num-fmt-infinity", (...args) => {
    if (args.length === 0) {
      return context.formatState().number.infinity;
    }
    if (args.length > 2) {
      throw new RuntimeError(
        RuntimeErrorType.ArgumentMismatch,
        `'num-fmt-infinity' expected at most 2 argument(s), got ${args.length}`
      );
    }
    context.formatState().number.infinity = parseInfinity(
      "num-fmt-infinity",
      args[0] ?? null
    );
    return "";
  });

  addBuiltin(context, "num-fmt-group-sep", (...args) => {
    if (args.length === 0) {
      return context.formatState().number.groupSep;
    }
    if (args.length > 2) {
      throw new RuntimeError(
        RuntimeErrorType.ArgumentMismatch,
        `'num-fmt-group-sep' expected at most 2 argument(s), got ${args.length}`
      );
    }
    context.formatState().number.groupSep = expectStringArg(
      "num-fmt-group-sep",
      args[0] ?? null
    );
    return "";
  });

  addBuiltin(context, "num-fmt-decimal-sep", (...args) => {
    if (args.length === 0) {
      return context.formatState().number.decimalSep;
    }
    if (args.length > 2) {
      throw new RuntimeError(
        RuntimeErrorType.ArgumentMismatch,
        `'num-fmt-decimal-sep' expected at most 2 argument(s), got ${args.length}`
      );
    }
    context.formatState().number.decimalSep = expectStringArg(
      "num-fmt-decimal-sep",
      args[0] ?? null
    );
    return "";
  });

  void NUM_FMT_KEYS;
}
