import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { expect } from "vitest";

import {
  CompilerError,
  DefaultModuleResolver,
  Ranty,
  RuntimeError
} from "../src/index";
import type { CompilerMessage, Reporter } from "../src/core/messages";

export class CollectingReporter implements Reporter {
  readonly messages: CompilerMessage[] = [];

  report(message: CompilerMessage): void {
    this.messages.push(message);
  }
}

export function runSource(source: string, ranty = new Ranty()): string {
  return String(ranty.run(ranty.compileQuiet(source)));
}

export function compileMessages(
  source: string,
  ranty = new Ranty()
): readonly CompilerMessage[] {
  const reporter = new CollectingReporter();
  expect(() => ranty.compile(source, reporter)).toThrow(CompilerError);
  return reporter.messages;
}

export function runtimeError(
  source: string,
  ranty = new Ranty()
): RuntimeError {
  const program = ranty.compileQuiet(source);

  try {
    ranty.run(program);
  } catch (error) {
    expect(error).toBeInstanceOf(RuntimeError);
    return error as RuntimeError;
  }

  throw new Error("expected runtime error");
}

export function tempWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ranty-js-suite-"));
}

export function writeWorkspace(
  root: string,
  files: Record<string, string>
): void {
  for (const [relativePath, source] of Object.entries(files)) {
    const targetPath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, source, "utf8");
  }
}

export function compileAndRunFileResult(
  filePath: string,
  ranty = new Ranty()
):
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly error: string } {
  try {
    return {
      ok: true,
      value: String(ranty.run(ranty.compileFileQuiet(filePath)))
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.toString() : String(error)
    };
  }
}

export function withEnv<T>(
  key: string,
  value: string | undefined,
  fn: () => T
): T {
  const previous = process.env[key];
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }

  try {
    return fn();
  } finally {
    if (previous === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = previous;
    }
  }
}

export function lazyHarness() {
  const ranty = new Ranty();
  let counter = 0;

  ranty.setGlobalConst("next", () => BigInt(++counter));
  ranty.setGlobalConst("next-list", () => {
    counter += 1;
    return [1n, 2n, 3n];
  });
  ranty.setGlobalConst("make-func", () => {
    counter += 1;
    return () => "ok";
  });

  return {
    ranty,
    counter: () => counter
  };
}

export { DefaultModuleResolver };
