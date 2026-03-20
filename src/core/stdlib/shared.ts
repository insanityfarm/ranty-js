import { RuntimeError, RuntimeErrorType } from "../errors";
import type { Ranty } from "../ranty";
import { getCollectionKind, type RantyRange, type RantyValue } from "../values";
import { renderRantyValue } from "../util";

export type Builtin = (...args: readonly RantyValue[]) => RantyValue;

export function addBuiltin(context: Ranty, name: string, fn: Builtin): void {
  context.setGlobalConst(name, fn);
}

export function addConst(
  context: Ranty,
  name: string,
  value: RantyValue
): void {
  context.setGlobalConst(name, value);
}

export function expectArgCount(
  name: string,
  args: readonly RantyValue[],
  count: number
): void {
  if (args.length !== count) {
    throw new RuntimeError(
      RuntimeErrorType.ArgumentMismatch,
      `'${name}' expected ${count} argument(s), got ${args.length}`
    );
  }
}

export function expectMinArgCount(
  name: string,
  args: readonly RantyValue[],
  count: number
): void {
  if (args.length < count) {
    throw new RuntimeError(
      RuntimeErrorType.ArgumentMismatch,
      `'${name}' expected at least ${count} argument(s), got ${args.length}`
    );
  }
}

export function argAt(args: readonly RantyValue[], index: number): RantyValue {
  const value = args[index];
  if (value === undefined) {
    throw new RuntimeError(
      RuntimeErrorType.InternalError,
      `missing argument at index ${index}`
    );
  }
  return value;
}

export function asNumber(value: RantyValue, name: string): number {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  throw new RuntimeError(
    RuntimeErrorType.TypeError,
    `'${name}' expected a numeric value`
  );
}

export function asInteger(value: RantyValue, name: string): bigint {
  if (typeof value === "bigint") {
    return value;
  }

  if (typeof value === "number" && Number.isInteger(value)) {
    return BigInt(value);
  }

  throw new RuntimeError(
    RuntimeErrorType.TypeError,
    `'${name}' expected an integer value`
  );
}

export function asString(value: RantyValue, name: string): string {
  if (typeof value === "string") {
    return value;
  }

  throw new RuntimeError(
    RuntimeErrorType.TypeError,
    `'${name}' expected a string value`
  );
}

export function asList(value: RantyValue, name: string): RantyValue[] {
  if (Array.isArray(value)) {
    return value;
  }

  throw new RuntimeError(
    RuntimeErrorType.TypeError,
    `'${name}' expected a list or tuple value`
  );
}

export function asMap(
  value: RantyValue,
  name: string
): Map<string, RantyValue> {
  if (value instanceof Map) {
    return value;
  }

  throw new RuntimeError(
    RuntimeErrorType.TypeError,
    `'${name}' expected a map value`
  );
}

export function asCallable(value: RantyValue, name: string): Builtin {
  if (typeof value === "function") {
    return value;
  }

  throw new RuntimeError(
    RuntimeErrorType.CannotInvokeValue,
    `'${name}' expected a callable value`
  );
}

export function isTruthy(value: RantyValue): boolean {
  if (value == null) {
    return false;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return !Number.isNaN(value) && value !== 0;
  }

  if (typeof value === "bigint") {
    return value !== 0n;
  }

  if (typeof value === "string") {
    return value.length > 0;
  }

  if (Array.isArray(value)) {
    return getCollectionKind(value) === "tuple" ? true : value.length > 0;
  }

  if (value instanceof Map) {
    return value.size > 0;
  }

  return true;
}

export function toBoolean(value: RantyValue): boolean {
  return isTruthy(value);
}

export function toStringValue(value: RantyValue): string {
  return renderRantyValue(value);
}

export function toFloat(value: RantyValue, name: string): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  throw new RuntimeError(
    RuntimeErrorType.TypeError,
    `'${name}' could not convert value to float`
  );
}

export function toInt(value: RantyValue, name: string): bigint {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === "string" && value.trim() !== "") {
    try {
      if (value.includes(".")) {
        return BigInt(Math.trunc(Number(value)));
      }
      return BigInt(value);
    } catch {
      return failToInt(name);
    }
  }

  return failToInt(name);
}

function failToInt(name: string): never {
  throw new RuntimeError(
    RuntimeErrorType.TypeError,
    `'${name}' could not convert value to int`
  );
}

export function areEqual(left: RantyValue, right: RantyValue): boolean {
  if (typeof left === "function" || typeof right === "function") {
    return left === right;
  }

  if (typeof left === "bigint" && typeof right === "number") {
    return (
      Number.isFinite(right) &&
      Number.isInteger(right) &&
      left === BigInt(right)
    );
  }

  if (typeof left === "number" && typeof right === "bigint") {
    return (
      Number.isFinite(left) && Number.isInteger(left) && BigInt(left) === right
    );
  }

  if (left instanceof Map && right instanceof Map) {
    if (left.size !== right.size) {
      return false;
    }

    for (const [key, value] of left.entries()) {
      if (!right.has(key) || !areEqual(value, right.get(key) ?? null)) {
        return false;
      }
    }

    return true;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((value, index) => areEqual(value, argAt(right, index)))
    );
  }

  return Object.is(left, right);
}

export function mapKey(value: RantyValue): string {
  if (typeof value === "string") {
    return value;
  }

  return renderRantyValue(value);
}

export function rangeValue(
  start: bigint | number,
  end: bigint | number,
  step?: bigint | number
): RantyRange {
  return {
    type: "range",
    start,
    end,
    ...(step === undefined ? {} : { step })
  };
}

export function numericExtrema(
  args: readonly RantyValue[],
  name: string,
  mode: "min" | "max"
): RantyValue {
  expectMinArgCount(name, args, 1);
  const values: number[] = [];
  const visit = (value: RantyValue): void => {
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }
    values.push(asNumber(value, name));
  };

  for (const arg of args) {
    visit(arg);
  }
  return mode === "min" ? Math.min(...values) : Math.max(...values);
}
