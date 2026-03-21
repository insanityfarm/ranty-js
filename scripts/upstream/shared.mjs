import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const UPSTREAM_REPO_URL = "https://github.com/insanityfarm/ranty";
export const UPSTREAM_API_BASE =
  "https://api.github.com/repos/insanityfarm/ranty";
export const UPSTREAM_RAW_BASE =
  "https://raw.githubusercontent.com/insanityfarm/ranty";
export const SOURCE_PARITY_ROOT = "parity/ranty-js";
export const VENDORED_UPSTREAM_ROOT = "upstream/ranty";

export const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
export const vendoredUpstreamRoot = path.join(repoRoot, VENDORED_UPSTREAM_ROOT);

export function parseArgs(argv) {
  const flags = new Map();
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) {
      positionals.push(argument);
      continue;
    }

    const [rawKey, rawValue] = argument.slice(2).split("=");
    if (rawValue !== undefined) {
      flags.set(rawKey, rawValue);
      continue;
    }

    const nextArgument = argv[index + 1];
    if (nextArgument && !nextArgument.startsWith("--")) {
      flags.set(rawKey, nextArgument);
      index += 1;
      continue;
    }

    flags.set(rawKey, "true");
  }

  return { flags, positionals };
}

export function normalizePath(value) {
  return value.split(path.sep).join("/");
}

export function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function walkFiles(root, relativePath, files) {
  const absolutePath = path.join(root, relativePath);
  const entries = fs.readdirSync(absolutePath, { withFileTypes: true });

  for (const entry of entries) {
    const entryRelativePath = normalizePath(
      path.join(relativePath, entry.name)
    );
    if (entry.isDirectory()) {
      walkFiles(root, entryRelativePath, files);
      continue;
    }

    files.push(entryRelativePath);
  }
}

function loadLocalBundleFiles(sourceRepo) {
  const sourceRoot = path.resolve(sourceRepo, SOURCE_PARITY_ROOT);
  if (!fs.existsSync(sourceRoot)) {
    throw new Error(
      `Expected Rust parity bundle at ${sourceRoot}, but it does not exist.`
    );
  }

  const relativePaths = [];
  walkFiles(sourceRoot, ".", relativePaths);

  const files = new Map();
  for (const relativePath of relativePaths) {
    const normalizedRelativePath = normalizePath(relativePath).replace(
      /^\.\//u,
      ""
    );
    const absolutePath = path.join(sourceRoot, normalizedRelativePath);
    files.set(normalizedRelativePath, fs.readFileSync(absolutePath, "utf8"));
  }

  return files;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "ranty-js-upstream-sync"
    }
  });

  if (!response.ok) {
    throw new Error(`Request failed for ${url}: ${response.status}`);
  }

  return await response.json();
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "text/plain",
      "User-Agent": "ranty-js-upstream-sync"
    }
  });

  if (!response.ok) {
    throw new Error(`Request failed for ${url}: ${response.status}`);
  }

  return await response.text();
}

export async function resolveUpstreamRef(ref) {
  if (ref) {
    return ref;
  }

  const repo = await fetchJson(UPSTREAM_API_BASE);
  if (
    typeof repo.default_branch !== "string" ||
    repo.default_branch.trim().length === 0
  ) {
    throw new Error(
      `Could not determine the default branch for ${UPSTREAM_REPO_URL}.`
    );
  }

  return repo.default_branch;
}

async function resolveRemoteCommit(ref) {
  const requestedRef = await resolveUpstreamRef(ref);
  const commit = await fetchJson(
    `${UPSTREAM_API_BASE}/commits/${encodeURIComponent(requestedRef)}`
  );

  if (typeof commit.sha !== "string" || commit.sha.length === 0) {
    throw new Error(
      `Could not resolve upstream ref ${requestedRef} to a commit SHA.`
    );
  }

  return {
    requestedRef,
    sourceCommit: commit.sha
  };
}

async function loadRemoteBundleFiles(ref) {
  const { requestedRef, sourceCommit } = await resolveRemoteCommit(ref);
  const tree = await fetchJson(
    `${UPSTREAM_API_BASE}/git/trees/${sourceCommit}?recursive=1`
  );

  const parityEntries = (tree.tree ?? [])
    .filter(
      (entry) =>
        entry?.type === "blob" &&
        typeof entry.path === "string" &&
        entry.path.startsWith(`${SOURCE_PARITY_ROOT}/`)
    )
    .sort((left, right) => left.path.localeCompare(right.path));

  if (parityEntries.length === 0) {
    throw new Error(
      `No files were found under ${SOURCE_PARITY_ROOT} for upstream ref ${ref}.`
    );
  }

  const files = new Map();
  for (const entry of parityEntries) {
    const relativePath = entry.path.slice(SOURCE_PARITY_ROOT.length + 1);
    const rawUrl = `${UPSTREAM_RAW_BASE}/${sourceCommit}/${entry.path}`;
    files.set(relativePath, await fetchText(rawUrl));
  }

  return {
    requestedRef,
    sourceCommit,
    files
  };
}

