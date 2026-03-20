import { RuntimeError, RuntimeErrorType } from "../errors";
import type { Ranty } from "../ranty";
import {
  areEqual,
  argAt,
  addBuiltin,
  expectArgCount,
  isTruthy
} from "./shared";
import { renderRantyValue } from "../util";

export function loadAssertionStdlib(context: Ranty): void {
  addBuiltin(context, "assert", (...args) => {
    expectArgCount("assert", args, 1);
    if (!isTruthy(argAt(args, 0))) {
      throw new RuntimeError(
        RuntimeErrorType.AssertError,
        "assertion failed: condition was false"
      );
    }
    return "";
  });

  addBuiltin(context, "assert-not", (...args) => {
    expectArgCount("assert-not", args, 1);
    if (isTruthy(argAt(args, 0))) {
      throw new RuntimeError(
        RuntimeErrorType.AssertError,
        "negative assertion failed"
      );
    }
    return "";
  });

  addBuiltin(context, "assert-eq", (...args) => {
    if (args.length < 2 || args.length > 3) {
      throw new RuntimeError(
        RuntimeErrorType.ArgumentMismatch,
        `'assert-eq' expected 2 or 3 argument(s), got ${args.length}`
      );
    }
    const left = argAt(args, 0);
    const right = argAt(args, 1);
    if (!areEqual(left, right)) {
      const message =
        args.length === 3
          ? renderRantyValue(argAt(args, 2))
          : `expected: ${renderRantyValue(right)}; actual: ${renderRantyValue(left)}`;
      throw new RuntimeError(RuntimeErrorType.AssertError, message);
    }
    return "";
  });

  addBuiltin(context, "assert-neq", (...args) => {
    if (args.length < 2 || args.length > 3) {
      throw new RuntimeError(
        RuntimeErrorType.ArgumentMismatch,
        `'assert-neq' expected 2 or 3 argument(s), got ${args.length}`
      );
    }
    if (areEqual(argAt(args, 0), argAt(args, 1))) {
      throw new RuntimeError(
        RuntimeErrorType.AssertError,
        args.length === 3
          ? renderRantyValue(argAt(args, 2))
          : "expected values to differ"
      );
    }
    return "";
  });
}
