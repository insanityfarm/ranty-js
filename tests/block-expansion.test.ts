import { describe, expect, test } from "vitest";

import { compileMessages, runSource } from "./suite-helpers";

describe("block expansion", () => {
  test("nested blocks expand into the parent element for repetition", () => {
    expect(runSource("[rep:all][sel:[mksel:forward]]{A{B|C}}")).toBe("ABAC");
  });

  test("nested blocks expand recursively from left to right", () => {
    expect(runSource("[rep:all][sel:[mksel:forward]]{A{B|C}{1|2}}")).toBe(
      "AB1AB2AC1AC2"
    );
  });

  test("lifted match triggers participate in outer match selection", () => {
    expect(runSource("[match: foo]{{yes @on foo|no @on bar}|fallback}")).toBe(
      "yes"
    );
  });

  test("expanded children preserve edit boundaries", () => {
    expect(
      runSource(
        '[rep:all][sel:[mksel:forward]]{"seed"{@edit x: `<x>B|@edit x: `<x>C}}'
      )
    ).toBe("seedBseedC");
  });

  test("protected blocks remain expansion barriers", () => {
    expect(runSource("[rep:all]{A[sel:[mksel:forward]]@{B|C}}")).toBe("AB");
  });

  test("lifted weight conflicts fail with duplicate metadata errors", () => {
    expect(
      compileMessages("{A{B @weight 1|C @weight 2} @weight 3}").some(
        (message) => message.code === "R0041"
      )
    ).toBe(true);
  });

  test("lifted match trigger conflicts fail with duplicate metadata errors", () => {
    expect(
      compileMessages("{A{B @on foo|C @on bar} @on baz}").some(
        (message) => message.code === "R0041"
      )
    ).toBe(true);
  });
});
