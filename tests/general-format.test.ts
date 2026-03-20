import { describe, expect, test } from "vitest";

import { Ranty } from "../src/index";
import type { DataSource } from "../src/core/data-source";
import type { RantyValue } from "../src/core/values";

function getBuiltin(
  ranty: Ranty,
  name: string
): (...args: readonly RantyValue[]) => RantyValue {
  const value = ranty.getGlobal(name);
  expect(typeof value).toBe("function");
  return value as (...args: readonly RantyValue[]) => RantyValue;
}

class EchoSource implements DataSource {
  typeId(): string {
    return "echo";
  }

  requestData(args: readonly RantyValue[]): RantyValue {
    return [...args];
  }
}

describe("general and format stdlib", () => {
  test("require builtin loads a module and binds the default alias", () => {
    const ranty = new Ranty().usingModuleResolver(
      Ranty.createVirtualModules({
        "mods/shared.ranty": "<%module = (:: value = modern)><module>"
      })
    );

    expect(
      ranty.run(ranty.compileQuiet('[require:"mods/shared"]<shared/value>'))
    ).toBe("modern");
  });

  test("try catches runtime errors and passes the message to the handler", () => {
    const ranty = new Ranty();
    const source =
      '[$boom]{[error:"boom"]}[try:<boom>;[?:err]{handled: <err>}]';

    expect(ranty.run(ranty.compileQuiet(source))).toBe(
      "handled: [USER_ERROR] boom"
    );
  });

  test("fork and unfork manage RNG stack semantics", () => {
    const ranty = new Ranty({ seed: 7n });
    const baseline = new Ranty({ seed: 7n });

    const rand = getBuiltin(ranty, "rand");
    const fork = getBuiltin(ranty, "fork");
    const unfork = getBuiltin(ranty, "unfork");
    const baselineRand = getBuiltin(baseline, "rand");

    const first = rand(0n, 1000n);
    const baselineFirst = baselineRand(0n, 1000n);
    expect(first).toBe(baselineFirst);

    expect(fork(123n)).toBe("");
    const forked = rand(0n, 1000n);
    expect(unfork()).toBe("");

    const second = rand(0n, 1000n);
    const baselineSecond = baselineRand(0n, 1000n);

    expect(forked).not.toBeUndefined();
    expect(second).toBe(baselineSecond);
    expect(() => unfork()).toThrow(/cannot unfork root seed/);
  });

  test("data source builtins expose registered sources", () => {
    const ranty = new Ranty();
    ranty.addDataSource(new EchoSource());

    const request = getBuiltin(ranty, "ds-request");
    const query = getBuiltin(ranty, "ds-query-sources");

    expect(request("echo", "hi", 3n)).toEqual(["hi", 3n]);
    expect(query()).toEqual(["echo"]);
  });

  test("either, len, and ws-fmt behave with Rust-style defaults", () => {
    const ranty = new Ranty();
    const source = "[either:@false;yes;no]|[len:5]|[len:[range:0;5]]|[ws-fmt]";

    expect(ranty.run(ranty.compileQuiet(source))).toBe("no|1|5|default");
  });

  test("num-fmt getters and setters maintain formatter state", () => {
    const ranty = new Ranty();

    const wsFmt = getBuiltin(ranty, "ws-fmt");
    const numFmt = getBuiltin(ranty, "num-fmt");
    const numFmtSystem = getBuiltin(ranty, "num-fmt-system");
    const numFmtAlt = getBuiltin(ranty, "num-fmt-alt");
    const numFmtPadding = getBuiltin(ranty, "num-fmt-padding");

    expect(wsFmt()).toBe("default");
    expect(wsFmt("custom", "|")).toBe("");
    expect(wsFmt()).toBe("|");

    expect(numFmtSystem("hex")).toBe("");
    expect(numFmtAlt(true)).toBe("");
    expect(numFmtPadding(4n)).toBe("");
    expect(
      numFmt(
        new Map<string, RantyValue>([
          ["precision", 2n],
          ["sign", "explicit"]
        ])
      )
    ).toBe("");

    const expected = new Map<string, RantyValue>();
    expected.set("system", "hex");
    expected.set("alt", true);
    expected.set("precision", 2n);
    expected.set("padding", 4n);
    expected.set("upper", false);
    expected.set("endian", "big");
    expected.set("sign", "explicit");
    expected.set("infinity", "keyword");
    expected.set("group-sep", "");
    expected.set("decimal-sep", "");

    expect(numFmt()).toEqual(expected);
  });
});
