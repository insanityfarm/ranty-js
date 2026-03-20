# Ranty.js Spec

This directory is the authoritative description of implemented behavior,
architecture, and engineering workflow for the standalone Ranty.js repository.
If code and spec disagree, resolve the disagreement explicitly.

Ranty.js is downstream of the Rust
[Ranty](https://github.com/insanityfarm/ranty) implementation. The vendored
upstream parity bundle under [`../upstream/ranty/`](../upstream/ranty/) is a
locked authoritative input for core parity work, not a scratch area.

Project terminology is defined separately in
[`../glossary/README.md`](../glossary/README.md). Use the glossary when wording
about authoritative artifacts, the runtime core, the upstream parity contract,
or the parity lock needs to stay exact across files.

## Read In This Order

1. Start with this file.
2. Read `../glossary/README.md`.
3. Run `npm run context:task -- "<task>"`.
4. Read every spec page, subsystem record, ADR, workflow doc, and upstream
   contract file that the task brief points at.
5. Update every affected authoritative artifact in the same change.

## Spec Pages

- [`./tooling-and-quality.md`](./tooling-and-quality.md): toolchain, scripts,
  upstream-sync workflow, and required verification flow
- [`./testing-style.md`](./testing-style.md): behavior-level testing rules
- [`./comment-style.md`](./comment-style.md): comment-writing rules for
  first-party code and repo configuration

## Structured Context

- [`./subsystems/index.yaml`](./subsystems/index.yaml): source-root ownership,
  task-state paths, and architecture-boundary rules
- [`./subsystems/`](./subsystems/): subsystem records covering boundaries,
  invariants, dependencies, tests, and history anchors
- [`./decisions/`](./decisions/): ADRs that capture durable rationale for
  architecture, workflow, and upstream parity decisions
- [`./generated/repo-map.json`](./generated/repo-map.json): generated
  dependency and ownership map
- [`./generated/subsystem-graph.mmd`](./generated/subsystem-graph.mmd):
  generated Mermaid view of subsystem dependencies

Useful but non-authoritative future-facing material lives in
[`../notes.md`](../notes.md).

## Workflow Docs

Use [`../docs/README.md`](../docs/README.md) for practical guidance.

Use [`../docs/context-system/README.md`](../docs/context-system/README.md) for
the anti-drift workflow.

Use [`../docs/repo-workflow/README.md`](../docs/repo-workflow/README.md) for
repo-wide contributor rules.
