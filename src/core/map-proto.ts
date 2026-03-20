import { RuntimeError, RuntimeErrorType } from "./errors";
import type { RantyValue } from "./values";

const mapPrototypes = new WeakMap<
  Map<string, RantyValue>,
  Map<string, RantyValue> | null
>();

export function getMapPrototype(
  map: Map<string, RantyValue>
): Map<string, RantyValue> | null {
  return mapPrototypes.get(map) ?? null;
}

export function wouldCreatePrototypeCycle(
  map: Map<string, RantyValue>,
  proto: Map<string, RantyValue>
): boolean {
  if (map === proto) {
    return true;
  }

  const visited = new Set<Map<string, RantyValue>>([map]);
  let current: Map<string, RantyValue> | null = proto;

  while (current) {
    if (visited.has(current)) {
      return true;
    }
    visited.add(current);
    current = getMapPrototype(current);
  }

  return false;
}

export function setMapPrototype(
  map: Map<string, RantyValue>,
  proto: Map<string, RantyValue> | null
): void {
  if (proto && wouldCreatePrototypeCycle(map, proto)) {
    throw new RuntimeError(
      RuntimeErrorType.ArgumentError,
      "set-proto: prototype assignment would create a cycle"
    );
  }

  mapPrototypes.set(map, proto);
}

export function getMapChainValue(
  map: Map<string, RantyValue>,
  key: string
):
  | { readonly found: true; readonly value: RantyValue }
  | { readonly found: false } {
  let current: Map<string, RantyValue> | null = map;

  while (current) {
    if (current.has(key)) {
      return {
        found: true,
        value: current.get(key) ?? null
      };
    }
    current = getMapPrototype(current);
  }

  return { found: false };
}
