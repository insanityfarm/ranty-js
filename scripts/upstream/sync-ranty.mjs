import path from "node:path";
import process from "node:process";

import {
  UPSTREAM_REPO_URL,
  VENDORED_UPSTREAM_ROOT,
  diffComponentIds,
  loadUpstreamBundle,
  normalizeBundleFiles,
  parseArgs,
  readJsonIfExists,
  repoRoot,
  sha256Hex,
  vendoredUpstreamRoot,
  writeFileMap,
  writeJson
} from "./shared.mjs";

const { flags } = parseArgs(process.argv.slice(2));
const sourceRepo = flags.get("source-repo");
const requestedRef = flags.get("ref") ?? "main";
const summaryFile = flags.get("summary-file");

const previousContract = readJsonIfExists(
  path.join(vendoredUpstreamRoot, "contract.json")
);
const bundle = await loadUpstreamBundle({
  sourceRepo,
  ref: requestedRef
});
const files = normalizeBundleFiles(bundle.files);
const contractText = files.get("contract.json");

if (!contractText) {
  throw new Error("The upstream bundle does not contain contract.json.");
}

const contract = JSON.parse(contractText);
const changedComponents = diffComponentIds(previousContract, contract);

writeFileMap(vendoredUpstreamRoot, files);

const lock = {
  schema_version: 1,
  upstream_repo: contract.source_repo ?? UPSTREAM_REPO_URL,
  vendored_root: VENDORED_UPSTREAM_ROOT,
  requested_ref: requestedRef,
  source_commit: contract.source_commit,
  contract_sha256: sha256Hex(contractText),
  component_signatures: Object.fromEntries(
    (contract.components ?? []).map((component) => [
      component.id,
      component.signature
    ])
  )
};

writeJson(path.join(vendoredUpstreamRoot, "lock.json"), lock);

const summary = {
  sourceCommit: contract.source_commit,
  requestedRef,
  changedComponents
};

if (summaryFile) {
  writeJson(path.resolve(repoRoot, summaryFile), summary);
}

console.log(`Synced upstream parity bundle from ${contract.source_commit}.`);
if (changedComponents.length === 0) {
  console.log("Changed components: none");
} else {
  console.log(`Changed components: ${changedComponents.join(", ")}`);
}
