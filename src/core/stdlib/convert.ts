import { toExactInt } from "../int64";
import type { Ranty } from "../ranty";
import {
  makeListValue,
  makeTupleValue,
  type RantyRange,
  type RantyValue
} from "../values";
import {
  addBuiltin,
  argAt,
  expectArgCount,
  toBoolean,
  toFloat,
  toInt,
  toStringValue
} from "./shared";

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

function rangeValueAt(range: RantyRange, index: number): RantyValue {
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

function rangeItems(range: RantyRange): readonly RantyValue[] {
  return Array.from({ length: rangeLength(range) }, (_, index) =>
    rangeValueAt(range, index)
  );
}

export function loadConvertStdlib(context: Ranty): void {
  addBuiltin(context, "to-int", (...args) => {
    expectArgCount("to-int", args, 1);
    return toInt(argAt(args, 0), "to-int");
  });

  addBuiltin(context, "to-float", (...args) => {
    expectArgCount("to-float", args, 1);
    return toFloat(argAt(args, 0), "to-float");
  });

  addBuiltin(context, "to-string", (...args) => {
    expectArgCount("to-string", args, 1);
    return toStringValue(argAt(args, 0));
  });

  addBuiltin(context, "to-bool", (...args) => {
    expectArgCount("to-bool", args, 1);
    return toBoolean(argAt(args, 0));
  });

  addBuiltin(context, "to-list", (...args) => {
    expectArgCount("to-list", args, 1);
    const value = argAt(args, 0);
    if (Array.isArray(value)) {
      return makeListValue(value);
    }
    if (isRangeValue(value)) {
      return makeListValue(rangeItems(value));
    }
    if (typeof value === "string") {
      return makeListValue(Array.from(value));
    }
    return makeListValue([value]);
  });

  addBuiltin(context, "to-tuple", (...args) => {
    expectArgCount("to-tuple", args, 1);
    const value = argAt(args, 0);
    if (Array.isArray(value)) {
      return makeTupleValue(value);
    }
    if (isRangeValue(value)) {
      return makeTupleValue(rangeItems(value));
    }
    if (typeof value === "string") {
      return makeTupleValue(Array.from(value));
    }
    return makeTupleValue([value]);
  });
}
