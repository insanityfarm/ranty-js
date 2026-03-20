import type { Ranty } from "../ranty";
import { addBuiltin, argAt, expectArgCount, isTruthy } from "./shared";

export function loadBooleanStdlib(context: Ranty): void {
  addBuiltin(context, "and", (...args) => {
    expectArgCount("and", args, 2);
    const left = argAt(args, 0);
    return isTruthy(left) ? argAt(args, 1) : left;
  });

  addBuiltin(context, "not", (...args) => {
    expectArgCount("not", args, 1);
    return !isTruthy(argAt(args, 0));
  });

  addBuiltin(context, "or", (...args) => {
    expectArgCount("or", args, 2);
    const left = argAt(args, 0);
    return isTruthy(left) ? left : argAt(args, 1);
  });

  addBuiltin(context, "xor", (...args) => {
    expectArgCount("xor", args, 2);
    return isTruthy(argAt(args, 0)) !== isTruthy(argAt(args, 1));
  });
}
