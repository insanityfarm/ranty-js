import {
  buildReviewPacket,
  formatReviewSummary,
  loadContextData,
  writeReviewPacket,
} from "./shared.mjs";

const contextData = loadContextData(process.cwd());
const reviewPacket = buildReviewPacket(contextData);
writeReviewPacket(contextData, reviewPacket);
console.log(formatReviewSummary(reviewPacket));
