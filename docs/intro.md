# Ranty.js Reference

Ranty.js is a TypeScript port of the original Rust implementation of [Ranty](https://github.com/insanityfarm/ranty).

This docs set is adapted from the Ranty reference documentation for the JavaScript runtime. It omits the tutorial and the Diagnostics appendix, and focuses on the runtime model, module behavior, CLI/REPL usage, and package-oriented integration details.

The JavaScript package targets a single distributable bundle and exposes the `Ranty` interface in both browser and Node environments.
