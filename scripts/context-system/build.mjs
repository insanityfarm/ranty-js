import {
  formatBuildSummary,
  loadContextData,
  writeContextArtifacts,
} from "./shared.mjs";

const contextData = loadContextData(process.cwd());
const changedFiles = writeContextArtifacts(contextData);
console.log(formatBuildSummary(changedFiles));
