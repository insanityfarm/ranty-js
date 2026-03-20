import { checkArchitecture, loadContextData } from "./shared.mjs";

const contextData = loadContextData(process.cwd());
checkArchitecture(contextData);
console.log("Architecture checks passed.");
