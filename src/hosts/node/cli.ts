import { compileFile as compileProgramFile } from "../../core/compiler";
import { BUILD_VERSION } from "../../core/constants";
import { CompilerError, RuntimeError } from "../../core/errors";
import type { CompilerMessage, Reporter } from "../../core/messages";
import { Ranty } from "../../core/ranty";
import type { RantyProgram } from "../../core/program";
import { loadNodeFs, renderRantyValue, runtimeRequire } from "../../core/util";
import { LaunchMode, parseCliArgs, selectLaunchMode } from "./cli-utils";
import type * as ReadlinePromises from "node:readline/promises";

const CREDITS_TEXT = `Ranty.js is a TypeScript port of the Ranty language runtime.`;
const COPYRIGHT_TEXT = `Ranty.js derives from the Ranty project licensed under MIT.`;

class CliReporter implements Reporter {
  readonly messages: CompilerMessage[] = [];

  report(message: CompilerMessage): void {
    this.messages.push(message);
  }
}

export async function runCli(argv: readonly string[]): Promise<number> {
  if (argv.includes("-h") || argv.includes("--help")) {
    writeHelp();
    return 0;
  }

  if (argv.includes("-V") || argv.includes("--version")) {
    console.log(BUILD_VERSION);
    return 0;
  }

  let options;
  try {
    options = parseCliArgs(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 64;
  }

  const stdinIsTty = process.stdin.isTTY ?? false;
  const mode = selectLaunchMode(options.eval, options.file, stdinIsTty);
  const ranty = new Ranty({
    debugMode: !options.noDebug,
    seed:
      options.seed ??
      BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER))
  });

  registerCliGlobals(ranty);

  const startedAt = process.hrtime.bigint();
  try {
    switch (mode) {
      case LaunchMode.Eval:
        return executeCompiledProgram(
          ranty,
          compileNamedForCli(
            ranty,
            options.eval ?? "",
            "cmdline",
            options.noWarn
          ),
          options.benchMode,
          startedAt
        );
      case LaunchMode.File:
        return executeFile(
          ranty,
          options.file ?? "",
          options.noWarn,
          options.benchMode,
          startedAt
        );
      case LaunchMode.Stdin: {
        const source = await readAllFromStdin();
        return executeCompiledProgram(
          ranty,
          compileNamedForCli(ranty, source, "stdin", options.noWarn),
          options.benchMode,
          startedAt
        );
      }
      case LaunchMode.Repl:
        return launchRepl(ranty);
    }
  } catch (error) {
    if (error instanceof RuntimeError) {
      console.error(`Runtime error: ${error.message}`);
      return 70;
    }
    if (error instanceof CompilerError) {
      console.error(`Compile failed: ${error.message}`);
      return 65;
    }
    console.error(error instanceof Error ? error.message : String(error));
    return 70;
  }
}

function registerCliGlobals(ranty: Ranty): void {
  ranty.setGlobalConst("credits", () => CREDITS_TEXT);
  ranty.setGlobalConst("copyright", () => COPYRIGHT_TEXT);
}

function compileNamedForCli(
  ranty: Ranty,
  source: string,
  name: string,
  noWarn: boolean
): RantyProgram {
  const reporter = new CliReporter();
  const program = ranty.compileNamed(source, reporter, name);
  writeWarnings(reporter, noWarn);
  return program;
}

function compileFileForCli(
  ranty: Ranty,
  filePath: string,
  noWarn: boolean
): RantyProgram {
  const reporter = new CliReporter();
  const program = compileProgramFile(
    filePath,
    reporter,
    ranty.options().debugMode
  );
  writeWarnings(reporter, noWarn);
  return program;
}

function writeWarnings(reporter: CliReporter, noWarn: boolean): void {
  if (noWarn) {
    return;
  }

  for (const message of reporter.messages) {
    if (!message.isWarning()) {
      continue;
    }
    console.error(`warning[${message.code}]: ${message.message}`);
  }
}

function executeCompiledProgram(
  ranty: Ranty,
  program: ReturnType<Ranty["compileQuietNamed"]>,
  benchMode: boolean,
  startedAt: bigint
): number {
  const runStartedAt = process.hrtime.bigint();
  const output = ranty.run(program);
  if (output != null && output !== "") {
    console.log(renderRantyValue(output));
  }
  if (benchMode) {
    const compileElapsed = Number(runStartedAt - startedAt) / 1_000_000;
    const runElapsed =
      Number(process.hrtime.bigint() - runStartedAt) / 1_000_000;
    console.error(`Compiled in ${compileElapsed.toFixed(3)}ms`);
    console.error(`Executed in ${runElapsed.toFixed(3)}ms`);
  }
  return 0;
}

function executeFile(
  ranty: Ranty,
  filePath: string,
  noWarn: boolean,
  benchMode: boolean,
  startedAt: bigint
): number {
  const node = loadNodeFs();
  if (!node) {
    throw new Error("filesystem access is unavailable in this environment");
  }

  if (!node.fs.existsSync(filePath)) {
    console.error(`file not found: ${filePath}`);
    return 66;
  }

  const program = compileFileForCli(ranty, filePath, noWarn);
  return executeCompiledProgram(ranty, program, benchMode, startedAt);
}

async function readAllFromStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function launchRepl(ranty: Ranty): Promise<number> {
  console.log(`Ranty ${BUILD_VERSION}`);
  console.log("Write an expression and press Enter to run it.");
  console.log("More info: [credits], [copyright]\n");

  const readline = loadNodeReadline();
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    while (true) {
      const line = await rl.question(">> ");
      try {
        executeCompiledProgram(
          ranty,
          compileNamedForCli(ranty, line, "stdin", false),
          false,
          process.hrtime.bigint()
        );
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
      }
    }
  } finally {
    rl.close();
  }
}

function loadNodeReadline(): typeof ReadlinePromises {
  const readline = runtimeRequire<typeof ReadlinePromises>(
    "node:readline/promises"
  );
  if (!readline) {
    throw new Error("Node readline is unavailable in this environment");
  }
  return readline;
}

function writeHelp(): void {
  console.log(`Command-line interface for Ranty ${BUILD_VERSION}

Usage:
  ranty-js [options] [file]

Options:
  -e, --eval PROGRAM        Runs an inline program string
  -s, --seed SEED           Sets the initial RNG seed as 1 to 16 hexadecimal digits
  -b, --bench-mode          Prints compile and execution timing
  -W, --no-warnings         Suppresses compiler warnings
  -D, --no-debug            Disables debug symbol emission during compilation
  -h, --help                Show this help
  -V, --version             Show version
`);
}
