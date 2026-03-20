---
id: ADR-0002
status: accepted
date: 2026-03-19
subsystems:
  - repo-governance-context-system
  - public-api-and-build-contract
supersedes: []
tags:
  - anti-drift
  - locked-subsystems
  - workflow
---

# ADR-0002 Locked subsystem edit policy

## Context

Reusable starter repositories often contain seams that should be extended
carefully rather than casually rewritten, especially public API contracts and
build-facing packaging surfaces.

## Decision

Mark those subsystems as `locked` in their subsystem records. Any task that
intends to edit locked subsystem code must opt in through the repo-local active
task packet, and the same change must update the touched subsystem record plus a
relevant ADR in `spec/decisions/`.

## Consequences

Routine feature work fails closed when it spills into locked subsystem code.
Explicit architecture work remains possible, but it must be visible in the
authoritative records.

## Validation

`npm run context:check` reads the active task packet and rejects locked
subsystem changes without an allow-list entry and matching authoritative record
updates.
