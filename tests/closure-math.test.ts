import { describe, expect, test } from "vitest";

import { Ranty } from "../src/index";

describe("closure and math regressions", () => {
  test("grouped callable targets preserve closure captures", () => {
    const ranty = new Ranty();

    expect(
      ranty.run(
        ranty.compileQuiet(`
[$gen-closure:msg] {
  [?] {
    <msg>
  }
}

[([gen-closure:foo]) |> assert-eq: foo]
`)
      )
    ).toBe("");

    expect(
      ranty.run(
        ranty.compileQuiet(`
[$gen-closure] {
  <$a = foo>
  [?]{<a>}
}

[([gen-closure]) |> assert-eq: foo]
`)
      )
    ).toBe("");
  });

  test("descoped function defs can mutate captured values from an outer scope", () => {
    const ranty = new Ranty();

    expect(
      ranty.run(
        ranty.compileQuiet(`
{<$a=0>[$^next-number]{<$val = <a>><a = <a> + 1><val>}}[cat:[next-number];" ";[next-number];" ";[next-number];" ";[next-number]]
`)
      )
    ).toBe("0 1 2 3");
  });

  test("math operators and @neg behave with Rust-style precedence", () => {
    const ranty = new Ranty();

    expect(
      ranty.run(
        ranty.compileQuiet(`
[assert-eq: 2 + 2 - 1; 3]
[assert-eq: 1 + 2 * 3 - 2; 5]
[assert-eq: 1 + 2 * 3 ** 2 - 2; 17]
[assert-eq: 10 % 4; 2]
[assert-eq: @neg 3 * 4 * -4; 48]
[assert-eq: @neg 3 * -4 * @neg 4; -48]
`)
      )
    ).toBe("");
  });

  test("min and max flatten tuple and list arguments", () => {
    const ranty = new Ranty();

    expect(
      ranty.run(
        ranty.compileQuiet(`
[max: 3; (4; -2; 0; 10); 6 |> assert-eq: 10]
[min: 3; (4; -2; 0; 10); 6 |> assert-eq: -2]
`)
      )
    ).toBe("");
  });
});
