[![NPM](https://img.shields.io/npm/dy/ranty-js)](https://www.npmjs.com/package/ranty-js)

# Ranty.js

Ranty.js is the TypeScript port of
[Ranty](https://github.com/insanityfarm/ranty), a procedural templating
language and runtime for generating text and structured values.

This repository is intentionally downstream of the Rust implementation. Shared
language, runtime, module, stdlib, and CLI behavior is authored upstream first,
then ported here against the checked-in parity contract under
[`./upstream/ranty/`](./upstream/ranty/).

## Documentation

- Shared Ranty reference: <https://insanityfarm.github.io/ranty/>
- Local JS-specific reference: this README

## How To Use The Ranty Docs From Ranty.js

Use the hosted Ranty reference for:

- language syntax
- standard-library behavior
- module semantics
- runtime concepts
- CLI semantics that are shared across Rust and JS

Use this README for:

- package installation and runtime targets
- Node.js and browser embedding
- the public JS host API
- the `ranty-js` CLI package and entrypoint
- JS-specific differences from the Rust embedding surface

When the hosted docs talk about embedding Ranty in Rust, keep the shared
language and runtime concepts, but ignore the Rust API details. The equivalent
JS host surface is documented below.

## Runtime Targets

- Node.js `>=22.0.0` for library or CLI usage
- browsers with ES2022 and `BigInt` support
- package name: `ranty-js`
- CLI command: `ranty-js`
- browser bundle: `dist/ranty.js`
- browser namespace: `globalThis.Ranty`

## Install

```bash
npm install ranty-js
```

For contributors working in this repository:

```bash
npm install
npm run context:build
npm run verify
```

## Node Library Use

```ts
import { Ranty } from "ranty-js";

const ranty = new Ranty({ seed: 0xdeadbeefn });
const program = ranty.compileQuiet(`
[$greet:name] {
  {Hello|Hi|Hey}, <name>!
}
[greet:world]
`);

console.log(ranty.run(program));
```

The `Ranty` constructor accepts a partial `RantyOptions` object. The main
options are:

| Option                   | Meaning                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| `useStdlib`              | Load the built-in globals. Disable it to supply a narrower custom prelude.                       |
| `debugMode`              | Emit richer compiler metadata and runtime diagnostics.                                           |
| `topLevelDefsAreGlobals` | Keep top-level definitions after a run, which is useful for REPL-like hosts.                     |
| `seed`                   | Set the initial RNG seed as a `number` or `bigint`.                                              |
| `gcAllocationThreshold`  | Reserved parity option; present on the JS API, but manual GC control does not currently do work. |

Useful host-side entrypoints include:

- `compileQuiet()`, `compileNamed()`, `compileFileQuiet()`
- `run()` and `runWith()`
- `setGlobalConst()` and `setGlobal()`
- `usingModuleResolver()`
- `addDataSource()` and `clearDataSources()`
- `Ranty.createVirtualModules()`

## Browser Use

Ranty.js ships a UMD bundle. In browsers, the exported symbols live under the
`globalThis.Ranty` namespace object.

```html
<script src="./node_modules/ranty-js/dist/ranty.js"></script>
<script>
  const { Ranty, VirtualModuleResolver } = globalThis.Ranty;

  const ranty = new Ranty().usingModuleResolver(
    new VirtualModuleResolver({
      "mods/greetings.ranty": '<%module = (:: hello = "browser world")><module>'
    })
  );

  const program = ranty.compileQuiet(
    '@require "mods/greetings"[greetings/hello]'
  );

  console.log(ranty.run(program));
</script>
```

Browser `@require` is synchronous. The runtime does not fetch modules over the
network, walk the filesystem, or infer module contents from URLs. Provide
modules up front through `VirtualModuleResolver` or another host-controlled
resolver.

## CLI Use

The published CLI command is `ranty-js`.

```bash
npx ranty-js --eval '"hello from ranty-js"'
npx ranty-js --seed deadbeef --eval '[rand:1;6]'
npx ranty-js ./example.ranty
printf '"from stdin"' | npx ranty-js
```

The Node CLI chooses its launch mode in this order:

1. `--eval PROGRAM`
2. `FILE`
3. piped stdin
4. REPL

Supported flags:

| Flag                   | Meaning                                                                     |
| ---------------------- | --------------------------------------------------------------------------- |
| `-e`, `--eval PROGRAM` | Run an inline program string.                                               |
| `-s`, `--seed SEED`    | Set the initial RNG seed as 1 to 16 hexadecimal digits, with optional `0x`. |
| `-b`, `--bench-mode`   | Print compile and execution timing to stderr.                               |
| `-W`, `--no-warnings`  | Suppress compiler warnings.                                                 |
| `-D`, `--no-debug`     | Disable debug symbol emission during compilation.                           |
| `-h`, `--help`         | Show CLI help.                                                              |
| `-V`, `--version`      | Show the build version.                                                     |

Exit codes:

| Code | Meaning                                    |
| ---- | ------------------------------------------ |
| `0`  | Success                                    |
| `64` | Invalid CLI usage, such as an invalid seed |
| `65` | Compilation failed                         |
| `66` | Input file not found                       |
| `70` | Runtime execution failed                   |

## Host Integration Example

```ts
import { Ranty } from "ranty-js";
import type { DataSource } from "ranty-js";

const buildInfo: DataSource = {
  typeId() {
    return "build-info";
  },

  requestData(args) {
    const channel = String(args[0] ?? "dev");
    return `channel:${channel}`;
  }
};

const ranty = new Ranty();
ranty.addDataSource(buildInfo);

console.log(
  ranty.run(ranty.compileQuiet('[ds-request:"build-info";"stable"]'))
);
```

Scripts access registered data sources through `[ds-request: ...]` and can
enumerate them through `[ds-query-sources]`.

## JS-Specific Differences

| Topic                     | Ranty.js behavior                                                                                                                                                                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package and command names | The npm package is `ranty-js`, and the packaged binary is `ranty-js`.                                                                                                                                                                          |
| Shared docs split         | The hosted docs at <https://insanityfarm.github.io/ranty/> are the shared language/runtime reference. This README is the local JS-specific host guide.                                                                                         |
| Host API naming           | The JS API uses camelCase method names such as `compileQuiet()`, `compileNamed()`, `compileFileQuiet()`, `usingModuleResolver()`, and `addDataSource()`.                                                                                       |
| Error model               | Host-side operations throw normal JS errors such as `CompilerError`, `RuntimeError`, `ModuleResolveError`, and `DataSourceError` instead of returning Rust `Result` values.                                                                    |
| Return values             | `run()` returns native JS values. Text output is a `string`; exact integers may be `bigint`; maps are `Map<string, unknown>`; list and tuple values are arrays; functions are JS callables.                                                    |
| Exact integers and seeds  | Integer-heavy APIs accept `number` or `bigint`. `RantyInt` preserves signed i64 semantics, and `toApiValue()` returns a `number` only when the value stays inside the safe integer range.                                                      |
| Node module resolution    | `DefaultModuleResolver` checks the dependant file directory first, then `localModulesPath` or `process.cwd()`, then `RANTY_MODULES_PATH` when global modules are enabled. When no extension is supplied, `.ranty` is preferred before `.rant`. |
| Browser module loading    | In browsers, `@require` only works through host-supplied resolvers such as `VirtualModuleResolver`. The runtime does not perform ambient filesystem or network lookup.                                                                         |
| Data sources              | Implement the `DataSource` interface and register it with `addDataSource()`. Scripts consume these integrations through `[ds-request: ...]` and `[ds-query-sources]`.                                                                          |
| Bundle shape              | `dist/ranty.js` is a UMD bundle. Browser consumers read exports from `globalThis.Ranty`, for example `globalThis.Ranty.Ranty` and `globalThis.Ranty.VirtualModuleResolver`.                                                                    |
| GC and ownership notes    | Rust ownership and borrowing guidance does not apply directly. `gcAllocationThreshold` remains part of the options surface for parity, and `collectGarbage()` is currently a no-op in the JS runtime.                                          |

## Upstream Parity

- The Rust repo at [insanityfarm/ranty](https://github.com/insanityfarm/ranty)
  is authoritative for shared language and runtime behavior.
- The vendored upstream bundle lives under [`./upstream/ranty/`](./upstream/ranty/).
- Refresh it with `npm run upstream:sync -- --ref=<rust-sha-or-branch>`.
- CI runs `npm run upstream:check-freshness` and only blocks pull requests that
  touch core, public API, or build-sensitive surfaces while the local parity
  lock is behind upstream Rust `main`.

## Contributor Workflow

- Read [`./spec/README.md`](./spec/README.md).
- Read [`./glossary/README.md`](./glossary/README.md).
- Read [`./AGENTS.md`](./AGENTS.md).
- Run `npm run context:task -- "<task>"` before editing.
- Run `npm run context:build` after changing glossary terms, subsystem records,
  or ADRs.
- Run `npm run verify` before treating a change as done.

## License

MIT. See [`./LICENSE`](./LICENSE).
