import type { Sequence } from "./lang";

export interface RantyProgramInfo {
  readonly path?: string;
  readonly name?: string;
}

export class RantyProgram {
  readonly source: string;
  readonly info: RantyProgramInfo;
  readonly root: Sequence;

  constructor(source: string, info: RantyProgramInfo = {}, root: Sequence) {
    this.source = source;
    this.info = info;
    this.root = root;
  }

  name(): string | undefined {
    return this.info.name;
  }

  path(): string | undefined {
    return this.info.path;
  }
}
