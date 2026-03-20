import { checkContextState, loadContextData } from "./shared.mjs";

const contextData = loadContextData(process.cwd());
checkContextState(contextData);
console.log("Context checks passed.");
