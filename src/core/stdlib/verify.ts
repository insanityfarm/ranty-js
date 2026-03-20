import type { Ranty } from "../ranty";
import type { RantyValue } from "../values";
import {
  addBuiltin,
  areEqual,
  argAt,
  asInteger,
  asNumber,
  expectArgCount
} from "./shared";

function typeName(value: RantyValue): string {
  if (value == null) {
    return "nothing";
  }
  if (typeof value === "string") {
    return "string";
  }
  if (typeof value === "bigint") {
    return "int";
  }
  if (typeof value === "number") {
    return "float";
  }
  if (typeof value === "boolean") {
    return "bool";
  }
  return "value";
}

export function loadVerifyStdlib(context: Ranty): void {
  addBuiltin(context, "is-string", (...args) => {
    expectArgCount("is-string", args, 1);
    return typeof argAt(args, 0) === "string";
  });
  addBuiltin(context, "is-int", (...args) => {
    expectArgCount("is-int", args, 1);
    return typeof argAt(args, 0) === "bigint";
  });
  addBuiltin(context, "is-float", (...args) => {
    expectArgCount("is-float", args, 1);
    return typeof argAt(args, 0) === "number";
  });
  addBuiltin(context, "is-number", (...args) => {
    expectArgCount("is-number", args, 1);
    const value = argAt(args, 0);
    return typeof value === "bigint" || typeof value === "number";
  });
  addBuiltin(context, "is-bool", (...args) => {
    expectArgCount("is-bool", args, 1);
    return typeof argAt(args, 0) === "boolean";
  });
  addBuiltin(context, "is-nothing", (...args) => {
    expectArgCount("is-nothing", args, 1);
    return argAt(args, 0) == null;
  });
  addBuiltin(context, "is-nan", (...args) => {
    expectArgCount("is-nan", args, 1);
    const value = argAt(args, 0);
    return typeof value === "number" && Number.isNaN(value);
  });
  addBuiltin(context, "is-odd", (...args) => {
    expectArgCount("is-odd", args, 1);
    return asInteger(argAt(args, 0), "is-odd") % 2n !== 0n;
  });
  addBuiltin(context, "is-even", (...args) => {
    expectArgCount("is-even", args, 1);
    return asInteger(argAt(args, 0), "is-even") % 2n === 0n;
  });
  addBuiltin(context, "is-factor", (...args) => {
    expectArgCount("is-factor", args, 2);
    const factor = asInteger(argAt(args, 0), "is-factor");
    const value = asInteger(argAt(args, 1), "is-factor");
    return factor !== 0n && value % factor === 0n;
  });
  addBuiltin(context, "is-between", (...args) => {
    expectArgCount("is-between", args, 3);
    const value = asNumber(argAt(args, 0), "is-between");
    const min = asNumber(argAt(args, 1), "is-between");
    const max = asNumber(argAt(args, 2), "is-between");
    return value >= min && value <= max;
  });
  addBuiltin(context, "is-some", (...args) => {
    expectArgCount("is-some", args, 1);
    return argAt(args, 0) != null;
  });
  addBuiltin(context, "is", (...args) => {
    expectArgCount("is", args, 2);
    const value = argAt(args, 0);
    const name = argAt(args, 1);
    if (typeof name === "string") {
      return typeName(value) === name;
    }
    return areEqual(value, name);
  });
}
