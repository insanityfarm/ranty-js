import { RuntimeError, RuntimeErrorType } from "../errors";
import type { Ranty } from "../ranty";
import type { RantyAttributeValue, RantySelectorValue } from "../values";
import {
  addBuiltin,
  argAt,
  asInteger,
  asString,
  expectArgCount
} from "./shared";

function attribute(
  name: RantyAttributeValue["name"],
  value: RantyAttributeValue["value"]
): RantyAttributeValue {
  return {
    type: "attribute",
    name,
    value
  };
}

function isSelectorValue(value: unknown): value is RantySelectorValue {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "selector"
  );
}

export function loadBlockStdlib(context: Ranty): void {
  addBuiltin(context, "mksel", (...args) => {
    if (args.length < 1 || args.length > 2) {
      throw new RuntimeError(
        RuntimeErrorType.ArgumentMismatch,
        `'mksel' expected 1 or 2 argument(s), got ${args.length}`
      );
    }
    const mode = asString(argAt(args, 0), "mksel");
    if (!["forward", "reverse", "ping", "pong", "match"].includes(mode)) {
      throw new RuntimeError(
        RuntimeErrorType.ValueError,
        `unsupported selector mode '${mode}'`
      );
    }

    if (mode === "match" && args.length !== 2) {
      throw new RuntimeError(
        RuntimeErrorType.ArgumentError,
        "match selectors require a match value"
      );
    }

    if (mode !== "match" && args.length === 2) {
      throw new RuntimeError(
        RuntimeErrorType.ArgumentError,
        `selector mode '${mode}' does not accept a match value`
      );
    }

    const selector: RantySelectorValue = {
      type: "selector",
      mode,
      index: 0,
      direction: 1,
      frozen: false,
      initialized: false,
      ...(args.length === 2 ? { matchValue: argAt(args, 1) } : {})
    };
    return selector;
  });

  addBuiltin(context, "rep", (...args) => {
    expectArgCount("rep", args, 1);
    return attribute("rep", argAt(args, 0));
  });

  addBuiltin(context, "sep", (...args) => {
    expectArgCount("sep", args, 1);
    return attribute("sep", argAt(args, 0));
  });

  addBuiltin(context, "sel", (...args) => {
    expectArgCount("sel", args, 1);
    return attribute("sel", argAt(args, 0));
  });

  addBuiltin(context, "if", (...args) => {
    expectArgCount("if", args, 1);
    return attribute("if", argAt(args, 0));
  });

  addBuiltin(context, "elseif", (...args) => {
    expectArgCount("elseif", args, 1);
    return attribute("elseif", argAt(args, 0));
  });

  addBuiltin(context, "else", (...args) => {
    expectArgCount("else", args, 0);
    return attribute("else", true);
  });

  addBuiltin(context, "match", (...args) => {
    expectArgCount("match", args, 1);
    return attribute("sel", {
      type: "selector",
      mode: "match",
      index: 0,
      direction: 1,
      frozen: false,
      initialized: false,
      matchValue: argAt(args, 0)
    });
  });

  addBuiltin(context, "sel-freeze", (...args) => {
    expectArgCount("sel-freeze", args, 1);
    const selector = argAt(args, 0);
    if (isSelectorValue(selector)) {
      if (selector.mode === "match") {
        throw new RuntimeError(
          RuntimeErrorType.SelectorError,
          "cursor operations are not supported on match selectors"
        );
      }
      selector.frozen = true;
      return "";
    }
    throw new RuntimeError(
      RuntimeErrorType.TypeError,
      "'sel-freeze' expected a selector"
    );
  });

  addBuiltin(context, "sel-frozen", (...args) => {
    expectArgCount("sel-frozen", args, 1);
    const selector = argAt(args, 0);
    if (isSelectorValue(selector)) {
      if (selector.mode === "match") {
        throw new RuntimeError(
          RuntimeErrorType.SelectorError,
          "cursor operations are not supported on match selectors"
        );
      }
      return selector.frozen;
    }
    throw new RuntimeError(
      RuntimeErrorType.TypeError,
      "'sel-frozen' expected a selector"
    );
  });

  addBuiltin(context, "sel-skip", (...args) => {
    if (args.length < 1 || args.length > 2) {
      throw new RuntimeError(
        RuntimeErrorType.ArgumentMismatch,
        `'sel-skip' expected 1 or 2 argument(s), got ${args.length}`
      );
    }

    const selector = argAt(args, 0);
    if (!isSelectorValue(selector)) {
      throw new RuntimeError(
        RuntimeErrorType.TypeError,
        "'sel-skip' expected a selector"
      );
    }
    if (selector.mode === "match") {
      throw new RuntimeError(
        RuntimeErrorType.SelectorError,
        "cursor operations are not supported on match selectors"
      );
    }

    const steps = Number(
      args.length === 2 ? asInteger(argAt(args, 1), "sel-skip") : 1n
    );
    if (!Number.isFinite(steps) || steps <= 0) {
      return "";
    }

    for (let offset = 0; offset < steps; offset += 1) {
      if (!selector.initialized) {
        selector.initialized = true;
        selector.index =
          selector.mode === "reverse" || selector.mode === "pong" ? 0 : 0;
        selector.direction =
          selector.mode === "reverse" || selector.mode === "pong" ? -1 : 1;
      }

      switch (selector.mode) {
        case "reverse":
          selector.index -= 1;
          break;
        case "ping":
        case "pong":
          selector.index += selector.direction;
          break;
        case "forward":
        default:
          selector.index += 1;
          break;
      }
    }

    return "";
  });

  addBuiltin(context, "mut", (...args) => {
    if (args.length > 1) {
      throw new RuntimeError(
        RuntimeErrorType.ArgumentMismatch,
        `'mut' expected at most 1 argument(s), got ${args.length}`
      );
    }
    return attribute("mut", args[0] ?? null);
  });

  addBuiltin(context, "step", (...args) => {
    expectArgCount("step", args, 0);
    const value = context.getGlobal("__ranty_step");
    return typeof value === "bigint" ? value + 1n : 0n;
  });

  addBuiltin(context, "step-index", (...args) => {
    expectArgCount("step-index", args, 0);
    const value = context.getGlobal("__ranty_step");
    return typeof value === "bigint" ? value : 0n;
  });

  addBuiltin(context, "step-count", (...args) => {
    expectArgCount("step-count", args, 0);
    const value = context.getGlobal("__ranty_total");
    return typeof value === "bigint" ? value : 0n;
  });

  addBuiltin(context, "reset-attrs", () => attribute("reset", ""));
}
