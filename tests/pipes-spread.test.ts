import { describe, expect, test } from "vitest";

import { CompilerError, Ranty } from "../src/index";
import type { CompilerMessage, Reporter } from "../src/core/messages";

class CollectingReporter implements Reporter {
  readonly messages: CompilerMessage[] = [];

  report(message: CompilerMessage): void {
    this.messages.push(message);
  }
}

describe("pipe and spread behavior", () => {
  test("spread expands tuple and list args in function calls", () => {
    const ranty = new Ranty();

    expect(
      ranty.run(
        ranty.compileQuiet(
          '<$args = (foo; bar; baz; qux)>[$abcd:a;b;c;d]{<a><b><c><d>}[assert-eq:[abcd:*<args>];"foobarbazqux"]'
        )
      )
    ).toBe("");

    expect(
      ranty.run(
        ranty.compileQuiet(
          '<$args = (:bar; baz)>[$abcd:a;b;c;d]{<a><b><c><d>}[assert-eq:[abcd:foo; *<args>; qux];"foobarbazqux"]'
        )
      )
    ).toBe("");
  });

  test("pipe chains inject the previous value when no explicit pipe value is used", () => {
    const ranty = new Ranty();

    expect(
      ranty.run(
        ranty.compileQuiet(
          '[split:"the quick brown fox jumps over the lazy dog";\\s |> filter:[]; [?:word]{[len:<word> |> le:3]} |> join:\\s]'
        )
      )
    ).toBe("the fox the dog");
  });

  test("call pipes and explicit pipe values work in chained calls", () => {
    const ranty = new Ranty();

    expect(
      ranty.run(ranty.compileQuiet("[cat:[?]{meow} |> [] |> assert-eq:meow]"))
    ).toBe("");

    expect(
      ranty.run(
        ranty.compileQuiet(
          "[$get-func:a]{[?:b]{<a><b>}}[assert-eq:[get-func:foo |> ([]):bar];foobar]"
        )
      )
    ).toBe("");
  });

  test("assignment pipes lower to setter semantics", () => {
    const ranty = new Ranty();

    expect(
      ranty.run(
        ranty.compileQuiet(
          '<$test>[cat:"hello" > test][assert-eq:<test>;"hello"]'
        )
      )
    ).toBe("");
    expect(
      ranty.run(
        ranty.compileQuiet('[cat:"hello" > $test][assert-eq:<test>;"hello"]')
      )
    ).toBe("");
  });

  test("malformed pipe stages fail with the Rust identifier diagnostic", () => {
    const ranty = new Ranty();
    const reporter = new CollectingReporter();

    expect(() => ranty.compile("[cat: foo |>]", reporter)).toThrow(
      CompilerError
    );
    expect(reporter.messages[0]?.message).toBe(
      "']' is not a valid identifier; identifiers may only use alphanumerics, underscores, and hyphens (but cannot be only digits)"
    );
  });
});
