import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { Ranty, RantyInt, RantyRng, VirtualModuleResolver } from "../src/index";
import { CompilerError } from "../src/core/errors";
import {
  parseSeedArg,
  selectLaunchMode,
  LaunchMode
} from "../src/hosts/node/cli-utils";
import {
  discoverExecutableFixtures,
  loadCliCorpus,
  loadFixtureCorpus,
  loadFuzzCorpus,
  relevantStderr,
  replaceWorkspaceTokens,
  runJsCliAsync,
  tempWorkspace as tempCorpusWorkspace,
  writeWorkspace as writeCorpusWorkspace
} from "./corpus-helpers";
import { runSource, runtimeError } from "./suite-helpers";

describe("project basics", () => {
  test("exposes the primary Ranty API", () => {
    expect(typeof Ranty).toBe("function");
    expect(new Ranty()).toBeInstanceOf(Ranty);
  });

  test("exact ints preserve large values", () => {
    const value = RantyInt.from("9223372036854775807");
    expect(value.toApiValue()).toBe(9223372036854775807n);
  });

  test("seed parsing matches the Rust CLI contract", () => {
    expect(parseSeedArg("deadbeef")).toBe(0xdeadbeefn);
    expect(parseSeedArg("0xDEADBEEF")).toBe(0xdeadbeefn);
    expect(() => parseSeedArg("xyz")).toThrow(/invalid seed/);
  });

  test("launch mode precedence is eval, file, stdin, repl", () => {
    expect(selectLaunchMode("print", "script.ranty", false)).toBe(
      LaunchMode.Eval
    );
    expect(selectLaunchMode(undefined, "script.ranty", false)).toBe(
      LaunchMode.File
    );
    expect(selectLaunchMode(undefined, undefined, false)).toBe(
      LaunchMode.Stdin
    );
    expect(selectLaunchMode(undefined, undefined, true)).toBe(LaunchMode.Repl);
  });

  test("virtual module resolver resolves extensionless sources", () => {
    const resolver = new VirtualModuleResolver({
      "mods/example.ranty": '"ok"'
    });

    const program = resolver.tryResolve(new Ranty(), "mods/example");
    expect(program.path()).toBe("mods/example.ranty");
  });

  test("rng is deterministic", () => {
    const first = new RantyRng(1n);
    const second = new RantyRng(1n);
    expect(first.nextU64()).toBe(second.nextU64());
    expect(first.nextNormalF64()).toBe(second.nextNormalF64());
  });

  test("run renders plain text and string literals", () => {
    const ranty = new Ranty();
    expect(ranty.run(ranty.compileQuiet("hello"))).toBe("hello");
    expect(ranty.run(ranty.compileQuiet('"hello\\nworld"'))).toBe(
      "hello\nworld"
    );
  });

  test("run can invoke zero-argument globals", () => {
    const ranty = new Ranty();
    ranty.setGlobalConst("hello", () => "world");
    expect(ranty.run(ranty.compileQuiet("[hello]"))).toBe("world");
  });

  test("run can invoke stdlib functions with arguments", () => {
    const ranty = new Ranty({ seed: 1n });
    expect(ranty.run(ranty.compileQuiet("[add:2;3]"))).toBe("5");
    expect(ranty.run(ranty.compileQuiet("[mul:[add:2;3];4]"))).toBe("20");
  });

  test("blocks, repeaters, and selectors evaluate through the VM", () => {
    const ranty = new Ranty();
    expect(ranty.run(ranty.compileQuiet("test ~{test} test"))).toBe(
      "testtesttest"
    );
    expect(ranty.run(ranty.compileQuiet("[rep:3][sep:\\s]{a}"))).toBe("a a a");
    expect(
      ranty.run(ranty.compileQuiet("[rep:8][sel:[mksel:forward]]{a|b|c|d}"))
    ).toBe("abcdabcd");
  });

  test("angle defs and variable access resolve with local scope", () => {
    const ranty = new Ranty();
    expect(
      ranty.run(
        ranty.compileQuiet("<$foo=8; $bar=2; $baz=[sub:<foo>;<bar>]; baz>")
      )
    ).toBe("6");
    expect(
      ranty.run(ranty.compileQuiet("<$test=foo>{<$test=bar><test>}<test>"))
    ).toBe("barfoo");
  });

  test("function definitions and selector state are usable from source", () => {
    const ranty = new Ranty();
    expect(
      ranty.run(ranty.compileQuiet("[$square:x]{[mul:<x>;<x>]}[square:3]"))
    ).toBe("9");
    expect(
      ranty.run(
        ranty.compileQuiet(
          "<$sel=[mksel:forward]>[sel-frozen:<sel>][sel-freeze:<sel>][sel-frozen:<sel>]"
        )
      )
    ).toBe("@false@true");
  });

  test("@ keywords drive block sugar and conditionals", () => {
    const ranty = new Ranty();
    expect(ranty.run(ranty.compileQuiet("@rep 3: {x}"))).toBe("xxx");
    expect(ranty.run(ranty.compileQuiet('@sel "forward": {a|b}'))).toBe("a");
    expect(ranty.run(ranty.compileQuiet("@if @true: {yes} @else: {no}"))).toBe(
      "yes"
    );
    expect(
      ranty.run(
        ranty.compileQuiet(
          '@if "": {yes} @elseif @true: {fallback} @else: {no}'
        )
      )
    ).toBe("fallback");
  });

  test("@step, @total, and return are available in the runtime", () => {
    const ranty = new Ranty();
    expect(ranty.run(ranty.compileQuiet("[rep:3][sep:,]{@step}"))).toBe(
      "0,1,2"
    );
    expect(ranty.run(ranty.compileQuiet("[rep:3]{[step]}"))).toBe("123");
    expect(ranty.run(ranty.compileQuiet("[rep:3]{@total}"))).toBe("333");
    expect(ranty.run(ranty.compileQuiet("[$emit]{@return done}[emit]"))).toBe(
      "done"
    );
    expect(ranty.run(ranty.compileQuiet("@return top-level"))).toBe(
      "top-level"
    );
  });

  test("break and continue follow repeater control-flow rules", () => {
    const ranty = new Ranty();
    expect(ranty.run(ranty.compileQuiet("[rep:3]{A @continue B}"))).toBe("BBB");
    expect(ranty.run(ranty.compileQuiet("[rep:3]{A @break B}"))).toBe("B");
    expect(
      ranty.run(ranty.compileQuiet("[rep:3]{start { @continue next } end}"))
    ).toBe("nextnextnext");
    expect(
      ranty.run(ranty.compileQuiet("[rep:3]{start { @break stop } end}"))
    ).toBe("stop");
    expect(() => ranty.run(ranty.compileQuiet("@continue"))).toThrow(
      /no reachable repeater to interrupt/
    );
    expect(() => ranty.run(ranty.compileQuiet("@break"))).toThrow(
      /no reachable repeater to interrupt/
    );
    expect(() =>
      ranty.run(ranty.compileQuiet("[$skip]{@continue skip}[rep:3]{[skip]}"))
    ).toThrow(/no reachable repeater to interrupt/);
  });

  test("block stdlib exposes non-placeholder branch and selector cursor helpers", () => {
    const ranty = new Ranty();
    expect(ranty.run(ranty.compileQuiet("[if:@true]{yes}[else]{no}"))).toBe(
      "yes"
    );
    expect(
      ranty.run(
        ranty.compileQuiet(
          "<$sel=[mksel:forward]>[sel-frozen:<sel>][sel-freeze:<sel>][sel-frozen:<sel>]"
        )
      )
    ).toBe("@false@true");
    expect(() =>
      ranty.run(
        ranty.compileQuiet("<$sel=[mksel:match;foo]>[sel-freeze:<sel>]")
      )
    ).toThrow(/cursor operations are not supported on match selectors/);
    expect(() =>
      ranty.run(ranty.compileQuiet("<$sel=[mksel:match;foo]>[sel-skip:<sel>]"))
    ).toThrow(/cursor operations are not supported on match selectors/);
  });

  test("rand is deterministic through the stdlib", () => {
    const first = new Ranty({ seed: 0xdeadbeefn });
    const second = new Ranty({ seed: 0xdeadbeefn });

    const source = "[rand:0;1000000]";
    expect(first.run(first.compileQuiet(source))).toBe(
      second.run(second.compileQuiet(source))
    );
  });

  test("runtime stdlib errors surface as RuntimeError", () => {
    const ranty = new Ranty();
    expect(() => ranty.run(ranty.compileQuiet('[error:"boom"]'))).toThrow(
      /boom/
    );
  });

  test("compileFileQuiet loads source from disk", () => {
    const ranty = new Ranty();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ranty-js-"));
    const filePath = path.join(tempDir, "hello.ranty");
    fs.writeFileSync(filePath, '"hello from file"', "utf8");

    const program = ranty.compileFileQuiet(filePath);
    expect(program.path()).toBe(fs.realpathSync(filePath));
    expect(ranty.run(program)).toBe("hello from file");

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("unsupported syntax reports a compiler error", () => {
    const ranty = new Ranty();
    expect(() => ranty.compileQuiet("(")).toThrow(CompilerError);
  });
});

describe("runtime corpus", () => {
  test("fixture corpus tracks the executable non-tutorial fixtures", () => {
    const corpus = loadFixtureCorpus();
    expect(corpus.cases.map((entry) => entry.file)).toEqual(
      discoverExecutableFixtures()
    );
  });

  test("executable fixture corpus matches CLI output", async () => {
    const corpus = loadFixtureCorpus();

    for (const entry of corpus.cases) {
      const output = await runJsCliAsync([entry.file]);
      expect(output.status, `${entry.file} exit mismatch`).toBe(entry.status);
      expect(output.stdout, `${entry.file} stdout mismatch`).toBe(entry.stdout);
      expect(
        relevantStderr(output.stderr, output.status),
        `${entry.file} stderr mismatch`
      ).toBe(entry.stderr);
    }
  }, 300_000);

  test("cli corpus matches CLI output", async () => {
    const corpus = loadCliCorpus();

    for (const caseEntry of corpus.cases) {
      if (caseEntry.kind === "paired-simple") {
        const first = await runJsCliAsync(
          caseEntry.first.args,
          caseEntry.first.stdin
        );
        const second = await runJsCliAsync(
          caseEntry.second.args,
          caseEntry.second.stdin
        );

        expect(first.status, `${caseEntry.name} first exit mismatch`).toBe(
          caseEntry.first.expectedStatus
        );
        expect(second.status, `${caseEntry.name} second exit mismatch`).toBe(
          caseEntry.second.expectedStatus
        );
        for (const expected of caseEntry.first.stderrIncludes) {
          expect(
            first.stderr,
            `${caseEntry.name} first stderr missing ${expected}`
          ).toContain(expected);
        }
        for (const forbidden of caseEntry.first.stderrExcludes) {
          expect(
            first.stderr,
            `${caseEntry.name} first stderr unexpectedly contained ${forbidden}`
          ).not.toContain(forbidden);
        }
        for (const expected of caseEntry.second.stderrIncludes) {
          expect(
            second.stderr,
            `${caseEntry.name} second stderr missing ${expected}`
          ).toContain(expected);
        }
        for (const forbidden of caseEntry.second.stderrExcludes) {
          expect(
            second.stderr,
            `${caseEntry.name} second stderr unexpectedly contained ${forbidden}`
          ).not.toContain(forbidden);
        }
        expect(first.stdout, `${caseEntry.name} paired stdout mismatch`).toBe(
          second.stdout
        );
        continue;
      }

      let args = [...caseEntry.args];
      let cwd = undefined;
      if (caseEntry.kind === "workspace") {
        const workspace = tempCorpusWorkspace();
        writeCorpusWorkspace(workspace, caseEntry.files ?? {});
        args = replaceWorkspaceTokens(args, workspace);
        cwd = workspace;
      }

      const output = await runJsCliAsync(args, caseEntry.stdin, cwd);
      expect(output.status, `${caseEntry.name} exit mismatch`).toBe(
        caseEntry.expectedStatus
      );
      if (caseEntry.expectedStdout !== null) {
        expect(output.stdout, `${caseEntry.name} stdout mismatch`).toBe(
          caseEntry.expectedStdout
        );
      }
      for (const expected of caseEntry.stdoutIncludes) {
        expect(
          output.stdout,
          `${caseEntry.name} stdout missing ${expected}`
        ).toContain(expected);
      }
      for (const expected of caseEntry.stderrIncludes) {
        expect(
          output.stderr,
          `${caseEntry.name} stderr missing ${expected}`
        ).toContain(expected);
      }
      for (const forbidden of caseEntry.stderrExcludes) {
        expect(
          output.stderr,
          `${caseEntry.name} stderr unexpectedly contained ${forbidden}`
        ).not.toContain(forbidden);
      }
    }
  }, 120_000);

  test("fuzz corpus matches CLI output", async () => {
    const corpus = loadFuzzCorpus();

    for (const caseEntry of corpus.cases) {
      const args = ["--eval", caseEntry.source];
      if (caseEntry.seed) {
        args.unshift(caseEntry.seed);
        args.unshift("--seed");
      }

      const output = await runJsCliAsync(args);
      expect(output.status, `${caseEntry.label} exit mismatch`).toBe(
        caseEntry.status
      );
      expect(output.stdout, `${caseEntry.label} stdout mismatch`).toBe(
        caseEntry.stdout
      );
      expect(
        relevantStderr(output.stderr, output.status),
        `${caseEntry.label} stderr mismatch`
      ).toBe(caseEntry.stderr);
    }
  }, 600_000);
});

describe("conditionals", () => {
  const branch = (condition: string) =>
    runSource(`@if ${condition}: {truthy} @else: {falsy}`);

  test("stable scalar truthiness matches the runtime rules", () => {
    expect(branch('""')).toBe("falsy");
    expect(branch('"text"')).toBe("truthy");
    expect(branch("0")).toBe("falsy");
    expect(branch("-1")).toBe("truthy");
    expect(branch("0.0")).toBe("falsy");
    expect(branch("0.5")).toBe("truthy");
    expect(branch("<INFINITY>")).toBe("truthy");
    expect(branch("<NAN>")).toBe("falsy");
    expect(branch("<>")).toBe("falsy");
  });

  test("collection truthiness matches the runtime rules", () => {
    expect(branch("[list]")).toBe("falsy");
    expect(branch("[list: 1]")).toBe("truthy");
    expect(branch("[assoc: [list]; [list]]")).toBe("falsy");
    expect(branch("[assoc: [list: a]; [list: 1]]")).toBe("truthy");
    expect(branch("[tuple]")).toBe("truthy");
  });

  test("conditional branches short-circuit", () => {
    expect(
      runSource('@if @true: {pass} @elseif [error: "should not run"]: {fail}')
    ).toBe("pass");
    expect(
      runSource('@if @false: {[error: "should not run"]} @else: {fallback}')
    ).toBe("fallback");
  });

  test("nested conditionals select only the matching branch", () => {
    expect(
      runSource(`
@if [list]:
{
  outer-truthy
}
@elseif @true:
{
  @if "":
  {
    bad
  }
  @else:
  {
    nested-fallback
  }
}
@else:
{
  bad
}
`)
    ).toBe("nested-fallback");
  });
});

describe("control flow", () => {
  test("continue requires a reachable repeater", () => {
    expect(runtimeError("@continue").message).toBe(
      "[CONTROL_FLOW_ERROR] no reachable repeater to interrupt"
    );
  });

  test("break requires a reachable repeater", () => {
    expect(runtimeError("@break").message).toBe(
      "[CONTROL_FLOW_ERROR] no reachable repeater to interrupt"
    );
  });

  test("continue can cross nested blocks", () => {
    expect(runSource("[rep:3]{start { @continue next } end}")).toBe(
      "nextnextnext"
    );
  });

  test("break can cross nested blocks", () => {
    expect(runSource("[rep:3]{start { @break stop } end}")).toBe("stop");
  });

  test("continue does not cross function boundaries", () => {
    expect(
      runtimeError(`
[$skip] { @continue skip }
[rep:3]{[skip]}
`).message
    ).toBe("[CONTROL_FLOW_ERROR] no reachable repeater to interrupt");
  });

  test("break does not cross function boundaries", () => {
    expect(
      runtimeError(`
[$stop] { @break stop }
[rep:3]{[stop]}
`).message
    ).toBe("[CONTROL_FLOW_ERROR] no reachable repeater to interrupt");
  });

  test("return inside a function called from a repeater returns function output only", () => {
    expect(
      runSource(`
[$emit] {
  @return done
}
[rep:3]{[emit]}
`)
    ).toBe("donedonedone");
  });
});

describe("runtime semantics", () => {
  test("basic fragment rendering remains stable", () => {
    expect(runSource("")).toBe("");
    expect(runSource("foo")).toBe("foo");
    expect(runSource("foo bar")).toBe("foo bar");
    expect(runSource("test ~{test} test")).toBe("testtesttest");
    expect(runSource("{test}")).toBe("test");
  });

  test("repeaters and selectors remain stable", () => {
    expect(runSource("[rep:10]{a}")).toBe("aaaaaaaaaa");
    expect(runSource("[rep:10][sep:\\s]{a}")).toBe("a a a a a a a a a a");
    expect(runSource("[rep:10][sep:[?]{b}]{a}")).toBe("abababababababababa");
    expect(runSource("[rep:16][sel:[mksel:forward]]{a|b|c|d|e|f|g|h}")).toBe(
      "abcdefghabcdefgh"
    );
    expect(runSource("[rep:16][sel:[mksel:reverse]]{a|b|c|d|e|f|g|h}")).toBe(
      "hgfedcbahgfedcba"
    );
    expect(runSource("[rep:16][sel:[mksel:ping]]{a|b|c|d|e|f|g|h}")).toBe(
      "abcdefghgfedcbab"
    );
    expect(runSource("[rep:16][sel:[mksel:pong]]{a|b|c|d|e|f|g|h}")).toBe(
      "hgfedcbabcdefghg"
    );
  });

  test("selector freeze state is observable", () => {
    expect(runSource("<$sel=[mksel:forward]>[sel-frozen:<sel>]")).toBe(
      "@false"
    );
    expect(
      runSource("<$sel=[mksel:forward]>[sel-freeze:<sel>][sel-frozen:<sel>]")
    ).toBe("@true");
  });

  test("functions and shadowed access stay stable", () => {
    expect(runSource("[$example-func]{test}[example-func]")).toBe("test");
    expect(runSource("[$square:x]{[mul:<x>;<x>]} [square:3]")).toBe("9");
    expect(runSource("<$/test=foo><$test=bar><test>")).toBe("bar");
    expect(runSource("<$test=foo>{<$test=bar><test>}")).toBe("bar");
    expect(runSource("<$/example=foo><$example=bar></example>")).toBe("foo");
    expect(runSource("<$/example=foo><$example=bar><^example>")).toBe("foo");
    expect(runSource("<$test=foo>{<$test=bar><^test>}")).toBe("foo");
  });

  test("multi-accessor defs and reassignments stay stable", () => {
    expect(runSource("<$foo=8; $bar=2; $baz=[sub:<foo>;<bar>]; baz>")).toBe(
      "6"
    );
    expect(runSource("<$foo=bar; foo=baz; foo>")).toBe("baz");
    expect(runSource("<$foo=8; $bar=2; $baz=[add:<foo>;<bar>]; baz;>")).toBe(
      "10"
    );
  });
});
