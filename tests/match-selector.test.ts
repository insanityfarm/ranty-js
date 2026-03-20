import { describe, expect, test } from "vitest";

import { CompilerError, Ranty, RuntimeErrorType } from "../src/index";
import type { CompilerMessage, Reporter } from "../src/core/messages";
import { runtimeError } from "./suite-helpers";

class CollectingReporter implements Reporter {
  readonly messages: CompilerMessage[] = [];

  report(message: CompilerMessage): void {
    this.messages.push(message);
  }
}

describe("match selectors", () => {
  test("match selects tagged branches and falls back to untagged branches", () => {
    const ranty = new Ranty();
    expect(
      ranty.run(
        ranty.compileQuiet("[match: foo]{yes @on foo|no @on bar|fallback}")
      )
    ).toBe("yes");
    expect(
      ranty.run(ranty.compileQuiet("[match: baz]{yes @on foo|fallback}"))
    ).toBe("fallback");
  });

  test("match uses numeric equality and weights within the matching pool", () => {
    const ranty = new Ranty();
    expect(
      ranty.run(ranty.compileQuiet("[match: 1]{float @on 1.0|fallback}"))
    ).toBe("float");
    expect(
      ranty.run(
        ranty.compileQuiet(
          "[match: foo]{skip @on foo @weight 0|pick @on foo @weight 1|fallback}"
        )
      )
    ).toBe("pick");
  });

  test("match errors when no selectable candidate exists", () => {
    const ranty = new Ranty();
    expect(() =>
      ranty.run(ranty.compileQuiet("[match: foo]{bar @on bar}"))
    ).toThrow(/match selector could not find a selectable branch/);
  });

  test("match selectors reject cursor operations", () => {
    for (const source of [
      "<$sel=[mksel: match; foo]>[sel-skip:<sel>]",
      "<$sel=[mksel: match; foo]>[sel-freeze:<sel>]",
      "<$sel=[mksel: match; foo]>[sel-frozen:<sel>]"
    ]) {
      expect(runtimeError(source).errorType).toBe(
        RuntimeErrorType.SelectorError
      );
    }
  });

  test("misplaced and duplicate metadata fail compilation", () => {
    const ranty = new Ranty();

    const misplacedReporter = new CollectingReporter();
    expect(() => ranty.compile("@on foo", misplacedReporter)).toThrow(
      CompilerError
    );
    expect(
      misplacedReporter.messages.some((message) => message.code === "R0207")
    ).toBe(true);

    const duplicateReporter = new CollectingReporter();
    expect(() => ranty.compile("{foo @on a @on b}", duplicateReporter)).toThrow(
      CompilerError
    );
    expect(
      duplicateReporter.messages.some((message) => message.code === "R0041")
    ).toBe(true);
  });
});
