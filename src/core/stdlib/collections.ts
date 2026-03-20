import { RuntimeError, RuntimeErrorType } from "../errors";
import {
  getMapChainValue,
  getMapPrototype,
  setMapPrototype
} from "../map-proto";
import type { Ranty } from "../ranty";
import {
  cloneCollectionValue,
  getCollectionKind,
  makeListValue,
  makeTupleValue,
  type RantyValue
} from "../values";
import { renderRantyValue } from "../util";
import {
  addBuiltin,
  argAt,
  areEqual,
  asCallable,
  asInteger,
  asList,
  asMap,
  expectArgCount,
  mapKey
} from "./shared";

function typeName(value: RantyValue): string {
  if (value == null) {
    return "nothing";
  }
  if (typeof value === "string") {
    return "string";
  }
  if (typeof value === "boolean") {
    return "bool";
  }
  if (typeof value === "bigint") {
    return "int";
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? "int" : "float";
  }
  if (typeof value === "function") {
    return "function";
  }
  if (Array.isArray(value)) {
    return getCollectionKind(value) === "tuple" ? "tuple" : "list";
  }
  if (value instanceof Map) {
    return "map";
  }
  if (typeof value === "object" && value !== null && "type" in value) {
    return typeof value.type === "string" ? value.type : "value";
  }
  return "value";
}

function cloneMap(map: Map<string, RantyValue>): Map<string, RantyValue> {
  const copy = new Map<string, RantyValue>(map.entries());
  const proto = getMapPrototype(map);
  if (proto) {
    setMapPrototype(copy, proto);
  }
  return copy;
}

function cloneValue(value: RantyValue): RantyValue {
  if (Array.isArray(value)) {
    return cloneCollectionValue(value);
  }
  if (value instanceof Map) {
    return cloneMap(value);
  }
  return value;
}

function valuesToMap(args: readonly RantyValue[]): Map<string, RantyValue> {
  const map = new Map<string, RantyValue>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (key === undefined || value === undefined) {
      break;
    }
    map.set(mapKey(key), value);
  }
  return map;
}

function toNumericComparable(value: RantyValue): bigint | number | null {
  if (typeof value === "bigint" || typeof value === "number") {
    return value;
  }
  if (typeof value === "boolean") {
    return value ? 1n : 0n;
  }
  return null;
}

function compareValues(left: RantyValue, right: RantyValue): number {
  if (areEqual(left, right)) {
    return 0;
  }

  const leftNumeric = toNumericComparable(left);
  const rightNumeric = toNumericComparable(right);
  if (leftNumeric != null && rightNumeric != null) {
    if (typeof leftNumeric === "bigint" && typeof rightNumeric === "bigint") {
      return leftNumeric < rightNumeric ? -1 : 1;
    }
    return Number(leftNumeric) < Number(rightNumeric) ? -1 : 1;
  }

  if (typeof left === "string" && typeof right === "string") {
    return left < right ? -1 : 1;
  }

  const leftText = renderRantyValue(left);
  const rightText = renderRantyValue(right);
  if (leftText === rightText) {
    return 0;
  }
  return leftText < rightText ? -1 : 1;
}

function addValues(left: RantyValue, right: RantyValue): RantyValue {
  if (left == null && right == null) {
    return null;
  }
  if (right == null) {
    return cloneValue(left);
  }
  if (left == null) {
    return cloneValue(right);
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
    return kind === "tuple"
      ? makeTupleValue([...left, ...right])
      : makeListValue([...left, ...right]);
  }
  if (left instanceof Map && right instanceof Map) {
    const map = cloneMap(left);
    for (const [key, value] of right.entries()) {
      map.set(key, value);
    }
    return map;
  }

  return `${renderRantyValue(left)}${renderRantyValue(right)}`;
}

function asNonNegativeCount(value: RantyValue, name: string): number {
  const count = Number(asInteger(value, name));
  if (!Number.isInteger(count) || count < 0) {
    throw new RuntimeError(
      RuntimeErrorType.ArgumentError,
      `'${name}' expected a non-negative integer value`
    );
  }
  return count;
}

