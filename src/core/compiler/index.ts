import { CompilerError } from "../errors";
import type { Reporter } from "../messages";
import { RantyProgram, type RantyProgramInfo } from "../program";
import { loadNodeFs } from "../util";
import { lex } from "./lexer";
import { reportCompilerMessage } from "./message";
import { parseTokens } from "./parser";

export function compileString(
  source: string,
  reporter: Reporter,
  _debugEnabled: boolean,
  info: RantyProgramInfo = {}
): RantyProgram {
  const tokens = lex(source, reporter);
  const root = parseTokens(tokens, source, reporter);
  return new RantyProgram(source, info, root);
}

export function compileFile(
  path: string,
  reporter: Reporter,
  debugEnabled: boolean
): RantyProgram {
  const node = loadNodeFs();
  if (!node) {
    const message = `unable to access the filesystem while compiling '${path}'`;
    reportCompilerMessage(
      reporter,
      "FILE_SYSTEM_ERROR",
      message,
      "error",
      0,
      0,
      path
    );
    throw new CompilerError("io", message);
  }

  const sourceName = node.fs.existsSync(path)
    ? node.fs.realpathSync(path)
    : path;

  try {
    const source = node.fs.readFileSync(path, "utf8");
    return compileString(source, reporter, debugEnabled, {
      path: sourceName
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : `unable to read source file '${sourceName}'`;
    reportCompilerMessage(
      reporter,
      node.fs.existsSync(path) ? "FILE_SYSTEM_ERROR" : "FILE_NOT_FOUND",
      message,
      "error",
      0,
      0,
      sourceName
    );
    throw new CompilerError("io", message);
  }
}
