import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ANSI_ESCAPE_PATTERN = new RegExp(String.raw`\u001B\[[0-9;]*m`, "g");

export const repoRoot = path.resolve(__dirname, "..");
export const upstreamRoot = path.join(repoRoot, "upstream", "ranty");
export const sourcesRoot = path.join(upstreamRoot, "tests", "sources");
export const corpusRoot = path.join(upstreamRoot, "tests", "corpus");
export const jsCli = path.join(repoRoot, "dist", "ranty.js");

export interface FixtureCase {
  readonly file: string;
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface FixtureCorpus {
  readonly cases: readonly FixtureCase[];
}

export interface CliLeg {
  readonly args: readonly string[];
  readonly stdin: string | null;
  readonly expectedStatus: number;
  readonly stderrIncludes: readonly string[];
  readonly stderrExcludes: readonly string[];
}

export interface SimpleCliCase {
  readonly name: string;
  readonly kind: "simple" | "workspace";
  readonly args: readonly string[];
  readonly stdin: string | null;
  readonly expectedStatus: number;
  readonly expectedStdout: string | null;
  readonly stdoutIncludes: readonly string[];
  readonly stderrIncludes: readonly string[];
  readonly stderrExcludes: readonly string[];
  readonly files?: Readonly<Record<string, string>>;
}

export interface PairedCliCase {
  readonly name: string;
  readonly kind: "paired-simple";
  readonly first: CliLeg;
  readonly second: CliLeg;
}

export type CliCase = SimpleCliCase | PairedCliCase;

export interface CliCorpus {
  readonly cases: readonly CliCase[];
}

export interface FuzzCase {
  readonly label: string;
  readonly kind: string;
  readonly source: string;
  readonly seed: string | null;
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface FuzzCorpus {
  readonly cases: readonly FuzzCase[];
}

export interface CliRunResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface UpstreamContractComponent {
  readonly id: string;
  readonly signature: string;
}

export interface UpstreamContract {
  readonly source_commit: string;
  readonly stdlib_symbols: readonly string[];
  readonly components: readonly UpstreamContractComponent[];
}

export function loadFixtureCorpus(): FixtureCorpus {
  return loadJson(path.join(corpusRoot, "fixtures.json"));
}

export function loadCliCorpus(): CliCorpus {
  return loadJson(path.join(corpusRoot, "cli.json"));
}

export function loadFuzzCorpus(): FuzzCorpus {
  return loadJson(path.join(corpusRoot, "fuzz.json"));
}

export function loadUpstreamContract(): UpstreamContract {
  return loadJson(path.join(upstreamRoot, "contract.json"));
}

export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

export function normalizeStdout(text: string): string {
  return normalizeNewlines(text).replace(
    /\[function\(0x[0-9a-fA-F]+\)\]/g,
    "[function(...)]"
  );
}

export function stripAnsi(text: string): string {
  return text.replace(ANSI_ESCAPE_PATTERN, "");
}

export function relevantStderr(text: string, status: number): string {
  const normalized = stripAnsi(normalizeNewlines(text));
  const clean = normalized.trim();
  if (clean.length === 0) {
    return "";
  }

  if (status === 0) {
    return clean
      .split("\n")
      .filter((line) => {
        const trimmed = line.trim();
        return (
          trimmed.length > 0 &&
          !trimmed.startsWith("warning[") &&
          !trimmed.startsWith("-->") &&
          !trimmed.startsWith("|") &&
          !/^\d+\s+\|/.test(trimmed)
        );
      })
      .join("\n")
      .trim();
  }

  const runtimeMatch = normalized.match(/Runtime error:[^\n]*/u);
  if (runtimeMatch?.[0]) {
    return runtimeMatch[0];
  }

  const firstDiagnostic = normalized
    .split("\n")
    .map((line) => line.trim())
    .find((line) => /^error(?:\[[^\]]+\])?:/u.test(line));
  if (firstDiagnostic) {
    return firstDiagnostic.replace(/^error(?:\[[^\]]+\])?:\s*/u, "");
  }

  const compileMatch = normalized.match(/Compile failed[^\n]*/gu);
  if (compileMatch?.length) {
    const summary = compileMatch.at(-1) ?? "";
    return summary.replace(/^Compile failed:\s*/u, "");
  }

  return normalized.split("\n").find((line) => line.trim().length > 0) ?? "";
}

export function runJsCli(
  args: readonly string[],
  stdin?: string | null,
  cwd = repoRoot
): CliRunResult {
  const output = spawnSync("node", [jsCli, ...args], {
    cwd,
    encoding: "utf8",
    input: stdin ?? undefined
  });

  return {
    status: output.status ?? 1,
    stdout: normalizeStdout(output.stdout ?? ""),
    stderr: stripAnsi(normalizeNewlines(output.stderr ?? ""))
  };
}

export async function runJsCliAsync(
  args: readonly string[],
  stdin?: string | null,
  cwd = repoRoot
): Promise<CliRunResult> {
  return await new Promise<CliRunResult>((resolve, reject) => {
    const child = spawn("node", [jsCli, ...args], {
      cwd,
      stdio: "pipe"
    });

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        status: code ?? 1,
        stdout: normalizeStdout(stdout),
        stderr: stripAnsi(normalizeNewlines(stderr))
      });
    });

    if (stdin !== null && stdin !== undefined) {
      child.stdin.write(stdin);
    }
    child.stdin.end();
  });
}

export function tempWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ranty-js-corpus-"));
}

export function writeWorkspace(
  root: string,
  files: Readonly<Record<string, string>>
): void {
  for (const [relativePath, source] of Object.entries(files)) {
    const targetPath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, source, "utf8");
  }
}

export function replaceWorkspaceTokens(
  args: readonly string[],
  workspace: string
): string[] {
  return args.map((arg) => arg.replaceAll("$WORKSPACE", workspace));
}

export function discoverExecutableFixtures(): string[] {
  const fixtureFiles: string[] = [];
  const stack = [sourcesRoot];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    for (const name of fs.readdirSync(current)) {
      if (name === "tutorial") {
        continue;
      }
      const fullPath = path.join(current, name);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (name.endsWith(".ranty")) {
        fixtureFiles.push(
          path.relative(repoRoot, fullPath).replaceAll(path.sep, "/")
        );
      }
    }
  }

  return fixtureFiles.sort();
}

function loadJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}
