---
id: ADR-0003
status: accepted
date: 2026-03-20
subsystems:
  - runtime-core
  - host-integrations
  - public-api-and-build-contract
  - upstream-parity-contract
supersedes: []
tags:
  - upstream
  - parity
  - workflow
---

# ADR-0003 Rust upstream authority

## Context

Ranty.js is a downstream port of the Rust Ranty implementation. The standalone
repo needs a checked-in mechanism for showing what upstream changed and for
failing closed only when JS work touches surfaces that should remain in parity.

## Decision

Treat the Rust repo as authoritative for core behavior. Sync its
`parity/ranty-js/**` bundle into `upstream/ranty/**`, record the synced commit
and contract hash in `upstream/ranty/lock.json`, and treat that vendored bundle
as a locked authoritative artifact. When upstream tooling runs without an
explicit `--ref`, it resolves the Rust repo's default branch instead of
assuming a hardcoded branch name.

Pull requests may touch host-only or workflow-only surfaces while the parity
lock is behind the Rust repo's default branch, but changes to `src/core/**`,
core-facing tests, or public/build-sensitive surfaces must refresh the parity
lock first.

## Consequences

Core work in Ranty.js must be framed against the vendored upstream contract.
`upstream/ranty/**` is not a local scratch area. Drift becomes explicit and
reviewable through the parity lock, freshness check, and the vendored contract
diff.

Downstream parity ports may still land as `src/core/**` changes against the
current vendored contract when Rust already synced the relevant parity bundle
updates. Those tasks still count as parity-sensitive work across the related
public/build and upstream subsystem seams, so their authoritative subsystem
records and ADR rationale must stay explicit in the same change.

## Validation

`npm run upstream:sync`, `npm run upstream:check-freshness`,
`tests/stdlib-surface.test.ts`, and the vendored-corpus smoke coverage enforce
the policy.
