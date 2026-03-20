import type { RantyInt } from "./int64";

const COLLECTION_KIND = Symbol("ranty-js.collection.kind");

export type RantyCollectionKind = "list" | "tuple";

export interface RantyRange {
  readonly type: "range";
  readonly start: RantyInt | bigint | number;
  readonly end: RantyInt | bigint | number;
  readonly step?: RantyInt | bigint | number;
}

export interface RantySelectorValue {
  readonly type: "selector";
  readonly mode: string;
  index: number;
  direction: 1 | -1;
  frozen: boolean;
  initialized: boolean;
  readonly matchValue?: RantyValue;
}

export interface RantyAttributeValue {
  readonly type: "attribute";
  readonly name:
    | "rep"
    | "sep"
    | "sel"
    | "mut"
    | "reset"
    | "if"
    | "elseif"
    | "else";
  readonly value: RantyValue;
}

export interface RantyTemporalValue {
  readonly type: "temporal";
  readonly values: readonly RantyValue[];
}

type TaggedCollection = {
  readonly [COLLECTION_KIND]?: RantyCollectionKind;
};

export type RantyMapValue = Map<string, RantyValue>;
export type RantyTupleValue = readonly RantyValue[] & TaggedCollection;
export type RantyListValue = RantyValue[] & TaggedCollection;
export type RantyCallable = (...args: readonly RantyValue[]) => RantyValue;
export type RantyScalar = string | number | bigint | boolean | null;
export type RantyValue =
  | RantyScalar
  | RantyRange
  | RantySelectorValue
  | RantyAttributeValue
  | RantyTemporalValue
  | RantyMapValue
  | RantyTupleValue
  | RantyListValue
  | RantyCallable;

function tagCollection<T extends RantyValue[] | readonly RantyValue[]>(
  values: T,
  kind: RantyCollectionKind
): T {
  Object.defineProperty(values, COLLECTION_KIND, {
    value: kind,
    enumerable: false,
    configurable: true
  });
  return values;
}

export function makeListValue(
  values: readonly RantyValue[] = []
): RantyListValue {
  return tagCollection([...values], "list") as RantyListValue;
}

export function makeTupleValue(
  values: readonly RantyValue[] = []
): RantyTupleValue {
  return tagCollection([...values], "tuple") as RantyTupleValue;
}

export function getCollectionKind(value: unknown): RantyCollectionKind | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return (value as TaggedCollection)[COLLECTION_KIND] === "tuple"
    ? "tuple"
    : "list";
}

export function isTupleValue(value: unknown): value is RantyTupleValue {
  return getCollectionKind(value) === "tuple";
}

export function isListValue(value: unknown): value is RantyListValue {
  return getCollectionKind(value) === "list";
}

export function cloneCollectionValue(
  value: readonly RantyValue[]
): RantyTupleValue | RantyListValue {
  return getCollectionKind(value) === "tuple"
    ? makeTupleValue(value)
    : makeListValue(value);
}

export function makeCollectionValue(
  kind: RantyCollectionKind,
  values: readonly RantyValue[] = []
): RantyTupleValue | RantyListValue {
  return kind === "tuple" ? makeTupleValue(values) : makeListValue(values);
}

export function makeTemporalValue(
  values: readonly RantyValue[] = []
): RantyTemporalValue {
  return {
    type: "temporal",
    values: [...values]
  };
}

export function isTemporalValue(value: unknown): value is RantyTemporalValue {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "temporal"
  );
}
