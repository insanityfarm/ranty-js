import type { Ranty } from "../ranty";
import {
  addBuiltin,
  argAt,
  asNumber,
  expectArgCount,
  numericExtrema
} from "./shared";

export function loadMathStdlib(context: Ranty): void {
  addBuiltin(context, "abs", (...args) => {
    expectArgCount("abs", args, 1);
    const value = argAt(args, 0);
    return typeof value === "bigint"
      ? value < 0n
        ? -value
        : value
      : Math.abs(asNumber(value, "abs"));
  });

  addBuiltin(context, "add", (...args) => {
    expectArgCount("add", args, 2);
    const left = argAt(args, 0);
    const right = argAt(args, 1);
    if (typeof left === "bigint" && typeof right === "bigint") {
      return left + right;
    }
    return asNumber(left, "add") + asNumber(right, "add");
  });

  addBuiltin(context, "sub", (...args) => {
    expectArgCount("sub", args, 2);
    const left = argAt(args, 0);
    const right = argAt(args, 1);
    if (typeof left === "bigint" && typeof right === "bigint") {
      return left - right;
    }
    return asNumber(left, "sub") - asNumber(right, "sub");
  });

  addBuiltin(context, "mul", (...args) => {
    expectArgCount("mul", args, 2);
    const left = argAt(args, 0);
    const right = argAt(args, 1);
    if (typeof left === "bigint" && typeof right === "bigint") {
      return left * right;
    }
    return asNumber(left, "mul") * asNumber(right, "mul");
  });

  addBuiltin(context, "div", (...args) => {
    expectArgCount("div", args, 2);
    return asNumber(argAt(args, 0), "div") / asNumber(argAt(args, 1), "div");
  });

  addBuiltin(context, "mul-add", (...args) => {
    expectArgCount("mul-add", args, 3);
    return (
      asNumber(argAt(args, 0), "mul-add") *
        asNumber(argAt(args, 1), "mul-add") +
      asNumber(argAt(args, 2), "mul-add")
    );
  });

  addBuiltin(context, "mod", (...args) => {
    expectArgCount("mod", args, 2);
    const left = argAt(args, 0);
    const right = argAt(args, 1);
    if (typeof left === "bigint" && typeof right === "bigint") {
      return left % right;
    }
    return asNumber(left, "mod") % asNumber(right, "mod");
  });

  addBuiltin(context, "neg", (...args) => {
    expectArgCount("neg", args, 1);
    const value = argAt(args, 0);
    return typeof value === "bigint" ? -value : -asNumber(value, "neg");
  });

  addBuiltin(context, "pow", (...args) => {
    expectArgCount("pow", args, 2);
    const left = argAt(args, 0);
    const right = argAt(args, 1);
    if (typeof left === "bigint" && typeof right === "bigint" && right >= 0n) {
      return left ** right;
    }
    return asNumber(left, "pow") ** asNumber(right, "pow");
  });

  addBuiltin(context, "recip", (...args) => {
    expectArgCount("recip", args, 1);
    return 1 / asNumber(argAt(args, 0), "recip");
  });

  addBuiltin(context, "clamp", (...args) => {
    expectArgCount("clamp", args, 3);
    const value = asNumber(argAt(args, 0), "clamp");
    const min = asNumber(argAt(args, 1), "clamp");
    const max = asNumber(argAt(args, 2), "clamp");
    return Math.min(max, Math.max(min, value));
  });

  addBuiltin(context, "min", (...args) => numericExtrema(args, "min", "min"));
  addBuiltin(context, "max", (...args) => numericExtrema(args, "max", "max"));

  addBuiltin(context, "floor", (...args) => {
    expectArgCount("floor", args, 1);
    return Math.floor(asNumber(argAt(args, 0), "floor"));
  });

  addBuiltin(context, "ceil", (...args) => {
    expectArgCount("ceil", args, 1);
    return Math.ceil(asNumber(argAt(args, 0), "ceil"));
  });

  addBuiltin(context, "frac", (...args) => {
    expectArgCount("frac", args, 1);
    const value = asNumber(argAt(args, 0), "frac");
    return value - Math.trunc(value);
  });

  addBuiltin(context, "asin", (...args) => {
    expectArgCount("asin", args, 1);
    return Math.asin(asNumber(argAt(args, 0), "asin"));
  });
  addBuiltin(context, "sin", (...args) => {
    expectArgCount("sin", args, 1);
    return Math.sin(asNumber(argAt(args, 0), "sin"));
  });
  addBuiltin(context, "acos", (...args) => {
    expectArgCount("acos", args, 1);
    return Math.acos(asNumber(argAt(args, 0), "acos"));
  });
  addBuiltin(context, "cos", (...args) => {
    expectArgCount("cos", args, 1);
    return Math.cos(asNumber(argAt(args, 0), "cos"));
  });
  addBuiltin(context, "atan", (...args) => {
    expectArgCount("atan", args, 1);
    return Math.atan(asNumber(argAt(args, 0), "atan"));
  });
  addBuiltin(context, "atan2", (...args) => {
    expectArgCount("atan2", args, 2);
    return Math.atan2(
      asNumber(argAt(args, 0), "atan2"),
      asNumber(argAt(args, 1), "atan2")
    );
  });
  addBuiltin(context, "tan", (...args) => {
    expectArgCount("tan", args, 1);
    return Math.tan(asNumber(argAt(args, 0), "tan"));
  });
  addBuiltin(context, "sqrt", (...args) => {
    expectArgCount("sqrt", args, 1);
    return Math.sqrt(asNumber(argAt(args, 0), "sqrt"));
  });
}
