import path from "node:path";

import { describe, expect, test } from "vitest";

import { CompilerError, Ranty } from "../src/index";
import type { CompilerMessage, Reporter } from "../src/core/messages";
import {
  DefaultModuleResolver,
  compileAndRunFileResult,
  runSource,
  tempWorkspace,
  withEnv,
  writeWorkspace
} from "./suite-helpers";

class CollectingReporter implements Reporter {
  readonly messages: CompilerMessage[] = [];

  report(message: CompilerMessage): void {
    this.messages.push(message);
  }
}

describe("module-style paths", () => {
  test("map literals and slash-path function exports are executable", () => {
    const ranty = new Ranty();
    const source = "<$module = (::)>[$module/value]{42}[module/value]";

    expect(ranty.run(ranty.compileQuiet(source))).toBe("42");
  });

  test("@require loads virtual modules and binds the default alias", () => {
    const ranty = new Ranty().usingModuleResolver(
      Ranty.createVirtualModules({
        "mods/shared.ranty": "<%module = (::)>[$module/value]{modern}<module>"
      })
    );

    expect(
      ranty.run(ranty.compileQuiet('@require "mods/shared"[shared/value]'))
    ).toBe("modern");
  });

  test("@require supports explicit aliases", () => {
    const ranty = new Ranty().usingModuleResolver(
      Ranty.createVirtualModules({
        "mods/shared.ranty": "<%module = (::)>[$module/value]{aliased}<module>"
      })
    );

    expect(
      ranty.run(ranty.compileQuiet('@require pkg: "mods/shared"[pkg/value]'))
    ).toBe("aliased");
  });

  test("@require caches repeated imports by resolved module path", () => {
    const ranty = new Ranty({ seed: 7n }).usingModuleResolver(
      Ranty.createVirtualModules({
        "mods/randomized.ranty":
          "<%module = (::)><$value = [rand: 1; 100]>[$module/value]{<value>}<module>"
      })
    );

    const output = String(
      ranty.run(
        ranty.compileQuiet(
          '@require "mods/randomized"@require again: "mods/randomized"[randomized/value]|[again/value]'
        )
      )
    );
    const [first, second] = output.split("|");

    expect(first).toBeDefined();
    expect(first).toBe(second);
  });

  test("@require rejects cyclic imports", () => {
    const ranty = new Ranty().usingModuleResolver(
      Ranty.createVirtualModules({
        "a.ranty": '<%module = (::)> @require "b" <module>',
        "b.ranty": '<%module = (::)> @require "a" <module>'
      })
    );

    expect(() => ranty.run(ranty.compileQuiet('@require "a"'))).toThrow(
      /cyclic module import detected/
    );
  });

  test("invalid @require path keeps the stable compiler diagnostic", () => {
    const ranty = new Ranty();
    const reporter = new CollectingReporter();

    expect(() => ranty.compile("@require alias: 42", reporter)).toThrow(
      CompilerError
    );
    expect(reporter.messages[0]?.code).toBe("R0203");
    expect(reporter.messages[0]?.message).toBe(
      "@require path should be a string literal"
    );
  });

  test("@require reports missing modules", () => {
    const workspace = tempWorkspace();
    writeWorkspace(workspace, {
      "main.ranty": '@require "missing/module"'
    });

    const result = compileAndRunFileResult(path.join(workspace, "main.ranty"));
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error).toContain("[MODULE_ERROR]");
    expect(result.ok ? "" : result.error).toContain(
      "module 'missing/module' not found"
    );
  });

  test("@require prefers .ranty when both extensions exist", () => {
    const workspace = tempWorkspace();
    writeWorkspace(workspace, {
      "main.ranty": `
@require "mods/shared"
[shared/value]
`,
      "mods/shared.ranty": `
<%module = (::)>
[$module/value] { modern }
<module>
`,
      "mods/shared.rant": `
<%module = (::)>
[$module/value] { legacy }
<module>
`
    });

    expect(compileAndRunFileResult(path.join(workspace, "main.ranty"))).toEqual(
      { ok: true, value: "modern" }
    );
  });

  test("@require can load legacy .rant modules when no .ranty exists", () => {
    const workspace = tempWorkspace();
    writeWorkspace(workspace, {
      "main.ranty": `
@require "legacy"
[legacy/value]
`,
      "legacy.rant": `
<%module = (::)>
[$module/value] { legacy-only }
<module>
`
    });

    expect(compileAndRunFileResult(path.join(workspace, "main.ranty"))).toEqual(
      { ok: true, value: "legacy-only" }
    );
  });

  test("@require can mix explicit .ranty and .rant paths", () => {
    const workspace = tempWorkspace();
    writeWorkspace(workspace, {
      "main.ranty": `
@require modern: "mods/shared.ranty"
@require legacy: "mods/shared.rant"
[modern/value][legacy/value]
`,
      "mods/shared.ranty": `
<%module = (::)>
[$module/value] { modern }
<module>
`,
      "mods/shared.rant": `
<%module = (::)>
[$module/value] { legacy }
<module>
`
    });

    expect(compileAndRunFileResult(path.join(workspace, "main.ranty"))).toEqual(
      { ok: true, value: "modernlegacy" }
    );
  });

  test("@require can load tracked legacy fixtures", () => {
    const entry = path.resolve(
      process.cwd(),
      "upstream",
      "ranty",
      "tests",
      "sources",
      "compat",
      "module_entry.rant"
    );

    expect(compileAndRunFileResult(entry)).toEqual({
      ok: true,
      value: "legacy fixture:tracked-legacy-module"
    });
  });

  test("@require reports module compile failures", () => {
    const workspace = tempWorkspace();
    writeWorkspace(workspace, {
      "main.ranty": '@require "broken"',
      "broken.ranty": "{"
    });

    const result = compileAndRunFileResult(path.join(workspace, "main.ranty"));
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error).toContain("[MODULE_ERROR]");
    expect(result.ok ? "" : result.error).toContain("failed to compile");
  });

  test("@require propagates module runtime failures", () => {
    const workspace = tempWorkspace();
    writeWorkspace(workspace, {
      "main.ranty": '@require "broken"',
      "broken.ranty": '[error: "boom"]'
    });

    const result = compileAndRunFileResult(path.join(workspace, "main.ranty"));
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error).toContain("[USER_ERROR]");
    expect(result.ok ? "" : result.error).toContain("boom");
  });

  test("@require can use the global modules path", () => {
    const workspace = tempWorkspace();
    const globalModules = path.join(workspace, "global-modules");
    writeWorkspace(workspace, {
      "global-modules/shared.ranty": `
<%module = (::)>
[$module/value] {
  from-global
}
<module>
`
    });

    const output = withEnv(
      DefaultModuleResolver.ENV_MODULES_PATH_KEY,
      globalModules,
      () => {
        const ranty = new Ranty({ debugMode: true }).usingModuleResolver(
          new DefaultModuleResolver({
            enableGlobalModules: true,
            localModulesPath: path.join(workspace, "local")
          })
        );
        return runSource('@require "shared" [shared/value]', ranty);
      }
    );

    expect(output).toBe("from-global");
  });
});