export async function loadUpstreamBundle({ sourceRepo, ref }) {
  if (sourceRepo) {
    const files = loadLocalBundleFiles(sourceRepo);
    const contractText = files.get("contract.json");
    if (!contractText) {
      throw new Error("The local Rust parity bundle is missing contract.json.");
    }

    const contract = JSON.parse(contractText);
    return {
      requestedRef: ref ?? contract.source_commit,
      sourceCommit: contract.source_commit,
      files
    };
  }

  return await loadRemoteBundleFiles(ref);
}

function rewriteUpstreamReferences(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => rewriteUpstreamReferences(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        rewriteUpstreamReferences(entry)
      ])
    );
  }

  if (typeof value === "string") {
    return value.replaceAll("tests/sources/", "upstream/ranty/tests/sources/");
  }

  return value;
}

export function normalizeBundleFiles(files) {
  const normalizedFiles = new Map();

  for (const [relativePath, contents] of files.entries()) {
    if (path.posix.matchesGlob(relativePath, "tests/corpus/*.json")) {
      const parsed = JSON.parse(contents);
      normalizedFiles.set(
        relativePath,
        `${JSON.stringify(rewriteUpstreamReferences(parsed), null, 2)}\n`
      );
      continue;
    }

    if (relativePath.startsWith("tests/sources/")) {
      normalizedFiles.set(
        relativePath,
        contents.replaceAll("tests/sources/", "upstream/ranty/tests/sources/")
      );
      continue;
    }

    normalizedFiles.set(relativePath, contents);
  }

  return normalizedFiles;
}

export function writeFileMap(root, files) {
  fs.rmSync(root, { recursive: true, force: true });

  for (const [relativePath, contents] of files.entries()) {
    const targetPath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, contents, "utf8");
  }
}

export function componentSignatureMap(contract) {
  return new Map(
    (contract?.components ?? []).map((component) => [
      component.id,
      component.signature
    ])
  );
}

export function diffComponentIds(previousContract, nextContract) {
  const previous = componentSignatureMap(previousContract);
  const next = componentSignatureMap(nextContract);
  const ids = new Set([...previous.keys(), ...next.keys()]);

  return [...ids]
    .filter((id) => previous.get(id) !== next.get(id))
    .sort((left, right) => left.localeCompare(right));
}

function parseGitStatusLine(line) {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  const renamedMatch = trimmed.match(/^[A-Z?]{1,2}\s+(.+?) -> (.+)$/u);
  if (renamedMatch) {
    return renamedMatch[2];
  }

  return trimmed.slice(3);
}

function git(repoRootPath, args) {
  return execFileSync("git", args, {
    cwd: repoRootPath,
    encoding: "utf8"
  });
}

function getPullRequestChangedFiles(repoRootPath) {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const eventName = process.env.GITHUB_EVENT_NAME;
  if (
    !eventPath ||
    !fs.existsSync(eventPath) ||
    (eventName !== "pull_request" && eventName !== "pull_request_target")
  ) {
    return null;
  }

  const event = JSON.parse(fs.readFileSync(eventPath, "utf8"));
  const baseSha = event?.pull_request?.base?.sha;
  if (typeof baseSha !== "string" || baseSha.length === 0) {
    return null;
  }

  const output = git(repoRootPath, [
    "diff",
    "--name-only",
    `${baseSha}...HEAD`
  ]);
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

export function getChangedFiles(repoRootPath = repoRoot) {
  const pullRequestFiles = getPullRequestChangedFiles(repoRootPath);
  if (pullRequestFiles) {
    return pullRequestFiles;
  }

  const output = git(repoRootPath, [
    "status",
    "--short",
    "--untracked-files=all"
  ]);
  return output
    .split("\n")
    .map((line) => parseGitStatusLine(line))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

export function matchesAnyPattern(relativePath, patterns) {
  return patterns.some((pattern) =>
    path.posix.matchesGlob(relativePath, pattern)
  );
}
