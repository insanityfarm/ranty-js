import { describe, expect, test } from "vitest";

import { Ranty } from "../src/index";
import { runSource, runtimeError } from "./suite-helpers";

describe("map prototypes", () => {
  test("inherited map values are visible through slash-path lookup", () => {
    const ranty = new Ranty();
    const source =
      "<$obj = (::)><$proto = (:: flavor = vanilla)>[set-proto: <obj>; <proto>]<obj/flavor>";

    expect(ranty.run(ranty.compileQuiet(source))).toBe("vanilla");
  });

  test("inherited functions are callable", () => {
    const ranty = new Ranty();
    const source =
      "<$obj = (::)><$proto = (:: greet = [?: name]{Hello,\\s<name>!})>[set-proto: <obj>; <proto>][obj/greet: Ranty]";

    expect(ranty.run(ranty.compileQuiet(source))).toBe("Hello, Ranty!");
  });

  test("writing to an inherited key stays local", () => {
    const ranty = new Ranty();
    const source =
      "<$obj = (::)><$proto = (:: flavor = vanilla)>[set-proto: <obj>; <proto>]<obj/flavor = chocolate><obj/flavor>, <proto/flavor>";

    expect(ranty.run(ranty.compileQuiet(source))).toBe("chocolate, vanilla");
  });

  test("proto returns the currently assigned prototype", () => {
    const ranty = new Ranty();
    const source =
      "<$obj = (::)><$base = (:: flavor = vanilla)>[set-proto: <obj>; <base>][proto: <obj>]";

    expect(ranty.run(ranty.compileQuiet(source))).toBe("(:: flavor = vanilla)");
  });

  test("rendering a map includes own keys only", () => {
    const ranty = new Ranty();
    const source = `
      <$obj = (:: own = 1)>
      <$proto = (:: inherited = 2)>
      [set-proto: <obj>; <proto>]
      <obj>
    `;

    expect(ranty.run(ranty.compileQuiet(source))).toBe("(:: own = 1)");
  });

  test("prototype cycles are rejected", () => {
    const ranty = new Ranty();
    expect(() =>
      ranty.run(ranty.compileQuiet("<$obj = (::)>[set-proto: <obj>; <obj>]"))
    ).toThrow(/prototype assignment would create a cycle/);
  });

  test("own values shadow inherited ones and multi-hop lookup works", () => {
    expect(
      runSource(`
<$obj = (:: flavor = chocolate)>
<$proto = (:: flavor = vanilla)>
[set-proto: <obj>; <proto>]
<obj/flavor>
`)
    ).toBe("chocolate");

    expect(
      runSource(`
<$obj = (::)>
<$proto = (::)>
<$base = (:: flavor = mint)>
[set-proto: <proto>; <base>]
[set-proto: <obj>; <proto>]
<obj/flavor>
`)
    ).toBe("mint");
  });

  test("getter fallback uses the full prototype chain", () => {
    expect(
      runSource(`
<$obj = (::)>
<$proto = (:: flavor = vanilla)>
[set-proto: <obj>; <proto>]
<obj/flavor ? oops>, <obj/missing ? oops>
`)
    ).toBe("vanilla, oops");
  });

  test("remove and take only affect local keys", () => {
    expect(
      runSource(`
<$obj = (:: flavor = chocolate; local = here)>
<$proto = (:: flavor = vanilla; inherited = there)>
[set-proto: <obj>; <proto>]
[remove: <obj>; flavor]
[take: <obj>; local], <obj/flavor>, <proto/flavor>, <obj/inherited ? missing>, <obj/local ? missing>
`)
    ).toBe("here, vanilla, vanilla, there, missing");
  });

  test("lookup utilities remain own-only", () => {
    expect(
      runSource(`
<$obj = (:: own = 1)>
<$proto = (:: inherited = 2)>
[set-proto: <obj>; <proto>]
[has: <obj>; own]\\n
[has: <obj>; inherited]\\n
[len: [keys: <obj>]]\\n
[len: [values: <obj>]]\\n
[translate: (: own; inherited); <obj>]\\n
<obj>
`)
    ).toBe("@true\n@false\n1\n1\n(: 1; inherited)\n(:: own = 1)");
  });

  test("indirect prototype cycles are rejected", () => {
    expect(
      runtimeError(`
<$obj = (::)>
<$proto = (::)>
<$base = (::)>
[set-proto: <obj>; <proto>]
[set-proto: <proto>; <base>]
[set-proto: <base>; <obj>]
`).message
    ).toContain("prototype assignment would create a cycle");
  });
});
