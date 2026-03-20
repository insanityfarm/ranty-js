import { describe, expect, test } from "vitest";

import { Ranty } from "../src/index";

describe("static access and range behavior", () => {
  test("assert equality helpers accept an optional diagnostic message", () => {
    const ranty = new Ranty();

    expect(
      ranty.run(ranty.compileQuiet('[assert-eq:1;1;"ok"][assert-neq:1;2;"ok"]'))
    ).toBe("");
  });

  test("tuple and string access support negative static indices", () => {
    const ranty = new Ranty();

    expect(
      ranty.run(
        ranty.compileQuiet("<$list = (1;2;3)><list/-1>, <list/-2>, <list/-3>")
      )
    ).toBe("3, 2, 1");
    expect(
      ranty.run(
        ranty.compileQuiet("<$text = abc><text/-1>, <text/-2>, <text/-3>")
      )
    ).toBe("c, b, a");
  });

  test("list access can set negative static indices", () => {
    const ranty = new Ranty();

    expect(
      ranty.run(
        ranty.compileQuiet(
          '<$list = (:1;2;3)><list/-1 = 6; list/-2 = 5; list/-3 = 4>[join:<list>;", "]'
        )
      )
    ).toBe("4, 5, 6");
  });

  test("ranges support static index access for forward and reverse ranges", () => {
    const ranty = new Ranty();

    expect(
      ranty.run(
        ranty.compileQuiet(
          "<%r = [range: 0; 5]><r/0>, <r/1>, <r/2>, <r/3>, <r/4>"
        )
      )
    ).toBe("0, 1, 2, 3, 4");
    expect(
      ranty.run(
        ranty.compileQuiet("<%r = [range: 10; 0; 3]><r/0>, <r/1>, <r/2>, <r/3>")
      )
    ).toBe("10, 7, 4, 1");
  });

  test("irange is inclusive and slices like Rust fixtures expect", () => {
    const ranty = new Ranty();

    expect(ranty.run(ranty.compileQuiet("<$a = [irange:1;8]><a/8..0>"))).toBe(
      "(: 1; 2; 3; 4; 5; 6; 7; 8)"
    );
  });

  test("angle access supports missing-value fallbacks", () => {
    const ranty = new Ranty();

    expect(
      ranty.run(
        ranty.compileQuiet(
          "<$list = (foo; bar; baz)><list/0 ? oops>, <list/3 ? oops>, <missing ? nope>"
        )
      )
    ).toBe("foo, oops, nope");
  });

  test("dynamic path indices can read and write nested list values", () => {
    const ranty = new Ranty();

    expect(
      ranty.run(
        ranty.compileQuiet(
          "<$list = (:1;2;3)><$i = 2><list/(<i>) = 4>[join:<list>;,\\s]"
        )
      )
    ).toBe("1, 2, 4");

    expect(
      ranty.run(
        ranty.compileQuiet(
          "<$lists = (:(:1;2;3);(:4;5;6))><$i = 0><$j = 2><lists/(<i>)/(<j>) = 4>[join:[sum:<lists>];,\\s]"
        )
      )
    ).toBe("1, 2, 4, 4, 5, 6");
  });

  test("slices work for lists, tuples, strings, and ranges", () => {
    const ranty = new Ranty();

    expect(
      ranty.run(ranty.compileQuiet("<$a = (:a; b; c; d; e; f; g; h)><a/1..-1>"))
    ).toBe("(: b; c; d; e; f; g)");
    expect(
      ranty.run(ranty.compileQuiet("<$a = (a; b; c; d; e; f; g; h)><a/..4>"))
    ).toBe("(a; b; c; d)");
    expect(ranty.run(ranty.compileQuiet("<$a = ABCDEFGH><a/(4)..(8)>"))).toBe(
      "EFGH"
    );
    expect(ranty.run(ranty.compileQuiet("<$a = [range:1;9]><a/8..0>"))).toBe(
      "(: 1; 2; 3; 4; 5; 6; 7; 8)"
    );
  });

  test("splices replace list spans with list or tuple values", () => {
    const ranty = new Ranty();

    expect(
      ranty.run(
        ranty.compileQuiet(
          "<$a = (:a; b; c; d; e; f; g; h)><a/..2 = (:1; 2; 3)>[assert-eq:<a>;(:1; 2; 3; c; d; e; f; g; h)]"
        )
      )
    ).toBe("");

    expect(
      ranty.run(
        ranty.compileQuiet(
          "<$a = (:a; b; c; d; e; f; g; h)><$i = 3><$j = 7><a/(<i>)..(<j>) = (foo;)>[assert-eq:<a>;(:a; b; c; foo; h)]"
        )
      )
    ).toBe("");
  });

  test("compound angle assignments update the current bound value", () => {
    const ranty = new Ranty();

    expect(
      ranty.run(ranty.compileQuiet("<$x = 1><x += 1>[assert-eq:<x>;2]"))
    ).toBe("");
    expect(
      ranty.run(ranty.compileQuiet("<$x = 2><x *= 3>[assert-eq:<x>;6]"))
    ).toBe("");
    expect(
      ranty.run(ranty.compileQuiet("<$x = 20><x /= 2>[assert-eq:<x>;10]"))
    ).toBe("");
    expect(
      ranty.run(ranty.compileQuiet("<$x = 10><x %= 3>[assert-eq:<x>;1]"))
    ).toBe("");
    expect(
      ranty.run(ranty.compileQuiet("<$x = 2><x **= 3>[assert-eq:<x>;8]"))
    ).toBe("");
    expect(
      ranty.run(
        ranty.compileQuiet("<$x = @true><x &= @false>[assert-eq:<x>;@false]")
      )
    ).toBe("");
    expect(
      ranty.run(
        ranty.compileQuiet("<$x = @true><x |= @false>[assert-eq:<x>;@true]")
      )
    ).toBe("");
  });

  test("unsupported compound operators still fail at compile time", () => {
    const ranty = new Ranty();

    expect(() => ranty.compileQuiet("<$x = @true><x ^= @true>")).toThrow();
  });

  test("@text-hinted defs still participate in descoped lookup", () => {
    const ranty = new Ranty();

    expect(
      ranty.run(
        ranty.compileQuiet(
          "<@text $test=foo>{<@text $test=bar>{<@text $test=baz><^^test> <^test> <test>}}"
        )
      )
    ).toBe("foo bar baz");
  });
});
