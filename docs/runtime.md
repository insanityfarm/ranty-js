# Runtime Features

The TypeScript port mirrors the Rust runtime structure where it can do so safely in JavaScript:

- deterministic seeded randomness,
- mutable execution context state,
- module caching,
- browser virtual modules,
- Node filesystem-backed module resolution,
- exact integer handling through `bigint`-aware internals.

Rust-specific ownership, allocation, and cycle-collection internals are translated into JavaScript-appropriate equivalents rather than copied literally.