function expectListIndex(
  value: RantyValue,
  name: string,
  action: string
): number {
  const index = Number(asInteger(value, name));
  if (!Number.isInteger(index)) {
    throw new RuntimeError(
      RuntimeErrorType.ArgumentError,
      `cannot ${action} list by '${typeName(value)}' index`
    );
  }
  return index;
}

function ensureIndexRange(index: number, length: number): void {
  if (index < 0 || index >= length) {
    throw new RuntimeError(
      RuntimeErrorType.IndexError,
      "index is out of range of list size"
    );
  }
}

function orderedCollectionLength(value: RantyValue, name: string): number {
  if (typeof value === "string") {
    return Array.from(value).length;
  }
  if (Array.isArray(value)) {
    return value.length;
  }
  throw new RuntimeError(
    RuntimeErrorType.ArgumentError,
    `${name}: type '${typeName(value)}' cannot be chunked`
  );
}

function orderedCollectionSlice(
  value: RantyValue,
  from: number,
  to: number
): RantyValue {
  if (typeof value === "string") {
    return Array.from(value).slice(from, to).join("");
  }
  if (Array.isArray(value)) {
    return getCollectionKind(value) === "tuple"
      ? makeTupleValue(value.slice(from, to))
      : makeListValue(value.slice(from, to));
  }
  return makeListValue();
}

function shuffleInPlace(context: Ranty, list: RantyValue[]): void {
  if (list.length === 0) {
    return;
  }

  for (let index = 0; index < list.length; index += 1) {
    const swapIndex = context.rng().nextUsize(list.length);
    const current = list[index];
    list[index] = list[swapIndex] ?? null;
    list[swapIndex] = current ?? null;
  }
}

function siftInPlace(context: Ranty, list: RantyValue[], size: number): void {
  while (list.length > size) {
    list.splice(context.rng().nextUsize(list.length), 1);
  }
}

function squishInPlace(
  context: Ranty,
  list: RantyValue[],
  targetSize: number
): void {
  if (targetSize === 0) {
    throw new RuntimeError(
      RuntimeErrorType.ArgumentError,
      "cannot squish to a target size of 0"
    );
  }

  while (list.length > targetSize && list.length >= 2) {
    const leftIndex = context.rng().nextUsize(list.length - 1);
    const rightIndex = leftIndex + 1;
    const left = list[leftIndex] ?? null;
    const [right] = list.splice(rightIndex, 1);
    list[leftIndex] = addValues(left, right ?? null);
  }
}

