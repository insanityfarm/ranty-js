# Tooling And Quality

This boilerplate treats local verification as authoritative. The repository
does not ship a CI workflow by default.

## Local Toolchain

- Node.js `22.x`
- npm `10.x`
- `.nvmrc` pins the expected Node version for contributors using `nvm`

## Source Of Truth And Artifacts

Tracked source files plus `spec/` are the source of truth.

Workflow guides live in `docs/`. Future-facing notes live in `notes.md`.

Structured architecture and drift-prevention source files live under
`spec/subsystems/`, `spec/decisions/`, and `glossary/terms.yaml`.

Generated anti-drift artifacts under `spec/generated/` plus the generated
`glossary/README.md` are derived output.

`notes.md` stays intentionally non-authoritative. It is only for durable
future-facing reminders, open questions, and follow-through ideas that do not
describe current implemented behavior or standing workflow.

These paths are disposable artifacts or dependencies:

- `node_modules/`
- `dist/`
- `coverage/`
- `.agent-context/`

## Root Scripts

Verification:

- `npm run lint`: run ESLint, directive checks, and terminology checks
- `npm run terms:check`: run terminology checks driven by `glossary/terms.yaml`
- `npm run format:check`: check Prettier formatting without writing
- `npm run typecheck`: run strict first-party TypeScript checking
- `npm run test`: run Vitest
- `npm run arch:check`: run architecture-boundary checks
- `npm run context:check`: run active-task and derived-context checks
- `npm run check`: run lint, format check, typecheck, tests, architecture, and context checks
- `npm run verify`: run `check` and then the build

Context workflow:

- `npm run context:build`: regenerate `glossary/README.md` and `spec/generated/` artifacts
- `npm run context:task -- "<task>"`: create the repo-local active task packet under `.agent-context/`
- `npm run drift:review`: assemble the repo-local review packet under `.agent-context/`

## Required Workflow

For functional work, a change is not done until `npm run verify` passes.

The anti-drift workflow is also part of done:

- start work with `npm run context:task -- "<task>"`
- regenerate context artifacts with `npm run context:build` when context source files changed
- keep the active task packet aligned with the changed subsystem surface

If a task includes creating a git commit:

1. inspect recent history first with a non-interactive command such as
   `git log --oneline -n 10`
2. match the current repository commit-message style
3. prefer non-interactive git commands
4. if both `git add` and `git commit` are part of the task, run them
   sequentially instead of in parallel

If a task creates or resolves durable future-facing follow-through, update
`notes.md` in the same change and remove stale entries when they are no longer
useful.

If `glossary/terms.yaml`, `spec/subsystems/`, `spec/decisions/`, or the
context-system scripts change, run `npm run context:build` before the normal
verification flow.

## Testing

Vitest is the automated test runner for the starter project.

The initial suite includes:

- a public API behavior test
- fixture-style tests for the anti-drift context system

Testing rules live in [`./testing-style.md`](./testing-style.md).

## Linting And Formatting

ESLint is configured through `eslint.config.mjs`.

Repository rules enforced by lint and format include:

- `reportUnusedDisableDirectives` is enabled
- backlog-style warning comments such as `TODO`, `FIXME`, `HACK`, and `XXX` are rejected
- lint-disable comments must include a reason introduced by `--`
- Prettier is part of the required workflow

Comment rules live in [`./comment-style.md`](./comment-style.md).
