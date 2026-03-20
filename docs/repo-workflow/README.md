# Repository Workflow

This guide covers repo-wide contributor workflow that is not specific to one
subsystem. The implemented contract still lives in
[`../../spec/README.md`](../../spec/README.md).

## Git Commits

When a task includes creating a commit:

1. Inspect recent history first with a non-interactive command such as
   `git log --oneline -n 10`.
2. Match the commit message tone, structure, and level of detail used by the
   current repository history.
3. Prefer non-interactive git commands throughout the workflow.
4. If both `git add` and `git commit` are part of the task, run them
   sequentially instead of in parallel so the index lock stays predictable.

Do not treat commit messages as a place to explain implementation details that
belong in spec pages, ADRs, or subsystem records.

## `notes.md`

[`../../notes.md`](../../notes.md) is intentionally non-authoritative. Use it
for durable future-facing material such as:

- buildout ideas
- follow-through reminders
- open design questions that do not describe current implemented behavior

Do not duplicate current behavior, architecture contracts, or recurring
workflow instructions in `notes.md`. Those belong in `spec/` or `docs/`.

When a task creates or resolves durable future-facing follow-through:

1. update `notes.md` if the reminder is still useful after the current task
2. remove entries that are stale, completed, or superseded

If a note becomes part of implemented behavior or a standing workflow, move it
out of `notes.md` and into the authoritative home.
