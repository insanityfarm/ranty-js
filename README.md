# Anti-Drift TypeScript Boilerplate

This repository is a generic ESM TypeScript starter with an anti-drift workflow
baked into the project shape. The goal is to make blank-context agent sessions
and human contributors converge on the implemented architecture instead of
reconstructing it from local guesses.

This `README.md` is the onboarding map. The authoritative contract lives in
[`./spec/`](./spec/), the authoritative terminology lives in
[`./glossary/`](./glossary/), and recurring workflow guidance lives in
[`./docs/`](./docs/).

This boilerplate is released under the MIT license in [`./LICENSE`](./LICENSE).

## Intent

Use this boilerplate when you want a small TypeScript foundation that ships:

- a strict public API boundary
- structured architecture memory inside the repo
- explicit task briefing for blank-context work
- local checks that fail when docs, boundaries, or terminology drift

The sample project is deliberately small. Replace the sample library code with
your own product code, but keep the workflow structure unless you have a clear
reason to change it.

## Quick Start

1. Use Node.js `22.x`.
2. Run `npm install`.
3. Run `npm run context:build`.
4. Read [`./spec/README.md`](./spec/README.md).
5. Read [`./glossary/README.md`](./glossary/README.md).
6. Start work with `npm run context:task -- "<task>"`.
7. Run `npm run verify` before treating a change as done.

## Daily Workflow

1. Read the authoritative spec and glossary.
2. Run `npm run context:task -- "<task>"`.
3. Read `.agent-context/active-task.md`.
4. Follow the listed subsystem records, ADRs, docs, and tests before editing.
5. Update touched authoritative artifacts in the same change.
6. If you changed `glossary/terms.yaml`, `spec/subsystems/`, or
   `spec/decisions/`, run `npm run context:build`.
7. Run `npm run verify`.

## Source Of Truth Map

- `spec/`: authoritative description of current behavior, architecture, and workflow
- `glossary/`: authoritative project terminology
- `docs/`: recurring workflow guidance
- `LICENSE`: project license for the boilerplate itself
- `spec/subsystems/`: subsystem ownership, boundaries, invariants, and tests
- `spec/decisions/`: ADRs for durable rationale
- `spec/generated/` and `glossary/README.md`: derived context artifacts
- `notes.md`: explicitly non-authoritative future-facing follow-up only

## Anti-Drift Protection Suite

This boilerplate includes the full protection set generalized from the audited
`hackgame` workflow:

### 1. Thin `AGENTS.md`

`AGENTS.md` stays intentionally short and routes agents to the authoritative
artifacts instead of trying to embed the whole architecture in one prompt-sized
file.

### 2. Authoritative Spec And Glossary

The repository splits current behavior from terminology:

- `spec/` defines what the project does and how the workflow operates
- `glossary/terms.yaml` defines exact words the project uses for cross-cutting concepts

That separation reduces synonym drift and keeps domain language consistent
across code, docs, and reviews.

### 3. Structured Subsystem Records

Each subsystem has a YAML record under `spec/subsystems/` that declares:

- owned paths
- related paths
- entrypoints
- dependencies
- invariants
- tests
- change policy

This gives the repo a queryable architecture map instead of relying on prose or
memory.

### 4. ADRs

Short Architecture Decision Records under `spec/decisions/` capture the durable
`why` behind the project shape. Locked-subsystem changes require ADR updates in
the same change.

### 5. Generated Context Artifacts

`npm run context:build` regenerates:

- `glossary/README.md`
- `spec/generated/repo-map.json`
- `spec/generated/subsystem-graph.mmd`

These files are derived views for discovery and review. They are never the
editing source of truth.

### 6. Subsystem Ownership Coverage

The context build checks that every first-party file listed by
`spec/subsystems/index.yaml` is owned by at least one subsystem. New files
cannot silently appear outside the architecture map.

### 7. Active Task Packets

`npm run context:task -- "<task>"` writes `.agent-context/active-task.json` and
`.agent-context/active-task.md`. The packet scores the task against subsystem
ids, titles, contracts, invariants, and glossary terms, then lists the required
reads and tests for the likely work surface.

### 8. Locked Subsystems

