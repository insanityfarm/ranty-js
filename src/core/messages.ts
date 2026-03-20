export type Severity = "warning" | "error";

export interface CompilerSpan {
  readonly start: number;
  readonly end: number;
}

export interface CompilerPosition {
  readonly span: CompilerSpan;
}

export class CompilerMessage {
  readonly code: string;
  readonly message: string;
  readonly severity: Severity;
  readonly inlineMessage: string | undefined;
  readonly pos: CompilerPosition | undefined;

  constructor(options: {
    code: string;
    message: string;
    severity: Severity;
    inlineMessage?: string;
    pos?: CompilerPosition;
  }) {
    this.code = options.code;
    this.message = options.message;
    this.severity = options.severity;
    this.inlineMessage = options.inlineMessage;
    this.pos = options.pos;
  }

  isWarning(): boolean {
    return this.severity === "warning";
  }

  isError(): boolean {
    return this.severity === "error";
  }
}

export interface Reporter {
  report(message: CompilerMessage): void;
}
