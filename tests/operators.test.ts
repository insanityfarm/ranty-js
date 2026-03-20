import { describe, expect, test } from "vitest";
import { Ranty } from "../src";

describe("operator parsing and evaluation", () => {
  test("branch fixtures use trimmed keyword-block expressions", () => {
    const ranty = new Ranty();

    expect(
      ranty.run(ranty.compileQuiet("[assert-eq:@if @true:{123};123]"))
    ).toBe("");

    expect(
      ranty.run(
        ranty.compileQuiet(
          "<%a=2>[assert-eq:@if <a> @eq 1:{<>}@elseif <a> @eq 2:{123};123]"
        )
      )
    ).toBe("");
  });

  test("comparison and boolean operators evaluate with Rust-style behavior", () => {
    const ranty = new Ranty();
    const source =
      "[assert:1 @eq 1]" +
      "[assert-not:1 @eq 2]" +
      "[assert:1 @neq 2]" +
      "[assert:1 @lt 2]" +
      "[assert:1 @le 2]" +
      "[assert:2 @ge 1]" +
      "[assert:2 @gt 1]" +
      "[assert-eq:@not @false;@true]";

    expect(ranty.run(ranty.compileQuiet(source))).toBe("");
  });

  test("symbolic boolean operators and short-circuiting behave like Rust", () => {
    const ranty = new Ranty();
    const source =
      "<$lhs-reads=0;$rhs-reads=0;$lhs;$rhs>" +
      "[%get-lhs]{<lhs-reads=<lhs-reads> + 1><lhs>}" +
      "[%get-rhs]{<rhs-reads=<rhs-reads> + 1><rhs>}" +
      "[assert-eq:@true & @true;@true]" +
      '[assert-eq:"" & 0;""]' +
      "[assert-eq:@false | @true;@true]" +
      "[assert-eq:0 | 2;2]" +
      "[assert:@true ^ @false]" +
      "[assert-not:@true ^ @true]" +
      "[assert-eq:@not @false & @not @false;@true]" +
      "<lhs=@false;rhs=@true>[tap:[get-lhs] & [get-rhs]][assert-eq:<lhs-reads>;1][assert-eq:<rhs-reads>;0]" +
      "<lhs-reads=0;rhs-reads=0>" +
      "<lhs=@true;rhs=@false>[tap:[get-lhs] | [get-rhs]][assert-eq:<lhs-reads>;1][assert-eq:<rhs-reads>;0]";

    expect(ranty.run(ranty.compileQuiet(source))).toBe("");
  });

  test("multiline named functions can mutate captured outer variables", () => {
    const ranty = new Ranty();
    const source =
      "<$x = 0>\n" +
      "[%inc] {\n" +
      "  <x = <x> + 1>\n" +
      "}\n" +
      "[inc]\n" +
      "<x>";

    expect(ranty.run(ranty.compileQuiet(source))).toBe("1");
  });
});
