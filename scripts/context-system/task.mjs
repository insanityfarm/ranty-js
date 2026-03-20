import {
  buildTaskPacket,
  formatTaskSummary,
  loadContextData,
  parseArgs,
  writeActiveTask,
} from "./shared.mjs";

const { flags, positionals } = parseArgs(process.argv.slice(2));
const task = positionals.join(" ").trim();

if (!task) {
  throw new Error(
    'Usage: npm run context:task -- "<task>" [--allow-locked=id1,id2]',
  );
}

const allowLocked = (flags.get("allow-locked") ?? "")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);

const contextData = loadContextData(process.cwd());
const taskPacket = buildTaskPacket(contextData, { allowLocked, task });
writeActiveTask(contextData, taskPacket);
console.log(formatTaskSummary(taskPacket));
