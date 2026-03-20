import { BUILD_VERSION, RANTY_LANG_VERSION } from "../constants";
import { RuntimeError, RuntimeErrorType } from "../errors";
import { toExactInt } from "../int64";
import type { Ranty } from "../ranty";
import { getCollectionKind, type RantyRange, type RantyValue } from "../values";
import { renderRantyValue } from "../util";
import {
  addBuiltin,
  addConst,
  argAt,
  asCallable,
  expectArgCount,
  expectMinArgCount,
  isTruthy,
  rangeValue
} from "./shared";

const MIN_INT = -(1n << 63n);
const MAX_INT = (1n << 63n) - 1n;

function typeName(value: RantyValue): string {
  if (value == null) {
    return "nothing";
  }
  if (typeof value === "bigint") {
    return "int";
  }
  if (typeof value === "number") {
    return "float";
  }
  if (typeof value === "string") {
    return "string";
  }
  if (typeof value === "boolean") {
    return "bool";
  }
  if (typeof value === "function") {
    return "function";
  }
  if (value instanceof Map) {
    return "map";
  }
  if (Array.isArray(value)) {
    return getCollectionKind(value) === "tuple" ? "tuple" : "list";
  }
  if (typeof value === "object" && value !== null && "type" in value) {
    if (value.type === "range") {
      return "range";
    }
    if (value.type === "selector") {
      return "selector";
    }
  }
  return "value";
}