Sensitive seams can be marked `locked`. Those areas fail closed by default.
Editing them requires:

- explicit allow-listing through `context:task -- --allow-locked=...`
- subsystem record updates in the same change
- an ADR update in the same change

### 9. Context Checks

`npm run context:check` enforces:

- generated context freshness
- active-task presence
- no edits outside the planned subsystem surface
- no locked-subsystem edits without allow-listing
- subsystem record updates for touched owned code
- ADR updates for locked-subsystem changes

### 10. Terminology Checks

`npm run terms:check` scans first-party code and docs for discouraged glossary
replacements. It skips generated files and pushes contributors back to the
canonical project terms.

### 11. Architecture Boundary Checks

`npm run arch:check` reads import-boundary rules from
`spec/subsystems/index.yaml` and rejects forbidden import edges. The starter
rules demonstrate one-way boundaries between the public barrel and internal
implementation.

### 12. Review Packets

`npm run drift:review` writes `.agent-context/drift-review.md` with:

- the active task summary
- changed files
- touched subsystems
- the invariants that matter most for those subsystems
- changed authoritative artifacts

This gives reviewers a bounded anti-drift review surface without creating a
second source of truth.

### 13. Comment And Lint Drift Guards

The starter lint rules reject backlog-style `TODO` or `FIXME` comments, unused
ESLint disable directives, and lint-disable comments without a concrete reason
introduced by `--`.

### 14. Local-First Verification

This starter does not ship CI by default. `npm run verify` is the authoritative
done condition. If you add CI later, keep it aligned with the same local flow
instead of inventing a separate source of truth.

## Starter Layout

- `src/index.ts`: public barrel
- `src/public/`: exported API modules
- `src/internal/`: implementation helpers
- `scripts/context-system/`: anti-drift tooling
- `spec/`: authoritative spec, subsystem records, ADRs, generated maps
- `glossary/`: terminology source and generated glossary readme
- `docs/`: workflow guidance

## Commands

- `npm run context:build`: regenerate derived context artifacts
- `npm run context:task -- "<task>"`: write the repo-local active task packet
- `npm run context:check`: enforce task coverage and derived-artifact freshness
- `npm run drift:review`: write a bounded drift-review packet
- `npm run terms:check`: reject discouraged glossary replacements
- `npm run arch:check`: reject forbidden import edges
- `npm run lint`: run ESLint, directive checks, and terminology checks
- `npm run test`: run Vitest
- `npm run check`: run lint, format, typecheck, test, architecture, and context checks
- `npm run verify`: run `check` and then the build

## License

MIT is the right default here. For a boilerplate repository, it keeps reuse
friction low, is widely understood, and avoids adding policy beyond the
required attribution notice.

If you want an explicit patent grant, Apache-2.0 is the stronger permissive
alternative. For this starter, MIT is the simpler default and now applies via
[`./LICENSE`](./LICENSE).

## Customization

Keep customization light. The starter is meant to be opinionated.

- Replace the sample code in `src/public/` and `src/internal/` with your real implementation.
- Update subsystem `owned_paths`, invariants, and tests as your architecture becomes more specific.
- Mark additional subsystems `locked` when a seam becomes boundary-sensitive or performance-sensitive.
- Extend `glossary/terms.yaml` when exact wording matters across multiple files.
- Refine the architecture rules in `spec/subsystems/index.yaml` as the repo gains new layers.
- Rename `.agent-context/` if you need a different repo-local task state directory, then update `AGENTS.md` and the subsystem index paths together.

## Get Started Replacing The Sample Library

1. Replace `createExampleMessage()` with your real exported API.
2. Update the public API glossary terms if your project needs domain language.
3. Rewrite the subsystem records to match your real layers.
4. Add or update ADRs when you make durable architecture decisions.
5. Run `npm run context:build` and `npm run verify`.

## Cross References

- Authoritative spec index: [`./spec/README.md`](./spec/README.md)
- Authoritative glossary: [`./glossary/README.md`](./glossary/README.md)
- Context-system guide: [`./docs/context-system/README.md`](./docs/context-system/README.md)
- Repo workflow guide: [`./docs/repo-workflow/README.md`](./docs/repo-workflow/README.md)
