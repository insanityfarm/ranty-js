# CLI / REPL

The Node entrypoint is designed around the Rust CLI contract:

- `--eval PROGRAM`
- file execution
- piped stdin
- REPL fallback

The intended flags are:

- `-e`, `--eval`
- `-s`, `--seed`
- `-b`, `--bench-mode`
- `-W`, `--no-warnings`
- `-D`, `--no-debug`

The REPL keeps a shared `Ranty` context so top-level definitions can persist across entered lines.
