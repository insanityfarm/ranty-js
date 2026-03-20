import { formatExampleMessage } from "../internal/formatExampleMessage.js";

export function createExampleMessage(name?: string): string {
  return formatExampleMessage(name);
}
