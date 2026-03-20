# Testing Style

Tests in Ranty.js should prefer user-visible or contract-visible behavior over
implementation details. This repository spans library, CLI, browser, and
workflow surfaces, so the rule is broader than API-only testing: verify the
behavior a consumer or contributor depends on.

## Rules

- Assert what the public API, CLI, browser bridge, or vendored upstream
  contract guarantees.
- Prefer simple direct tests over broad fixture setup when a small test is
  enough.
- Keep asynchronous waiting narrow and explicit.
- Use fixtures when the workflow being tested depends on file layout, git
  state, generated artifacts, or vendored upstream corpora.

## Avoid

- asserting on internal helper structure when an observable contract is what
  matters
- snapshot-driven tests as the primary source of confidence
- broad polling around behavior that could be expressed directly
- brittle tests that depend on file ordering without a real contract reason

## Scope

These rules apply to:

- public API tests
- runtime and stdlib tests
- CLI and browser-host tests
- vendored upstream parity tests
- repository workflow tests
