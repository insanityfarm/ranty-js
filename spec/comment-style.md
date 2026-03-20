# Comment Style

Comments in first-party code and important repository configuration should
explain the parts that are not obvious from the code alone.

## Rules

- Explain non-obvious behavior, invariants, tradeoffs, or intent.
- Prefer complete sentences.
- Keep the tone professional and direct.
- Favor explaining why something is shaped this way over narrating the line of code beneath it.
- Keep comments current. Future-facing ideas belong in [`../notes.md`](../notes.md), not in source comments.

## Good Targets

- boundary assumptions between subsystems
- contract-sensitive implementation choices
- active constraints that would be easy to violate accidentally
- generated artifact behavior and ownership rules

## Avoid

- comments that only restate the code
- backlog comments such as `TODO`, `FIXME`, `HACK`, or `XXX`
- commented-out code kept around as reference
- vague comments about aspirations instead of current behavior
- lint-disable comments without a concrete reason

## Lint Disable Comments

If an ESLint disable is genuinely necessary:

- keep the scope narrow
- include the reason on the same line using `--`
- make the reason specific enough that a later reader can judge whether it is still justified