function isRangeValue(value: RantyValue): value is RantyRange {
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
    typeof step === "bigint"
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

function inclusiveRangeEnd(
  start: bigint | number,
  end: bigint | number,
  step?: bigint | number
): bigint | number {
  if (
    typeof start === "bigint" ||
    typeof end === "bigint" ||
    typeof step === "bigint"
  ) {
    const startInt = typeof start === "bigint" ? start : BigInt(start);
    const endInt = typeof end === "bigint" ? end : BigInt(end);
    const rawStep =
      step === undefined
        ? startInt <= endInt
          ? 1n
          : -1n
        : typeof step === "bigint"
          ? step
          : BigInt(step);
    const direction = rawStep === 0n ? 0n : rawStep > 0n ? 1n : -1n;
    return endInt + direction;
  }

  const rawStep =
    step === undefined ? (Number(start) <= Number(end) ? 1 : -1) : Number(step);
  const direction = rawStep === 0 ? 0 : rawStep > 0 ? 1 : -1;
  return Number(end) + direction;
}

function defaultModuleAlias(modulePath: string): string {
  const normalized = modulePath.replaceAll("\\", "/");
  const base = normalized.split("/").at(-1) ?? normalized;
  return base.replace(/\.(ranty|rant)$/u, "");
}

export function loadGeneralStdlib(context: Ranty): void {
  addConst(context, "BUILD_VERSION", BUILD_VERSION);
  addConst(context, "RANTY_VERSION", RANTY_LANG_VERSION);
  addConst(context, "EPSILON", Number.EPSILON);
  addConst(context, "MIN_FLOAT", Number.MIN_VALUE);
  addConst(context, "MAX_FLOAT", Number.MAX_VALUE);
  addConst(context, "MIN_INT", MIN_INT);
  addConst(context, "MAX_INT", MAX_INT);
  addConst(context, "INFINITY", Number.POSITIVE_INFINITY);
  addConst(context, "NEG_INFINITY", Number.NEGATIVE_INFINITY);
  addConst(context, "NAN", Number.NaN);

  addBuiltin(context, "call", (...args) => {
    expectMinArgCount("call", args, 1);
    return asCallable(argAt(args, 0), "call")(...args.slice(1));
  });

  addBuiltin(context, "cat", (...args) => {
    if (args.length === 0) {
      return "";
    }
    if (args.length === 1) {
      return argAt(args, 0);
    }
    return args.map((arg) => renderRantyValue(arg)).join("");
  });

  addBuiltin(context, "either", (...args) => {
    expectArgCount("either", args, 3);
    return isTruthy(argAt(args, 0)) ? argAt(args, 1) : argAt(args, 2);
  });

  addBuiltin(context, "alt", (...args) => {
    expectMinArgCount("alt", args, 1);
    return args.find((arg) => arg != null) ?? "";
  });

  addBuiltin(context, "len", (...args) => {
    expectArgCount("len", args, 1);
    const value = argAt(args, 0);
    if (typeof value === "string") {
      return BigInt(Array.from(value).length);
    }
    if (Array.isArray(value)) {
      return BigInt(value.length);
    }
    if (value instanceof Map) {
      return BigInt(value.size);
    }
    if (isRangeValue(value)) {
      return BigInt(rangeLength(value));
    }
    return value == null ? 0n : 1n;
  });

  addBuiltin(context, "type", (...args) => {
    expectArgCount("type", args, 1);
    return typeName(argAt(args, 0));
  });

  addBuiltin(context, "seed", (...args) => {
    expectArgCount("seed", args, 0);
    return context.seed();
  });

  addBuiltin(context, "tap", (..._args) => {
    return "";
  });

  addBuiltin(context, "print", (...args) =>
    args.map((arg) => renderRantyValue(arg)).join("")
  );

  addBuiltin(context, "error", (...args) => {
    expectArgCount("error", args, 1);
    throw new RuntimeError(
      RuntimeErrorType.UserError,
      renderRantyValue(argAt(args, 0))
    );
  });

  addBuiltin(context, "range", (...args) => {
    if (args.length < 2 || args.length > 3) {
      throw new TypeError("range expects 2 or 3 arguments");
    }
    return rangeValue(
      argAt(args, 0) as bigint | number,
      argAt(args, 1) as bigint | number,
      args.length === 3 ? (argAt(args, 2) as bigint | number) : undefined
    );
  });

  addBuiltin(context, "irange", (...args) => {
    if (args.length < 2 || args.length > 3) {
      throw new TypeError("irange expects 2 or 3 arguments");
    }
    const start = argAt(args, 0) as bigint | number;
    const end = argAt(args, 1) as bigint | number;
    const step =
      args.length === 3 ? (argAt(args, 2) as bigint | number) : undefined;
    return rangeValue(start, inclusiveRangeEnd(start, end, step), step);
  });

  addBuiltin(context, "require", (...args) => {
    expectArgCount("require", args, 1);
    const modulePath = argAt(args, 0);
    if (typeof modulePath !== "string") {
      throw new RuntimeError(
        RuntimeErrorType.ArgumentError,
        "'require' expected a string path"
      );
    }

    const activeVm = context.activeVm();
    if (!activeVm) {
      throw new RuntimeError(
        RuntimeErrorType.InvalidOperation,
        "require requires an active VM"
      );
    }

    const moduleValue = context.loadModule(modulePath, activeVm.program.info);
    activeVm.bindLocal(defaultModuleAlias(modulePath), moduleValue);
    return "";
  });

  addBuiltin(context, "fork", (...args) => {
    if (args.length > 1) {
      throw new RuntimeError(
        RuntimeErrorType.ArgumentMismatch,
        `'fork' expected at most 1 argument(s), got ${args.length}`
      );
    }

    const seed = args[0];
    if (seed == null) {
      context.pushRng(context.rng().forkRandom());
      return "";
    }

    if (typeof seed === "bigint" || typeof seed === "number") {
      context.pushRng(context.rng().forkI64(seed));
      return "";
    }

    if (typeof seed === "string") {
      context.pushRng(context.rng().forkStr(seed));
      return "";
    }

    throw new RuntimeError(
      RuntimeErrorType.ArgumentError,
      `seeding fork with '${typeName(seed)}' value is not supported`
    );
  });

  addBuiltin(context, "unfork", (...args) => {
    expectArgCount("unfork", args, 0);
    if (!context.popRng()) {
      throw new RuntimeError(
        RuntimeErrorType.InvalidOperation,
        "cannot unfork root seed"
      );
    }
    return "";
  });

  addBuiltin(context, "try", (...args) => {
    if (args.length < 1 || args.length > 2) {
      throw new RuntimeError(
        RuntimeErrorType.ArgumentMismatch,
        `'try' expected 1 or 2 argument(s), got ${args.length}`
      );
    }

    const contextFn = asCallable(argAt(args, 0), "try");
    const handler =
      args.length === 2 ? asCallable(argAt(args, 1), "try") : null;

    try {
      return contextFn();
    } catch (error) {
      if (!handler) {
        return "";
      }
      if (error instanceof Error) {
        return handler(error.message);
      }
      return handler(String(error));
    }
  });

  addBuiltin(context, "ds-request", (...args) => {
    expectMinArgCount("ds-request", args, 1);
    const id = argAt(args, 0);
    if (typeof id !== "string") {
      throw new RuntimeError(
        RuntimeErrorType.ArgumentError,
        "'ds-request' expected a string source id"
      );
    }

    const source = context.dataSource(id);
    if (!source) {
      throw new RuntimeError(
        RuntimeErrorType.DataSourceError,
        `data source '${id}' not found`
      );
    }

    try {
      return source.requestData(args.slice(1));
    } catch (error) {
      if (error instanceof RuntimeError) {
        throw error;
      }
      if (error instanceof Error) {
        throw new RuntimeError(RuntimeErrorType.DataSourceError, error.message);
      }
      throw new RuntimeError(RuntimeErrorType.DataSourceError, String(error));
    }
  });

  addBuiltin(context, "ds-query-sources", (...args) => {
    expectArgCount("ds-query-sources", args, 0);
    return [...context.iterDataSources()].map(([id]) => id);
  });
}
