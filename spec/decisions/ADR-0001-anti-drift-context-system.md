---
id: ADR-0001
status: accepted
date: 2026-03-19
subsystems:
  - repo-governance-context-system
supersedes: []
tags:
  - anti-drift
  - context
  - documentation
---

# ADR-0001 Anti-drift context system

## Context

A reusable starter needs a compact, queryable way to keep blank-context work
aligned with implemented architecture and workflow.

## Decision

Store durable architecture memory in structured subsystem records, glossary
source data, generated repo maps, and short ADRs. Keep `AGENTS.md` thin and use
it to route readers into the authoritative artifacts and the task briefing
workflow instead of carrying the full project memory itself.

## Consequences

Task work must start from a generated task brief and must update the relevant
subsystem records, ADRs, spec pages, and glossary source when touched behavior
or terminology changes. Generated context artifacts become derived outputs that
must stay in sync with their YAML or Markdown sources.

## Validation

`npm run context:build`, `npm run context:check`, `npm run terms:check`, and
the full `npm run verify` flow enforce the structure locally.
