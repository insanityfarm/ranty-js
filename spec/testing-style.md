# Testing Style

Tests in this boilerplate should prefer user-visible or contract-visible
behavior over implementation details. The project is not tied to a UI runtime,
so the rule is broader than component testing: verify the public contract that a
consumer depends on.

## Rules

- Assert what the public API or user-observable behavior guarantees.
- Prefer simple direct tests over broad fixture setup when a small test is enough.
- Keep asynchronous waiting narrow and explicit.
- Use fixtures when the workflow being tested depends on file layout, git state, or generated artifacts.

## Avoid

- asserting on internal helper structure when the public contract is what matters
- snapshot-driven tests as the primary source of confidence
- broad polling around behavior that could be expressed directly
- brittle tests that depend on file ordering without a real contract reason

## Scope

These rules apply to:

- public API tests
- repository workflow tests
- anti-drift tooling tests
