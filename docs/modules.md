# Modules

Ranty.js keeps the same high-level module story as Rust Ranty:

- `.ranty` is the preferred source extension,
- legacy `.rant` remains supported,
- Node resolution checks the dependant directory, local modules path, then `RANTY_MODULES_PATH`,
- modules are cached per `Ranty` context.

In browsers, `@require` is synchronous and only works through caller-provided virtual modules. No network fetching is performed by the runtime.
