import type { Ranty } from "../ranty";
import {
  addBuiltin,
  areEqual,
  argAt,
  asNumber,
  expectArgCount
} from "./shared";

export function loadCompareStdlib(context: Ranty): void {
  addBuiltin(context, "eq", (...args) => {
    expectArgCount("eq", args, 2);
    return areEqual(argAt(args, 0), argAt(args, 1));
  });

  addBuiltin(context, "neq", (...args) => {
    expectArgCount("neq", args, 2);
    return !areEqual(argAt(args, 0), argAt(args, 1));
  });

  addBuiltin(context, "gt", (...args) => {
    expectArgCount("gt", args, 2);
    return asNumber(argAt(args, 0), "gt") > asNumber(argAt(args, 1), "gt");
  });

  addBuiltin(context, "lt", (...args) => {
    expectArgCount("lt", args, 2);
    return asNumber(argAt(args, 0), "lt") < asNumber(argAt(args, 1), "lt");
  });

  addBuiltin(context, "ge", (...args) => {
    expectArgCount("ge", args, 2);
    return asNumber(argAt(args, 0), "ge") >= asNumber(argAt(args, 1), "ge");
  });

  addBuiltin(context, "le", (...args) => {
    expectArgCount("le", args, 2);
    return asNumber(argAt(args, 0), "le") <= asNumber(argAt(args, 1), "le");
  });
}
