import { describe, expect, test } from "vitest";

import { CompilerError, Ranty } from "../src/index";
import { getMapChainValue, setMapPrototype } from "../src/core/map-proto";
import type { CompilerMessage, Reporter } from "../src/core/messages";
import type { RantyValue } from "../src/core/values";

class CollectingReporter implements Reporter {
  readonly messages: CompilerMessage[] = [];

  report(message: CompilerMessage): void {
    this.messages.push(message);
  }
}

function getBuiltin(
  ranty: Ranty,
  name: string
): (...args: readonly RantyValue[]) => RantyValue {
  const value = ranty.getGlobal(name);
  expect(typeof value).toBe("function");
  return value as (...args: readonly RantyValue[]) => RantyValue;
}

describe("collections stdlib", () => {
  test("tuple and list literals render with Rust-style syntax", () => {
    const ranty = new Ranty();

    expect(ranty.run(ranty.compileQuiet("()"))).toBe("()");
    expect(ranty.run(ranty.compileQuiet("(1; 2)"))).toBe("(1; 2)");
    expect(ranty.run(ranty.compileQuiet("(foo;)"))).toBe("(foo;)");
    expect(ranty.run(ranty.compileQuiet("(:)"))).toBe("(:)");
    expect(ranty.run(ranty.compileQuiet("(:1; 2)"))).toBe("(: 1; 2)");
    expect(ranty.run(ranty.compileQuiet("(:foo)"))).toBe("(: foo)");
  });

  test("adjacent collection literals autoconcat while preserving kind", () => {
    const ranty = new Ranty();

    expect(ranty.run(ranty.compileQuiet("(1; 2)\n(3; 4)"))).toBe(
      "(1; 2; 3; 4)"
    );
    expect(ranty.run(ranty.compileQuiet("(:1; 2)\n(:3; 4)"))).toBe(
      "(: 1; 2; 3; 4)"
    );
    expect(ranty.run(ranty.compileQuiet("[rep:3]{([step];)}"))).toBe(
      "(1; 2; 3)"
    );
    expect(ranty.run(ranty.compileQuiet("[rep:3]{(:[step])}"))).toBe(
      "(: 1; 2; 3)"
    );
  });

  test("adjacent map literals autoconcat by merging entries", () => {
    const ranty = new Ranty();

    expect(
      ranty.run(ranty.compileQuiet("<%foo = (:: a = 1)\n(:: b = 2)><foo>"))
    ).toBe("(:: a = 1; b = 2)");
  });

  test("collection builtins preserve tuple/list rendering", () => {
    const ranty = new Ranty();

    expect(ranty.run(ranty.compileQuiet("[list:1;2;3]"))).toBe("(: 1; 2; 3)");
    expect(ranty.run(ranty.compileQuiet("[tuple:1;2;3]"))).toBe("(1; 2; 3)");
    expect(ranty.run(ranty.compileQuiet("[to-list:(1;2;3)]"))).toBe(
      "(: 1; 2; 3)"
    );
    expect(ranty.run(ranty.compileQuiet("[to-tuple:(:1;2;3)]"))).toBe(
      "(1; 2; 3)"
    );
    expect(ranty.run(ranty.compileQuiet("[to-list:[range:0;3]]"))).toBe(
      "(: 0; 1; 2)"
    );
    expect(ranty.run(ranty.compileQuiet("[to-tuple:[range:3;0]]"))).toBe(
      "(3; 2; 1)"
    );
    expect(ranty.run(ranty.compileQuiet("[sum:[to-list:[range:0;3]]]"))).toBe(
      "3"
    );
  });

  test("unknown @keywords fail at compile time with the stable diagnostic", () => {
    const ranty = new Ranty();
    const reporter = new CollectingReporter();

    expect(() => ranty.compile("@bogus", reporter)).toThrow(CompilerError);
    expect(reporter.messages.some((message) => message.code === "R0200")).toBe(
      true
    );
    expect(reporter.messages[0]?.message).toBe("invalid keyword: '@bogus'");
  });

  test("filter, map, and zip work with callable globals from source", () => {
    const ranty = new Ranty();

    expect(
      ranty.run(
        ranty.compileQuiet('[join:[filter:[list:1;2;3;4;5];<is-odd>];", "]')
      )
    ).toBe("1, 3, 5");
    expect(
      ranty.run(ranty.compileQuiet('[join:[map:[list:1;2;3];<neg>];", "]'))
    ).toBe("-1, -2, -3");
    expect(
      ranty.run(
        ranty.compileQuiet(
          '[join:[zip:[list:1;2;3];[list:10;20;30];<add>];", "]'
        )
      )
    ).toBe("11, 22, 33");
  });

  test("lookup-only collection helpers stay own-only across prototypes", () => {
    const ranty = new Ranty();
    const source =
      "<$obj = (:: own = 1)>" +
      "<$proto = (:: inherited = 2)>" +
      "[set-proto: <obj>; <proto>]" +
      "[has: <obj>; own]\\n" +
      "[has: <obj>; inherited]\\n" +
      "[len: [keys: <obj>]]\\n" +
      "[len: [values: <obj>]]\\n" +
      "[translate: (: own; inherited); <obj>]\\n" +
      "<obj>";

    expect(ranty.run(ranty.compileQuiet(source))).toBe(
      "@true\n@false\n1\n1\n(: 1; inherited)\n(:: own = 1)"
    );
  });

  test("remove and take only affect local map keys", () => {
    const ranty = new Ranty();
    const remove = getBuiltin(ranty, "remove");
    const take = getBuiltin(ranty, "take");

    const proto = new Map<string, RantyValue>([
      ["flavor", "vanilla"],
      ["inherited", "there"]
    ]);
    const obj = new Map<string, RantyValue>([
      ["flavor", "chocolate"],
      ["local", "here"]
    ]);
    setMapPrototype(obj, proto);

    expect(remove(obj, "flavor")).toBe("");
    expect(take(obj, "local")).toBe("here");
    expect(obj.has("flavor")).toBe(false);
    expect(obj.has("local")).toBe(false);
    expect(getMapChainValue(obj, "flavor")).toEqual({
      found: true,
      value: "vanilla"
    });
    expect(getMapChainValue(obj, "inherited")).toEqual({
      found: true,
      value: "there"
    });
  });

  test("direct collection helpers return structured values", () => {
    const ranty = new Ranty({ seed: 7n });

    const chunks = getBuiltin(ranty, "chunks");
    const nlist = getBuiltin(ranty, "nlist");
    const sort = getBuiltin(ranty, "sort");
    const oxfordJoin = getBuiltin(ranty, "oxford-join");

    expect(chunks("abcdef", 4n)).toEqual(["ab", "cd", "e", "f"]);
    expect(nlist(1n, 2n, 3n)).toEqual([[1n, 2n, 3n]]);
    expect(sort([3n, 1n, 2n])).toEqual([1n, 2n, 3n]);
    expect(oxfordJoin(", ", " and ", ", and ", ["red", "green", "blue"])).toBe(
      "red, green, and blue"
    );
  });
});
