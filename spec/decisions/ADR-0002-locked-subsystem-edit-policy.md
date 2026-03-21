---
id: ADR-0002
status: accepted
date: 2026-03-20
subsystems:
  - repo-governance-context-system
  - public-api-and-build-contract
  - upstream-parity-contract
supersedes: []
tags:
  - anti-drift
  - locked-subsystems
  - workflow
---

# ADR-0002 Locked subsystem edit policy

## Context

Ranty.js contains seams that should be extended carefully rather than casually
rewritten, especially the public package contract and the vendored upstream
parity machinery.

## Decision

Mark those subsystems as `locked` in their subsystem records. Any task that
intends to edit locked subsystem code must opt in through the repo-local active
task packet, and the same change must update the touched subsystem record plus a
relevant ADR in `spec/decisions/`. That policy also covers local documentation
surfaces that describe the supported JS package contract, even when the actual
runtime implementation stays unchanged.

## Consequences

Routine feature work fails closed when it spills into locked subsystem code.
Explicit architecture work remains possible, but it must be visible in the
authoritative records. Changes that move or consolidate public package
documentation, such as routing JS-specific reference material through
`README.md` and a thin `docs/README.md`, must stay explicit in subsystem
records and ADR text rather than being treated as informal copy edits.

## Validation

`npm run context:check` reads the active task packet and rejects locked
subsystem changes without an allow-list entry and matching authoritative record
updates.
