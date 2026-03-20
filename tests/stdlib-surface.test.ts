import { describe, expect, test } from "vitest";

import { Ranty } from "../src/index";
import { loadUpstreamContract } from "./corpus-helpers";

describe("stdlib surface", () => {
  test("exports the Rust stdlib public symbol inventory", () => {
    const ranty = new Ranty();
    const contract = loadUpstreamContract();

    for (const name of contract.stdlib_symbols) {
      expect(ranty.hasGlobal(name), `missing stdlib symbol: ${name}`).toBe(
        true
      );
    }
  });

  test("implemented stdlib helpers are callable through globals", () => {
    const ranty = new Ranty({ seed: 1n });

    const add = ranty.getGlobal("add");
    const upper = ranty.getGlobal("upper");
    const toInt = ranty.getGlobal("to-int");
    const assoc = ranty.getGlobal("assoc");
    const keys = ranty.getGlobal("keys");

    expect(typeof add).toBe("function");
    expect(typeof upper).toBe("function");
    expect(typeof toInt).toBe("function");
    expect(typeof assoc).toBe("function");
    expect(typeof keys).toBe("function");

    expect((add as (...args: readonly unknown[]) => unknown)(2n, 3n)).toBe(5n);
    expect((upper as (...args: readonly unknown[]) => unknown)("ranty")).toBe(
      "RANTY"
    );
    expect((toInt as (...args: readonly unknown[]) => unknown)("42")).toBe(42n);

    const map = (
      assoc as (...args: readonly unknown[]) => Map<string, unknown>
    )("a", 1n, "b", 2n);
    expect((keys as (...args: readonly unknown[]) => unknown)(map)).toEqual([
      "a",
      "b"
    ]);
  });
});
