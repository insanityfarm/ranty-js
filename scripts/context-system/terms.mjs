import { checkTerminology, loadContextData } from "./shared.mjs";

const contextData = loadContextData(process.cwd());
checkTerminology(contextData);
console.log("Terminology checks passed.");
