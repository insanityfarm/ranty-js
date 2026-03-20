import type { Ranty } from "../ranty";
import {
  addBuiltin,
  argAt,
  asInteger,
  asString,
  expectArgCount
} from "./shared";

export function loadStringsStdlib(context: Ranty): void {
  addBuiltin(context, "char", (...args) => {
    expectArgCount("char", args, 1);
    return String.fromCodePoint(Number(asInteger(argAt(args, 0), "char")));
  });

  addBuiltin(context, "lower", (...args) => {
    expectArgCount("lower", args, 1);
    return asString(argAt(args, 0), "lower").toLowerCase();
  });

  addBuiltin(context, "upper", (...args) => {
    expectArgCount("upper", args, 1);
    return asString(argAt(args, 0), "upper").toUpperCase();
  });

  addBuiltin(context, "seg", (...args) => {
    expectArgCount("seg", args, 1);
    return Array.from(asString(argAt(args, 0), "seg"));
  });

  addBuiltin(context, "split", (...args) => {
    expectArgCount("split", args, 2);
    return asString(argAt(args, 0), "split").split(
      asString(argAt(args, 1), "split")
    );
  });

  addBuiltin(context, "lines", (...args) => {
    expectArgCount("lines", args, 1);
    return asString(argAt(args, 0), "lines").split(/\r?\n/);
  });

  addBuiltin(context, "indent", (...args) => {
    expectArgCount("indent", args, 2);
    const value = asString(argAt(args, 0), "indent");
    const indentation = argAt(args, 1);
    const prefix =
      typeof indentation === "bigint" || typeof indentation === "number"
        ? " ".repeat(Number(indentation))
        : asString(indentation, "indent");
    return value
      .split(/\r?\n/)
      .map((line) => `${prefix}${line}`)
      .join("\n");
  });

  addBuiltin(context, "string-replace", (...args) => {
    expectArgCount("string-replace", args, 3);
    return asString(argAt(args, 0), "string-replace").replaceAll(
      asString(argAt(args, 1), "string-replace"),
      asString(argAt(args, 2), "string-replace")
    );
  });

  addBuiltin(context, "trim", (...args) => {
    expectArgCount("trim", args, 1);
    return asString(argAt(args, 0), "trim").trim();
  });

  addBuiltin(context, "ord", (...args) => {
    expectArgCount("ord", args, 1);
    const char = Array.from(asString(argAt(args, 0), "ord"))[0] ?? "";
    return BigInt(char.codePointAt(0) ?? 0);
  });

  addBuiltin(context, "ord-all", (...args) => {
    expectArgCount("ord-all", args, 1);
    return Array.from(asString(argAt(args, 0), "ord-all"), (char) =>
      BigInt(char.codePointAt(0) ?? 0)
    );
  });
}
