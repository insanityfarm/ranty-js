import type * as NodeFs from "node:fs";
import type * as NodePath from "node:path";

import { getCollectionKind } from "./values";

export function runtimeRequire<T>(id: string): T | null {
  const builtinLoader = (
    globalThis as {
      process?: { getBuiltinModule?: (moduleId: string) => unknown };
    }
  ).process?.getBuiltinModule;

  if (typeof builtinLoader === "function") {
    const builtin = builtinLoader(id.startsWith("node:") ? id.slice(5) : id);
    if (builtin != null) {
      return builtin as T;
    }
  }

  const candidate = Function(
    "return typeof require !== 'undefined' ? require : undefined;"
  )() as ((moduleId: string) => unknown) | undefined;

  if (!candidate) {
    return null;
  }

  return candidate(id) as T;
}

export function loadNodeFs(): {
  readonly fs: typeof NodeFs;
  readonly path: typeof NodePath;
} | null {
  const fs = runtimeRequire<typeof NodeFs>("node:fs");
  const path = runtimeRequire<typeof NodePath>("node:path");

  if (!fs || !path) {
    return null;
  }

  return { fs, path };
}

export function renderRantyValue(value: unknown): string {
  if (value == null) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "@true" : "@false";
  }

  if (typeof value === "function") {
    return "[function(...)]";
  }

  if (Array.isArray(value)) {
    const kind = getCollectionKind(value);
    const rendered = value.map((item) => renderRantyValue(item)).join("; ");
    if (kind === "tuple") {
      if (value.length === 0) {
        return "()";
      }
      if (value.length === 1) {
        return `(${rendered};)`;
      }
      return `(${rendered})`;
    }
    return value.length === 0 ? "(:)" : `(: ${rendered})`;
  }

  if (value instanceof Map) {
    const parts: string[] = [];
    for (const [key, item] of value.entries()) {
      parts.push(`${key} = ${renderRantyValue(item)}`);
    }
    return parts.length > 0 ? `(:: ${parts.join("; ")})` : "(::)";
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string"
  ) {
    switch (value.type) {
      case "attribute":
        return "";
      case "selector":
        return `[selector:${String((value as { mode?: unknown }).mode ?? "")}]`;
      case "range": {
        const range = value as {
          start?: unknown;
          end?: unknown;
          step?: unknown;
        };
        const base = `${String(range.start ?? "")}..${String(range.end ?? "")}`;
        return range.step === undefined
          ? base
          : `${base}:${String(range.step)}`;
      }
      case "temporal":
        return ((value as { values?: unknown[] }).values ?? [])
          .map((item) => renderRantyValue(item))
          .join("");
      default:
        break;
    }
  }

  return String(value);
}
