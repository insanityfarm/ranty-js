import { describe, expect, test } from "vitest";

import {
  CompilerError,
  Ranty,
  RuntimeError,
  RuntimeErrorType
} from "../src/index";
import type { CompilerMessage, Reporter } from "../src/core/messages";

class CollectingReporter implements Reporter {
  readonly messages: CompilerMessage[] = [];

  report(message: CompilerMessage): void {
    this.messages.push(message);
  }
}

function lazyHarness() {
  const ranty = new Ranty();
  let counter = 0;

  ranty.setGlobalConst("next", () => BigInt(++counter));
  ranty.setGlobalConst("next-list", () => {
    counter += 1;
    return [1n, 2n, 3n];
  });
  ranty.setGlobalConst("make-func", () => {
    counter += 1;
    return () => "ok";
  });

  return {
    ranty,
    counter: () => counter
  };
}

function compileErrors(source: string): readonly CompilerMessage[] {
  const ranty = new Ranty();
  const reporter = new CollectingReporter();
  expect(() => ranty.compile(source, reporter)).toThrow(CompilerError);
  return reporter.messages;
}

describe("lazy bindings", () => {
  test("lazy definition forces once", () => {
    const { ranty, counter } = lazyHarness();

    expect(
      ranty.run(ranty.compileQuiet("<$lazy ?= [next]><lazy>,<lazy>"))
    ).toBe("1,1");
    expect(counter()).toBe(1);
  });

  test("lazy definition can be overwritten before force", () => {
    const { ranty, counter } = lazyHarness();

    expect(
      ranty.run(ranty.compileQuiet("<$lazy ?= [next]><lazy = 7><lazy>"))
    ).toBe("7");
    expect(counter()).toBe(0);
  });

  test("lazy constant memoizes", () => {
    const { ranty, counter } = lazyHarness();

    expect(
      ranty.run(ranty.compileQuiet("<%lazy ?= [next]><lazy>,<lazy>"))
    ).toBe("1,1");
    expect(counter()).toBe(1);
  });

  test("lazy parameter can skip unused argument", () => {
    const { ranty, counter } = lazyHarness();

    expect(
      ranty.run(ranty.compileQuiet("[$ignore: @lazy x] { ok }[ignore: [next]]"))
    ).toBe("ok");
    expect(counter()).toBe(0);
  });

  test("lazy parameter forces once when read multiple times", () => {
    const { ranty, counter } = lazyHarness();

    expect(
      ranty.run(ranty.compileQuiet("[$dup: @lazy x] { <x>,<x> }[dup: [next]]"))
    ).toBe("1,1");
    expect(counter()).toBe(1);
  });

  test("lazy optional defaults only force when accessed", () => {
    const { ranty, counter } = lazyHarness();

    expect(
      ranty.run(
        ranty.compileQuiet(`
[$unused: @lazy x ? [next]] { ok }
[$used: @lazy x ? [next]] { <x>,<x> }
[unused]\\n[used]
`)
      )
    ).toBe("ok\n1,1");
    expect(counter()).toBe(1);
  });

  test("lazy definitions capture by reference", () => {
    const { ranty } = lazyHarness();

    expect(
      ranty.run(
        ranty.compileQuiet("<$value = 1><$lazy ?= <value>><value = 2><lazy>")
      )
    ).toBe("2");
  });

  test("lazy argument capture survives for closure use", () => {
    const { ranty } = lazyHarness();

    expect(
      ranty.run(
        ranty.compileQuiet(`
[$defer: @lazy x] {
  [?] { <x> }
}
<$value = 1>
<$reader = [defer: <value>]>
<value = 2>
[reader]
`)
      )
    ).toBe("2");
  });

  test("descendant setter forces lazy root", () => {
    const { ranty, counter } = lazyHarness();

    expect(
      ranty.run(
        ranty.compileQuiet(
          "<$items ?= [next-list]><items/0 = 9><items/0>,<items/1>,<items/2>"
        )
      )
    ).toBe("9,2,3");
    expect(counter()).toBe(1);
  });

  test("function lookup forces lazy binding", () => {
    const { ranty, counter } = lazyHarness();

    expect(ranty.run(ranty.compileQuiet("<$f ?= [make-func]>[f]"))).toBe("ok");
    expect(counter()).toBe(1);
  });

  test("self-referential lazy bindings raise runtime error", () => {
    const ranty = new Ranty();
    const program = ranty.compileQuiet("<$x ?= <x>><x>");

    expect(() => ranty.run(program)).toThrowError(RuntimeError);
    try {
      ranty.run(program);
    } catch (error) {
      expect(error).toBeInstanceOf(RuntimeError);
      expect((error as RuntimeError).errorType).toBe(
        RuntimeErrorType.LazyBindingCycle
      );
    }
  });

  test("lazy compile-time diagnostics mirror the Rust cases", () => {
    expect(
      compileErrors("[$bad: @lazy xs*] { <xs> }").some(
        (message) => message.code === "R0029"
      )
    ).toBe(true);
    expect(
      compileErrors("[$bad: @lazy x?] { <x> }").some(
        (message) => message.code === "R0067"
      )
    ).toBe(true);
    expect(
      compileErrors("<%x ?= 1><x = 2>").some(
        (message) => message.code === "R0100"
      )
    ).toBe(true);
    expect(
      compileErrors("<%x = 1><%x = 2>").some(
        (message) => message.code === "R0101"
      )
    ).toBe(true);
  });
});
