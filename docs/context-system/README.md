# Context System Guide

This guide covers the anti-drift context system that keeps architecture memory
compact, queryable, and local to the repository. The implemented behavior still
lives in [`../../spec/README.md`](../../spec/README.md), and the authoritative
terminology still lives in [`../../glossary/README.md`](../../glossary/README.md).

## What This System Owns

- task briefing for blank-context sessions
- subsystem boundaries, invariants, and history anchors
- locked-subsystem edit policy
- terminology enforcement based on the glossary source data
- generated repo topology artifacts for review and exploration

## Start A Task

1. Read `spec/README.md`.
2. Read `glossary/README.md`.
3. Run `npm run context:task -- "<task>"`.
4. Read `.agent-context/active-task.md`.
5. Follow the listed subsystem records, spec pages, docs, ADRs, and tests before editing.

The active task packet is repo-local and gitignored. `npm run context:check`
uses it to make sure current work stays inside the planned subsystem surface.

## Locked Subsystems

Locked subsystems are architecture or contract-sensitive seams. They fail
closed by default.

If a task must edit locked subsystem code:

1. confirm the need to cross that seam
2. rerun `npm run context:task -- "<task>" --allow-locked=subsystem-id`
3. update the touched subsystem record and a related ADR in the same change

If the task can stay above the seam, leave the locked subsystem untouched.

## Choose The Right Artifact

Add or update a glossary term when:

- the concept is cross-cutting across multiple subsystems
- exact wording matters enough that synonym drift would be harmful

Add or update a subsystem invariant when:

- the behavior is architectural or contract-sensitive
- a future session could accidentally violate it while editing nearby code

Add or update an ADR when:

- the change revises why the system is shaped this way
- a locked-subsystem policy or architecture decision changed
- the task needs durable rationale that should survive code churn

Do not stuff subsystem-local jargon into the glossary unless it truly became a
repo-wide term.

## Generate And Check

- `npm run context:build`: regenerate `glossary/README.md` and files under `spec/generated/`
- `npm run terms:check`: reject discouraged glossary replacements
- `npm run arch:check`: enforce import-boundary rules
- `npm run context:check`: enforce active-task coverage, locked-subsystem policy, and generated-artifact freshness
- `npm run drift:review`: write `.agent-context/drift-review.md` for a second review session

Treat `context:build` like other derived-artifact generators in the repo: edit
the source files first, regenerate immediately, then continue with tests or
follow-up work.

## Review Packet Flow

Run `npm run drift:review` near the end of a task when you want a second review
session to check for drift. The packet includes:

- the active task summary
- changed files
- touched subsystems
- the invariants that matter most for those subsystems
- changed authoritative artifacts

The review packet is a bounded summary for reviewers. It is not a second source
of truth.
