# Library Usage

The package export and browser global are both `Ranty`.

The public API is intended to mirror the Rust concepts:

- `Ranty`
- `RantyOptions`
- `RantyProgram`
- compiler and runtime error/message types
- module resolvers
- data-source registration

Node-only helpers remain explicit, and browser usage prefers virtual modules and in-memory evaluation flows.
