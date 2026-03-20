# Ranty.js

Ranty.js is the TypeScript port of
[Ranty](https://github.com/insanityfarm/ranty), a procedural templating
language and runtime. This repository is intentionally downstream of the Rust
implementation: core behavior is authored upstream first, then ported here
against the checked-in parity contract under [`./upstream/ranty/`](./upstream/ranty/).

## Quick Start

Use Node.js `22.x`.

```bash
npm install
npm run upstream:sync -- --ref=main
npm run context:build
npm run verify
```

## Library Use

```ts
import { Ranty } from "ranty-js";

const ranty = new Ranty({ seed: 0xdeadbeefn });
const program = ranty.compileQuiet("[rand:0;10]");

console.log(ranty.run(program));
```

## CLI Use

```bash
npx ranty-js --eval '"hello from ranty-js"'
npx ranty-js ./example.ranty
```

## Docs

- [`./docs/intro.md`](./docs/intro.md)
- [`./docs/library.md`](./docs/library.md)
- [`./docs/modules.md`](./docs/modules.md)
- [`./docs/runtime.md`](./docs/runtime.md)
- [`./docs/cli.md`](./docs/cli.md)

## Upstream Parity

- The Rust repo at [insanityfarm/ranty](https://github.com/insanityfarm/ranty)
  is authoritative for core behavior.
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
