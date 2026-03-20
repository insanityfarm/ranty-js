import type { RantyValue } from "./values";

export interface DataSource {
  typeId(): string;
  requestData(args: readonly RantyValue[]): RantyValue;
}