export function loadCollectionsStdlib(context: Ranty): void {
  addBuiltin(context, "assoc", (...args) => {
    if (args.length === 2 && Array.isArray(args[0]) && Array.isArray(args[1])) {
      const keys = asList(argAt(args, 0), "assoc");
      const values = asList(argAt(args, 1), "assoc");
      if (keys.length !== values.length) {
        throw new RuntimeError(
          RuntimeErrorType.ArgumentError,
          "assoc: key and value counts don't match"
        );
      }

      const map = new Map<string, RantyValue>();
      for (const [index, key] of keys.entries()) {
        map.set(mapKey(key), values[index] ?? null);
      }
      return map;
    }

    return valuesToMap(args);
  });

  addBuiltin(context, "list", (...args) => makeListValue(args));
  addBuiltin(context, "tuple", (...args) => makeTupleValue(args));
  addBuiltin(context, "nlist", (...args) =>
    makeListValue([makeListValue(args)])
  );

  addBuiltin(context, "keys", (...args) => {
    expectArgCount("keys", args, 1);
    return makeListValue([...asMap(argAt(args, 0), "keys").keys()]);
  });

  addBuiltin(context, "values", (...args) => {
    expectArgCount("values", args, 1);
    return makeListValue([...asMap(argAt(args, 0), "values").values()]);
  });

  addBuiltin(context, "clear", (...args) => {
    expectArgCount("clear", args, 1);
    const value = argAt(args, 0);
    if (value instanceof Map) {
      value.clear();
      return "";
    }
    const list = asList(value, "clear");
    list.length = 0;
    return "";
  });

  addBuiltin(context, "has", (...args) => {
    expectArgCount("has", args, 2);
    const value = argAt(args, 0);
    const key = argAt(args, 1);
    if (value instanceof Map) {
      return typeof key === "string" && value.has(key);
    }
    if (Array.isArray(value)) {
      return value.some((item) => areEqual(item, key));
    }
    throw new RuntimeError(
      RuntimeErrorType.ArgumentError,
      `unable to check if value of type '${typeName(value)}' contains element of type '${typeName(
        key
      )}'`
    );
  });

  addBuiltin(context, "insert", (...args) => {
    expectArgCount("insert", args, 3);
    const target = argAt(args, 0);
    const value = argAt(args, 1);
    const position = argAt(args, 2);

    if (target instanceof Map) {
      target.set(mapKey(position), value);
      return "";
    }

    const list = asList(target, "insert");
    const index = expectListIndex(position, "insert", "insert into");
    if (index < 0 || index > list.length) {
      throw new RuntimeError(
        RuntimeErrorType.IndexError,
        "index is out of range of list size"
      );
    }
    list.splice(index, 0, value);
    return "";
  });

  addBuiltin(context, "remove", (...args) => {
    expectArgCount("remove", args, 2);
    const target = argAt(args, 0);
    const position = argAt(args, 1);

    if (target instanceof Map) {
      target.delete(mapKey(position));
      return "";
    }

    const list = asList(target, "remove");
    const index = expectListIndex(position, "remove", "remove from");
    ensureIndexRange(index, list.length);
    list.splice(index, 1);
    return "";
  });

  addBuiltin(context, "take", (...args) => {
    expectArgCount("take", args, 2);
    const target = argAt(args, 0);
    const position = argAt(args, 1);

    if (target instanceof Map) {
      const key = mapKey(position);
      if (!target.has(key)) {
        throw new RuntimeError(
          RuntimeErrorType.KeyError,
          `tried to take non-existent key: '${key}'`
        );
      }
      const value = target.get(key) ?? null;
      target.delete(key);
      return value;
    }

    const list = asList(target, "take");
    const index = expectListIndex(position, "take", "take from");
    ensureIndexRange(index, list.length);
    list.splice(index, 1);
    return "";
  });

  addBuiltin(context, "join", (...args) => {
    if (args.length < 1 || args.length > 2) {
      throw new TypeError("join expects 1 or 2 arguments");
    }
    const list = asList(argAt(args, 0), "join");
    const separator = args.length === 2 ? renderRantyValue(argAt(args, 1)) : "";
    return list.map((item) => renderRantyValue(item)).join(separator);
  });

  addBuiltin(context, "oxford-join", (...args) => {
    expectArgCount("oxford-join", args, 4);
    const comma = renderRantyValue(argAt(args, 0));
    const conjunction = renderRantyValue(argAt(args, 1));
    const commaConjunction = renderRantyValue(argAt(args, 2));
    const list = asList(argAt(args, 3), "oxford-join");

    return list
      .map((value, index) => {
        if (index === 0 || list.length === 1) {
          return renderRantyValue(value);
        }
        if (index === 1 && list.length === 2) {
          return `${conjunction}${renderRantyValue(value)}`;
        }
        if (index < list.length - 1) {
          return `${comma}${renderRantyValue(value)}`;
        }
        return `${commaConjunction}${renderRantyValue(value)}`;
      })
      .join("");
  });

  addBuiltin(context, "sum", (...args) => {
    expectArgCount("sum", args, 1);
    const list = asList(argAt(args, 0), "sum");
    if (list.length === 0) {
      return "";
    }
    let result = cloneValue(list[0] ?? null);
    for (let index = 1; index < list.length; index += 1) {
      result = addValues(result, list[index] ?? null);
    }
    return result;
  });

  addBuiltin(context, "push", (...args) => {
    expectArgCount("push", args, 2);
    const list = asList(argAt(args, 0), "push");
    list.push(argAt(args, 1));
    return "";
  });

  addBuiltin(context, "pop", (...args) => {
    expectArgCount("pop", args, 1);
    return asList(argAt(args, 0), "pop").pop() ?? null;
  });

  addBuiltin(context, "rev", (...args) => {
    expectArgCount("rev", args, 1);
    const value = argAt(args, 0);
    if (typeof value === "string") {
      return Array.from(value).reverse().join("");
    }
    return [...asList(value, "rev")].reverse();
  });

  addBuiltin(context, "translate", (...args) => {
    expectArgCount("translate", args, 2);
    const list = asList(argAt(args, 0), "translate");
    const map = asMap(argAt(args, 1), "translate");
    return list.map((value) => map.get(renderRantyValue(value)) ?? value);
  });

  addBuiltin(context, "filter", (...args) => {
    expectArgCount("filter", args, 2);
    const list = asList(argAt(args, 0), "filter");
    const predicate = asCallable(argAt(args, 1), "filter");
    const result: RantyValue[] = [];

    for (const item of list) {
      const passed = predicate(item);
      if (typeof passed !== "boolean") {
        throw new RuntimeError(
          RuntimeErrorType.TypeError,
          `filter callback expected to return 'bool' value, but returned '${typeName(
            passed as RantyValue
          )}' instead`
        );
      }
      if (passed) {
        result.push(item);
      }
    }

    return result;
  });

  addBuiltin(context, "map", (...args) => {
    expectArgCount("map", args, 2);
    const list = asList(argAt(args, 0), "map");
    const mapFn = asCallable(argAt(args, 1), "map");
    return list.map((item) => mapFn(item));
  });

  addBuiltin(context, "zip", (...args) => {
    expectArgCount("zip", args, 3);
    const listA = asList(argAt(args, 0), "zip");
    const listB = asList(argAt(args, 1), "zip");
    const zipFn = asCallable(argAt(args, 2), "zip");
    const result: RantyValue[] = [];
    const maxLength = Math.max(listA.length, listB.length);

    for (let index = 0; index < maxLength; index += 1) {
      result.push(zipFn(listA[index] ?? null, listB[index] ?? null));
    }

    return result;
  });

  addBuiltin(context, "augment-self", (...args) => {
    expectArgCount("augment-self", args, 2);
    const toMap = asMap(argAt(args, 0), "augment-self");
    const fromMap = asMap(argAt(args, 1), "augment-self");

    for (const [key, value] of fromMap.entries()) {
      const existing = getMapChainValue(toMap, key);
      toMap.set(key, existing.found ? addValues(existing.value, value) : value);
    }

    return "";
  });

  addBuiltin(context, "augment-thru", (...args) => {
    expectArgCount("augment-thru", args, 2);
    const toMap = asMap(argAt(args, 0), "augment-thru");
    const fromMap = asMap(argAt(args, 1), "augment-thru");

    for (const [key, value] of fromMap.entries()) {
      const existing = getMapChainValue(toMap, key);
      toMap.set(key, existing.found ? addValues(existing.value, value) : value);
    }

    return toMap;
  });

  addBuiltin(context, "augment", (...args) => {
    expectArgCount("augment", args, 2);
    const copy = cloneMap(asMap(argAt(args, 0), "augment"));
    const fromMap = asMap(argAt(args, 1), "augment");

    for (const [key, value] of fromMap.entries()) {
      const existing = getMapChainValue(copy, key);
      copy.set(key, existing.found ? addValues(existing.value, value) : value);
    }

    return copy;
  });

  addBuiltin(context, "index-of", (...args) => {
    expectArgCount("index-of", args, 2);
    const list = asList(argAt(args, 0), "index-of");
    const value = argAt(args, 1);
    const index = list.findIndex((item) => areEqual(item, value));
    return index >= 0 ? BigInt(index) : null;
  });

  addBuiltin(context, "last-index-of", (...args) => {
    expectArgCount("last-index-of", args, 2);
    const list = asList(argAt(args, 0), "last-index-of");
    const value = argAt(args, 1);
    for (let index = list.length - 1; index >= 0; index -= 1) {
      if (areEqual(list[index] ?? null, value)) {
        return BigInt(index);
      }
    }
    return null;
  });

  addBuiltin(context, "shuffle-self", (...args) => {
    expectArgCount("shuffle-self", args, 1);
    shuffleInPlace(context, asList(argAt(args, 0), "shuffle-self"));
    return "";
  });

  addBuiltin(context, "shuffle-thru", (...args) => {
    expectArgCount("shuffle-thru", args, 1);
    const list = asList(argAt(args, 0), "shuffle-thru");
    shuffleInPlace(context, list);
    return list;
  });

  addBuiltin(context, "shuffle", (...args) => {
    expectArgCount("shuffle", args, 1);
    const list = [...asList(argAt(args, 0), "shuffle")];
    shuffleInPlace(context, list);
    return list;
  });

  addBuiltin(context, "sort-self", (...args) => {
    expectArgCount("sort-self", args, 1);
    asList(argAt(args, 0), "sort-self").sort(compareValues);
    return "";
  });

  addBuiltin(context, "sort-thru", (...args) => {
    expectArgCount("sort-thru", args, 1);
    const list = asList(argAt(args, 0), "sort-thru");
    list.sort(compareValues);
    return list;
  });

  addBuiltin(context, "sort", (...args) => {
    expectArgCount("sort", args, 1);
    return [...asList(argAt(args, 0), "sort")].sort(compareValues);
  });

  addBuiltin(context, "sift-self", (...args) => {
    expectArgCount("sift-self", args, 2);
    const list = asList(argAt(args, 0), "sift-self");
    siftInPlace(context, list, asNonNegativeCount(argAt(args, 1), "sift-self"));
    return "";
  });

  addBuiltin(context, "sift-thru", (...args) => {
    expectArgCount("sift-thru", args, 2);
    const list = asList(argAt(args, 0), "sift-thru");
    siftInPlace(context, list, asNonNegativeCount(argAt(args, 1), "sift-thru"));
    return list;
  });

  addBuiltin(context, "sift", (...args) => {
    expectArgCount("sift", args, 2);
    const list = [...asList(argAt(args, 0), "sift")];
    siftInPlace(context, list, asNonNegativeCount(argAt(args, 1), "sift"));
    return list;
  });

  addBuiltin(context, "squish-self", (...args) => {
    expectArgCount("squish-self", args, 2);
    const list = asList(argAt(args, 0), "squish-self");
    squishInPlace(
      context,
      list,
      asNonNegativeCount(argAt(args, 1), "squish-self")
    );
    return "";
  });

  addBuiltin(context, "squish-thru", (...args) => {
    expectArgCount("squish-thru", args, 2);
    const list = asList(argAt(args, 0), "squish-thru");
    squishInPlace(
      context,
      list,
      asNonNegativeCount(argAt(args, 1), "squish-thru")
    );
    return list;
  });

  addBuiltin(context, "squish", (...args) => {
    expectArgCount("squish", args, 2);
    const list = [...asList(argAt(args, 0), "squish")];
    squishInPlace(context, list, asNonNegativeCount(argAt(args, 1), "squish"));
    return list;
  });

  addBuiltin(context, "chunks", (...args) => {
    expectArgCount("chunks", args, 2);
    const collection = argAt(args, 0);
    const chunkCount = asNonNegativeCount(argAt(args, 1), "chunks");
    const chunked: RantyValue[] = [];

    if (chunkCount > 0) {
      const length = orderedCollectionLength(collection, "chunks");
      const minChunkSize = Math.floor(length / chunkCount);
      const maxChunkSize = minChunkSize + 1;
      const biggerChunkCount = length % chunkCount;

      for (let index = 0; index < chunkCount; index += 1) {
        const chunkSize =
          index < biggerChunkCount ? maxChunkSize : minChunkSize;
        const offset =
          index < biggerChunkCount
            ? index * maxChunkSize
            : biggerChunkCount * maxChunkSize +
              (index - biggerChunkCount) * minChunkSize;
        chunked.push(
          orderedCollectionSlice(collection, offset, offset + chunkSize)
        );
      }
    }

    return chunked;
  });

  addBuiltin(context, "fill-self", (...args) => {
    expectArgCount("fill-self", args, 2);
    const list = asList(argAt(args, 0), "fill-self");
    const value = argAt(args, 1);
    for (let index = 0; index < list.length; index += 1) {
      list[index] = value;
    }
    return "";
  });

  addBuiltin(context, "fill-thru", (...args) => {
    expectArgCount("fill-thru", args, 2);
    const list = asList(argAt(args, 0), "fill-thru");
    const value = argAt(args, 1);
    for (let index = 0; index < list.length; index += 1) {
      list[index] = value;
    }
    return list;
  });
}
