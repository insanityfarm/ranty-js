export interface CliOptions {
  noDebug: boolean;
  noWarn: boolean;
  benchMode: boolean;
  seed: bigint | undefined;
  eval: string | undefined;
  file: string | undefined;
}

export enum LaunchMode {
  Eval = "eval",
  File = "file",
  Stdin = "stdin",
  Repl = "repl"
}

export function parseSeedArg(raw: string): bigint {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/^0x/i, "");

  if (
    digits.length === 0 ||
    digits.length > 16 ||
    !/^[0-9a-f]+$/i.test(digits)
  ) {
    throw new Error(
      `invalid seed '${raw}'; expected 1 to 16 hexadecimal digits with an optional 0x prefix`
    );
  }

  return BigInt(`0x${digits}`);
}

export function selectLaunchMode(
  evalSource: string | undefined,
  file: string | undefined,
  stdinIsTty: boolean
): LaunchMode {
  if (evalSource != null) {
    return LaunchMode.Eval;
  }
  if (file != null) {
    return LaunchMode.File;
  }
  if (!stdinIsTty) {
    return LaunchMode.Stdin;
  }
  return LaunchMode.Repl;
}

export function parseCliArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = {
    noDebug: false,
    noWarn: false,
    benchMode: false,
    seed: undefined,
    eval: undefined,
    file: undefined
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg == null) {
      continue;
    }
    switch (arg) {
      case "-D":
      case "--no-debug":
        options.noDebug = true;
        break;
      case "-W":
      case "--no-warnings":
        options.noWarn = true;
        break;
      case "-b":
      case "--bench-mode":
        options.benchMode = true;
        break;
      case "-s":
      case "--seed":
        index += 1;
        options.seed = parseSeedArg(argv[index] ?? "");
        break;
      case "-e":
      case "--eval":
        index += 1;
        options.eval = argv[index] ?? "";
        break;
      default:
        if (arg.startsWith("-")) {
          throw new Error(`unknown flag: ${arg}`);
        }
        if (options.file == null) {
          options.file = arg;
        }
        break;
    }
  }

  return options;
}
