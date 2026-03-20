import { CompilerMessage, type Reporter, type Severity } from "../messages";

export function reportCompilerMessage(
  reporter: Reporter,
  code: string,
  message: string,
  severity: Severity,
  start: number,
  end: number,
  inlineMessage?: string
): void {
  const payload = {
    code,
    message,
    severity,
    pos: {
      span: {
        start,
        end
      }
    }
  } as const;

  reporter.report(
    new CompilerMessage({
      ...payload,
      ...(inlineMessage === undefined ? {} : { inlineMessage })
    })
  );
}

export function nullReporter(): Reporter {
  return {
    report() {}
  };
}
