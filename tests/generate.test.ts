import { describe, expect, test } from "vitest";

import { Ranty } from "../src/index";
import type { RantyValue } from "../src/core/values";

type Builtin = (...args: readonly RantyValue[]) => RantyValue;

function builtin(ranty: Ranty, name: string): Builtin {
  const value = ranty.getGlobal(name);
  if (typeof value !== "function") {
    throw new Error(`expected '${name}' to be a builtin`);
  }
  return value as Builtin;
}

describe("generate stdlib", () => {
  test("maybe respects explicit probability endpoints", () => {
    const ranty = new Ranty({ seed: 123n });
    const maybe = builtin(ranty, "maybe");

    expect(maybe(0)).toBe(false);
    expect(maybe(1)).toBe(true);
    expect(typeof maybe()).toBe("boolean");
  });

  test("pick and pickn sample ordered collections", () => {
    const ranty = new Ranty({ seed: 9n });
    const pick = builtin(ranty, "pick");
    const pickn = builtin(ranty, "pickn");

    expect(["a", "b", "c"]).toContain(pick("abc"));
    expect(pick("z")).toBe("z");

    const sampled = pickn(["left", "right"], 5n);
    expect(Array.isArray(sampled)).toBe(true);
    expect(sampled).toHaveLength(5);
    expect(
      (sampled as readonly RantyValue[]).every(
        (item) => item === "left" || item === "right"
      )
    ).toBe(true);
  });

  test("pick-sparse weights items by length", () => {
    const ranty = new Ranty({ seed: 17n });
    const pickSparse = builtin(ranty, "pick-sparse");

    expect(["c", "a", "t"]).toContain(pickSparse("", "cat", ""));
    expect(pickSparse("", 42n, "")).toBe(42n);
  });

  test("rand-list-sum preserves integer totals", () => {
    const ranty = new Ranty({ seed: 0n });
    const randListSum = builtin(ranty, "rand-list-sum");

    const parts = randListSum(10n, 4n, 0n);
    expect(parts).toEqual([4n, 2n, 2n, 2n]);
    expect(
      (parts as readonly bigint[]).reduce((sum, value) => sum + value, 0n)
    ).toBe(10n);
  });
});
