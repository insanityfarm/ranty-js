import { RuntimeError, RuntimeErrorType } from "../errors";
import { toExactInt } from "../int64";
import type { Ranty } from "../ranty";
import type { RantyRange, RantyValue } from "../values";
import {
  addBuiltin,
  argAt,
  asInteger,
  expectArgCount,
  expectMinArgCount,
  toFloat
} from "./shared";

function buildRandomChars(
  context: Ranty,
  chars: string,
  count: number
): string {
  let output = "";
  for (let index = 0; index < count; index += 1) {
    output += chars[context.rng().nextUsize(chars.length)];
  }
  return output;
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

function rangeIndex(range: RantyRange, index: number): RantyValue {
  if (index < 0 || index >= rangeLength(range)) {
    throw new RuntimeError(
      RuntimeErrorType.IndexError,
      "range index out of range"
    );
  }

  const step = rangeStep(range);
  if (
    typeof range.start === "bigint" ||
    typeof step === "bigint" ||
    typeof range.start === "object"
  ) {
    return (
      toExactInt(range.start) +
      BigInt(index) * (typeof step === "bigint" ? step : toExactInt(step))
    );
  }

  return Number(range.start) + index * Number(step);
}

function collectionLength(value: RantyValue): number {
  if (typeof value === "string") {
    return Array.from(value).length;
  }
  if (Array.isArray(value)) {
    return value.length;
  }
  if (value instanceof Map) {
    return value.size;
  }
  if (isRangeValue(value)) {
    return rangeLength(value);
  }
  if (value == null) {
    return 0;
  }
  return 1;
}

function indexCollectionValue(
  value: RantyValue,
  index: number,
  name: string
): RantyValue {
  if (typeof value === "string") {
    const chars = Array.from(value);
    const item = chars[index];
    if (item === undefined) {
      throw new RuntimeError(
        RuntimeErrorType.IndexError,
        `'${name}' index out of range`
      );
    }
    return item;
  }
  if (Array.isArray(value)) {
    const item = value[index];
    if (item === undefined) {
      throw new RuntimeError(
        RuntimeErrorType.IndexError,
        `'${name}' index out of range`
      );
    }
    return item;
  }
  if (isRangeValue(value)) {
    return rangeIndex(value, index);
  }
  if (index === 0) {
    return value;
  }
  throw new RuntimeError(
    RuntimeErrorType.IndexError,
    `'${name}' index out of range`
  );
}

export function loadGenerateStdlib(context: Ranty): void {
  addBuiltin(context, "rand", (...args) => {
    expectArgCount("rand", args, 2);
    return context
      .rng()
      .nextI64(
        asInteger(argAt(args, 0), "rand"),
        asInteger(argAt(args, 1), "rand")
      );
  });

  addBuiltin(context, "randf", (...args) => {
    expectArgCount("randf", args, 2);
    const a = argAt(args, 0);
    const b = argAt(args, 1);
    return context.rng().nextF64(Number(a), Number(b));
  });

  addBuiltin(context, "rand-list", (...args) => {
    expectArgCount("rand-list", args, 3);
    const min = asInteger(argAt(args, 0), "rand-list");
    const max = asInteger(argAt(args, 1), "rand-list");
    const count = Number(asInteger(argAt(args, 2), "rand-list"));
    return Array.from({ length: count }, () => context.rng().nextI64(min, max));
  });

  addBuiltin(context, "randf-list", (...args) => {
    expectArgCount("randf-list", args, 3);
    const min = Number(argAt(args, 0));
    const max = Number(argAt(args, 1));
    const count = Number(asInteger(argAt(args, 2), "randf-list"));
    return Array.from({ length: count }, () => context.rng().nextF64(min, max));
  });

  addBuiltin(context, "alpha", (...args) => {
    const count =
      args.length === 0 ? 1 : Number(asInteger(argAt(args, 0), "alpha"));
    return buildRandomChars(context, "abcdefghijklmnopqrstuvwxyz", count);
  });

  addBuiltin(context, "dig", (...args) => {
    const count =
      args.length === 0 ? 1 : Number(asInteger(argAt(args, 0), "dig"));
    return buildRandomChars(context, "0123456789", count);
  });

  addBuiltin(context, "digh", (...args) => {
    const count =
      args.length === 0 ? 1 : Number(asInteger(argAt(args, 0), "digh"));
    return buildRandomChars(context, "0123456789abcdef", count);
  });

  addBuiltin(context, "dignz", (...args) => {
    const count =
      args.length === 0 ? 1 : Number(asInteger(argAt(args, 0), "dignz"));
    return buildRandomChars(context, "123456789", count);
  });

  addBuiltin(context, "pick", (...args) => {
    expectMinArgCount("pick", args, 1);
    if (args.length === 1) {
      const input = argAt(args, 0);
      const len = collectionLength(input);
      if (len === 0) {
        return "";
      }
      return indexCollectionValue(input, context.rng().nextUsize(len), "pick");
    }
    return argAt(args, context.rng().nextUsize(args.length));
  });

  addBuiltin(context, "maybe", (...args) => {
    if (args.length > 1) {
      throw new RuntimeError(
        RuntimeErrorType.ArgumentMismatch,
        `'maybe' expected at most 1 argument(s), got ${args.length}`
      );
    }
    const probability =
      args.length === 0 || args[0] == null
        ? 0.5
        : toFloat(argAt(args, 0), "maybe");
    return context.rng().nextBool(probability);
  });

  addBuiltin(context, "pickn", (...args) => {
    expectArgCount("pickn", args, 2);
    const input = argAt(args, 0);
    const count = Number(asInteger(argAt(args, 1), "pickn"));
    if (!Number.isInteger(count) || count < 0) {
      throw new RuntimeError(
        RuntimeErrorType.ArgumentError,
        "pick count must be non-negative"
      );
    }

    const len = collectionLength(input);
    if (len === 0) {
      return [];
    }

    return Array.from({ length: count }, () =>
      indexCollectionValue(input, context.rng().nextUsize(len), "pickn")
    );
  });

  addBuiltin(context, "pick-sparse", (...args) => {
    expectMinArgCount("pick-sparse", args, 1);
    const lengths = args.map((value) => collectionLength(value));
    const total = lengths.reduce((sum, value) => sum + value, 0);
    if (total <= 0) {
      return "";
    }

    let remainder = context.rng().nextUsize(total);
    for (const [index, item] of args.entries()) {
      const length = lengths[index] ?? 0;
      if (remainder < length) {
        return collectionLength(item) > 1
          ? indexCollectionValue(item, remainder, "pick-sparse")
          : item;
      }
      remainder -= length;
    }

    return "";
  });

  addBuiltin(context, "rand-list-sum", (...args) => {
    if (args.length < 2 || args.length > 3) {
      throw new RuntimeError(
        RuntimeErrorType.ArgumentMismatch,
        `'rand-list-sum' expected 2 or 3 argument(s), got ${args.length}`
      );
    }

    const input = argAt(args, 0);
    const count = Number(asInteger(argAt(args, 1), "rand-list-sum"));
    if (!Number.isInteger(count) || count <= 0) {
      throw new RuntimeError(
        RuntimeErrorType.ArgumentError,
        "shred count must be greater than zero"
      );
    }

    if (typeof input === "bigint") {
      const variance =
        args.length === 3 ? asInteger(argAt(args, 2), "rand-list-sum") : 0n;
      const quotient = input / BigInt(count);
      const remainder = input % BigInt(count);
      const shreds: bigint[] = Array.from({ length: count }, (_, index) =>
        index === 0 ? quotient + remainder : quotient
      );

      const maxShift = variance < 0n ? -variance : variance;
      for (let index = 0; index < count; index += 1) {
        const shift = context.rng().nextI64(0n, maxShift + 1n);
        shreds[index] = (shreds[index] ?? 0n) - shift;
        shreds[(index + 1) % count] =
          (shreds[(index + 1) % count] ?? 0n) + shift;
      }

      return shreds;
    }

    if (typeof input === "number") {
      const variance =
        args.length === 3
          ? Math.abs(toFloat(argAt(args, 2), "rand-list-sum"))
          : 0;
      const quotient = input / count;
      const remainder = input % count;
      const shreds: number[] = Array.from({ length: count }, (_, index) =>
        index === 0 ? quotient + remainder : quotient
      );

      for (let index = 0; index < count; index += 1) {
        const shift = context.rng().nextF64(0, variance);
        shreds[index] = (shreds[index] ?? 0) - shift;
        shreds[(index + 1) % count] =
          (shreds[(index + 1) % count] ?? 0) + shift;
      }

      return shreds;
    }

    throw new RuntimeError(
      RuntimeErrorType.ArgumentError,
      "cannot shred non-numeric value"
    );
  });
}
