import path from "node:path";
import process from "node:process";

import {
  getChangedFiles,
  loadUpstreamBundle,
  matchesAnyPattern,
  normalizeBundleFiles,
  parseArgs,
  readJsonIfExists,
  sha256Hex,
  vendoredUpstreamRoot
} from "./shared.mjs";

const CORE_SENSITIVE_PATTERNS = [
  "src/core/**",
  "src/index.ts",
  "tests/**",
  "package.json",
  "package-lock.json",
  "rollup.config.mjs",
  "tsconfig.json",
  "tsconfig.build.json",
  "vitest.config.ts",
  "eslint.config.mjs"
];

const NON_BLOCKING_PATTERNS = [
  "src/hosts/**",
  "tests/browser-global.test.ts",
  "benchmarks/**",
  "docs/**",
  "glossary/**",
  "scripts/context-system/**",
  "scripts/check-eslint-directives.mjs",
  "scripts/__tests__/contextSystem.test.js",
  "spec/**",
  "upstream/**",
  ".github/**",
  ".gitignore",
  ".nvmrc",
  ".prettierignore",
  ".prettierrc.json",
  "AGENTS.md",
  "LICENSE",
  "README.md",
  "notes.md"
];

const { flags } = parseArgs(process.argv.slice(2));
const sourceRepo = flags.get("source-repo");
const requestedRef = flags.get("ref") ?? "main";

const lock = readJsonIfExists(path.join(vendoredUpstreamRoot, "lock.json"));
if (!lock) {
  throw new Error(
    "Missing upstream/ranty/lock.json. Run npm run upstream:sync first."
  );
}

const bundle = await loadUpstreamBundle({
  sourceRepo,
  ref: requestedRef
});
const files = normalizeBundleFiles(bundle.files);
const contractText = files.get("contract.json");

if (!contractText) {
  throw new Error("The latest upstream bundle does not contain contract.json.");
}

const contract = JSON.parse(contractText);
const latestContractHash = sha256Hex(contractText);

const isCurrent =
  lock.source_commit === contract.source_commit &&
  lock.contract_sha256 === latestContractHash;

if (isCurrent) {
  console.log(`Upstream parity lock is current at ${lock.source_commit}.`);
  process.exit(0);
}

const changedFiles = getChangedFiles();
const blockingFiles = changedFiles.filter((relativePath) => {
  if (matchesAnyPattern(relativePath, NON_BLOCKING_PATTERNS)) {
    return false;
  }

  if (matchesAnyPattern(relativePath, CORE_SENSITIVE_PATTERNS)) {
    return true;
  }

  return true;
});

const behindMessage = [
  `Parity lock ${lock.source_commit} is behind upstream ${contract.source_commit}.`,
  `Run npm run upstream:sync -- --ref=${requestedRef} to refresh upstream/ranty/**.`
].join(" ");

if (blockingFiles.length > 0) {
  console.error(behindMessage);
  console.error("Core-sensitive files in this change:");
  for (const relativePath of blockingFiles) {
    console.error(`- ${relativePath}`);
  }
  process.exit(1);
}

console.warn(behindMessage);
if (changedFiles.length === 0) {
  console.warn(
    "No changed files were detected, so this check is warning only."
  );
} else {
  console.warn(
    "Only host, docs, benchmark, workflow, or vendored-upstream files changed:"
  );
  for (const relativePath of changedFiles) {
    console.warn(`- ${relativePath}`);
  }
}
