import { describe, expect, test } from "vitest";

import { Ranty } from "../src/index";

describe("function behavior", () => {
  test("global function defs participate in callable percolation", () => {
    const ranty = new Ranty();

    expect(
      ranty.run(
        ranty.compileQuiet(
          "[$/test-global]{global}[$test-local]{local}{<$test-global;$test-local>[test-global]\\n[test-local]\\n[$test-local]{very local}[test-local]}"
        )
      )
    ).toBe("global\nlocal\nvery local");
  });

  test("optional params can be omitted without shadowing fallback access", () => {
    const ranty = new Ranty();

    expect(
      ranty.run(
        ranty.compileQuiet(
          "[$arg-or-foo:arg?]{[alt:<arg?>;foo]}[arg-or-foo]\\n[arg-or-foo:bar]"
        )
      )
    ).toBe("foo\nbar");
  });

  test("variadic star params collect remaining args into a list", () => {
    const ranty = new Ranty();

    expect(
      ranty.run(
        ranty.compileQuiet(
          "[$collect:args*]{<args>}[assert-eq:[collect];(:)][assert-eq:[collect:a;b;c];(:a; b; c)]"
        )
      )
    ).toBe("");
  });

  test("variadic plus params require at least one arg and collect remaining args", () => {
    const ranty = new Ranty();

    expect(
      ranty.run(
        ranty.compileQuiet(
          "[$collect:args+]{<args>}[assert-eq:[collect:a;b;c];(:a; b; c)]"
        )
      )
    ).toBe("");
    expect(() =>
      ranty.run(ranty.compileQuiet("[$collect:args+]{<args>}[collect]"))
    ).toThrow();
  });
});
