import { describe, expect, test } from "vitest";

import { CompilerError, Ranty } from "../src/index";
import type { CompilerMessage, Reporter } from "../src/core/messages";
import { runSource } from "./suite-helpers";

class CollectingReporter implements Reporter {
  readonly messages: CompilerMessage[] = [];

  report(message: CompilerMessage): void {
    this.messages.push(message);
  }
}

describe("attribute keywords", () => {
  test("mutable attribute accessors can round-trip attribute state", () => {
    const ranty = new Ranty();

    expect(ranty.run(ranty.compileQuiet("<@rep = 3>[rep:<@rep>]{x}"))).toBe(
      "xxx"
    );
    expect(
      ranty.run(ranty.compileQuiet('<@sep = ",">[rep:3][sep:<@sep>]{x}'))
    ).toBe("x,x,x");
    expect(
      ranty.run(
        ranty.compileQuiet('<@sel = "forward">[rep:4][sel:<@sel>]{a|b}')
      )
    ).toBe("abab");
    expect(
      ranty.run(
        ranty.compileQuiet(
          '<$mutator = [?: elem]{[elem]!}><@sel = "forward"><@mut = <mutator>>[rep: all][sel:<@sel>][mut:<@mut>]{a|b}'
        )
      )
    ).toBe("a!b!");
  });

  test("keyword block sugar supports @mut", () => {
    const ranty = new Ranty();
    expect(
      ranty.run(ranty.compileQuiet("@mut [?: elem]{[elem]!}: {foo}"))
    ).toBe("foo!");
  });

  test("attribute keywords are readable as plain expressions", () => {
    expect(runSource("[rep:3]{[eq: @step; 0] @break}")).toBe("@true");
    expect(runSource("[rep:3]{[neq: @step; [step]] @break}")).toBe("@true");
    expect(runSource("[rep:3]{[eq: @total; 3] @break}")).toBe("@true");
    expect(runSource("[rep: forever]{[eq: @total; <>] @break}")).toBe("@true");
  });

  test("attribute keyword block sugar applies to immediate blocks", () => {
    expect(runSource("@rep 3: {x}")).toBe("xxx");
    expect(runSource('@sel "forward": {a|b}')).toBe("a");
    expect(runSource("@mut [?: elem] { [elem]! }: {foo}")).toBe("foo!");
  });

  test("rep supports symbolic repetition modes", () => {
    const ranty = new Ranty();
    expect(
      ranty.run(ranty.compileQuiet('[rep: all][sel: "forward"]{a|b}'))
    ).toBe("ab");
    expect(
      ranty.run(ranty.compileQuiet("[rep: forever]{[eq:@step;0] @break}"))
    ).toBe("@true");
  });

  test("read-only attribute keywords reject assignment-like forms", () => {
    const ranty = new Ranty();

    const assignReporter = new CollectingReporter();
    expect(() => ranty.compile("<@step = 1>", assignReporter)).toThrow(
      CompilerError
    );
    expect(
      assignReporter.messages.some((message) => message.code === "R0206")
    ).toBe(true);
    expect(assignReporter.messages[0]?.message).toBe(
      "attribute keyword '@step' is read-only"
    );

    const sugarReporter = new CollectingReporter();
    expect(() => ranty.compile("@total 1: {x}", sugarReporter)).toThrow(
      CompilerError
    );
    expect(
      sugarReporter.messages.some((message) => message.code === "R0206")
    ).toBe(true);
    expect(sugarReporter.messages[0]?.message).toBe(
      "attribute keyword '@total' is read-only"
    );
  });

  test("attribute accessors reject unsupported compound forms", () => {
    const ranty = new Ranty();
    const reporter = new CollectingReporter();

    expect(() => ranty.compile("<@rep += 1>", reporter)).toThrow(CompilerError);
    expect(reporter.messages.some((message) => message.code === "R0205")).toBe(
      true
    );
    expect(reporter.messages[0]?.message).toBe(
      "attribute keyword '@rep' does not support this accessor form"
    );
  });
});
