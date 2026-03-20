import { describe, expect, test } from "vitest";

import { Ranty, RuntimeError } from "../src/index";
import { compileMessages, runSource } from "./suite-helpers";

describe("output and control-flow behavior", () => {
  test("nested repeater control-flow preserves buffered output", () => {
    const ranty = new Ranty();

    expect(ranty.run(ranty.compileQuiet("[rep:3]{A{@continue}B}"))).toBe("AAA");
    expect(ranty.run(ranty.compileQuiet("[rep:3]{A @break}"))).toBe("A");
    expect(ranty.run(ranty.compileQuiet("[$foo]{bar @return}[foo]"))).toBe(
      "bar"
    );
  });

  test("zero-weight blocks yield empty output", () => {
    const ranty = new Ranty();

    expect(ranty.run(ranty.compileQuiet("{ foo @weight 0 }"))).toBe("");
  });

  test("anonymous angle access spacing compacts like Rust", () => {
    const ranty = new Ranty();
    const source = `
<$list = (foo;bar)>

[$get-list] {<list>}

<([get-list])/0> <([get-list])/1>
`;

    expect(ranty.run(ranty.compileQuiet(source))).toBe("foobar");
  });

  test("silent setup blocks do not leak layout whitespace", () => {
    const ranty = new Ranty();
    const source = `
{
  <$a=0>
  [$^next-number] {
    <$val = <a>>
    <a = <a> + 1>
    <val>
  }
}

[rep:4][sep:\\s]
{
  [next-number]
}
`;

    expect(ranty.run(ranty.compileQuiet(source))).toBe("0 1 2 3");
  });

  test("assert mirrors Rust failure text", () => {
    const ranty = new Ranty();

    expect(() => ranty.run(ranty.compileQuiet("[assert:@false]"))).toThrow(
      /assertion failed: condition was false/
    );
  });

  test("assert-eq mirrors Rust default failure text", () => {
    const ranty = new Ranty();

    try {
      ranty.run(ranty.compileQuiet('[assert-eq:"";foo]'));
    } catch (error) {
      expect(error).toBeInstanceOf(RuntimeError);
      expect((error as RuntimeError).message).toBe(
        "[ASSERT_ERROR] expected: foo; actual: "
      );
      return;
    }

    throw new Error("expected assert-eq failure");
  });

  test("@edit can duplicate or discard parent output", () => {
    expect(runSource('"example" { @edit x: `<x> `<x> }')).toBe(
      "example example"
    );
    expect(runSource('"example" { @edit: "overwritten" }')).toBe("overwritten");
  });

  test("@edit preserves explicit trailing whitespace and accumulates across repeats", () => {
    expect(runSource('"example " { @edit x: `<x> }')).toBe("example ");
    expect(
      runSource(`
[%factorial: n] {
  1 [rep: <n>] {@edit x: <x> * [step]}
}

[factorial: 6]
`)
    ).toBe("720");
  });

  test("@edit, hint, and sink reject unsupported placements", () => {
    expect(compileMessages("{foo @edit x: <x>}").length > 0).toBe(true);
    expect(
      compileMessages("`@break").some((message) => message.code === "R0131")
    ).toBe(true);
    expect(
      compileMessages("~@break").some((message) => message.code === "R0130")
    ).toBe(true);
  });

  test("whitespace normalization matches the current output rules", () => {
    expect(runSource("One  two   three")).toBe("One two three");
    expect(runSource("Water\nmelon")).toBe("Watermelon");
    expect(runSource('<$name = "world">Hello, `<name>!')).toBe("Hello, world!");
    expect(runSource("{\\:} ~{\\(}")).toBe(":(");
  });
});
