# Anti-Drift Boilerplate Spec

This directory is the authoritative description of implemented behavior,
architecture, and engineering rules for this repository. If code and spec
disagree, resolve the disagreement explicitly.

Project terminology is defined separately in
[`../glossary/README.md`](../glossary/README.md). Use the glossary when wording
about authoritative artifacts, derived artifacts, task packets, and related
concepts needs to stay exact across files.

## Read In This Order

1. Start with this file.
2. Read `../glossary/README.md`.
3. Run `npm run context:task -- "<task>"`.
4. Read every spec page, subsystem record, ADR, and workflow doc that the task brief points at.
5. Update every affected authoritative artifact in the same change.

## Spec Pages

- [`./tooling-and-quality.md`](./tooling-and-quality.md): toolchain, scripts, authoritative artifacts, and required workflow
- [`./testing-style.md`](./testing-style.md): behavior-level testing rules
- [`./comment-style.md`](./comment-style.md): comment-writing rules for first-party code and repo configuration

## Structured Context

- [`./subsystems/index.yaml`](./subsystems/index.yaml): source-root ownership, task-state paths, and architecture-boundary rules
- [`./subsystems/`](./subsystems/): authoritative subsystem records covering boundaries, invariants, dependencies, tests, and history anchors
- [`./decisions/`](./decisions/): short ADRs that capture durable rationale for architecture and workflow decisions
- [`./generated/repo-map.json`](./generated/repo-map.json): generated first-party dependency and ownership map
- [`./generated/subsystem-graph.mmd`](./generated/subsystem-graph.mmd): generated Mermaid view of subsystem dependencies

Useful but non-authoritative future-facing material lives in
[`../notes.md`](../notes.md).

## Workflow Docs

Use [`../docs/README.md`](../docs/README.md) for practical guidance.

Use [`../glossary/README.md`](../glossary/README.md) for authoritative
terminology.

Use [`../docs/context-system/README.md`](../docs/context-system/README.md) for
the anti-drift workflow.

Use [`../docs/repo-workflow/README.md`](../docs/repo-workflow/README.md) for
git commit workflow and `notes.md` upkeep rules.
