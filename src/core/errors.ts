import type { CompilerMessage } from "./messages";

export type CompilerErrorKind = "syntax" | "io";

export class CompilerError extends Error {
  readonly kind: CompilerErrorKind;

  constructor(kind: CompilerErrorKind, message?: string) {
    super(message ?? (kind === "syntax" ? "syntax error" : "I/O error"));
    this.name = "CompilerError";
    this.kind = kind;
  }
}

export type ModuleResolveErrorReason =
  | { readonly kind: "not_found" }
  | {
      readonly kind: "compile_failed";
      readonly messages: readonly CompilerMessage[];
    }
  | { readonly kind: "file_io_error"; readonly error: unknown };

export class ModuleResolveError extends Error {
  readonly moduleName: string;
  readonly reason: ModuleResolveErrorReason;

  constructor(moduleName: string, reason: ModuleResolveErrorReason) {
    const message =
      reason.kind === "not_found"
        ? `module '${moduleName}' not found`
        : reason.kind === "compile_failed"
          ? `module '${moduleName}' failed to compile`
          : `module '${moduleName}' failed due to file I/O`;
    super(message);
    this.name = "ModuleResolveError";
    this.moduleName = moduleName;
    this.reason = reason;
  }
}

export class ModuleLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModuleLoadError";
  }
}

export class DataSourceError extends Error {
  readonly type: "user" | "internal";

  constructor(type: "user" | "internal", message: string) {
    super(`${type === "user" ? "user error" : "internal"}: ${message}`);
    this.name = "DataSourceError";
    this.type = type;
  }
}

export enum RuntimeErrorType {
  StackOverflow = "STACK_OVERFLOW_ERROR",
  StackUnderflow = "STACK_UNDERFLOW_ERROR",
  InvalidAccess = "INVALID_ACCESS_ERROR",
  InvalidOperation = "INVALID_OP_ERROR",
  LazyBindingCycle = "LAZY_BINDING_CYCLE_ERROR",
  InternalError = "INTERNAL_ERROR",
  ArgumentMismatch = "ARG_MISMATCH_ERROR",
  ArgumentError = "ARG_ERROR",
  CannotInvokeValue = "INVOKE_ERROR",
  AssertError = "ASSERT_ERROR",
  TypeError = "TYPE_ERROR",
  ValueError = "VALUE_ERROR",
  IndexError = "INDEX_ERROR",
  KeyError = "KEY_ERROR",
  SliceError = "SLICE_ERROR",
  SelectorError = "SELECTOR_ERROR",
  ModuleError = "MODULE_ERROR",
  UserError = "USER_ERROR",
  ControlFlowError = "CONTROL_FLOW_ERROR",
  DataSourceError = "DATA_SOURCE_ERROR"
}

export class RuntimeError extends Error {
  readonly errorType: RuntimeErrorType;
  readonly description: string | undefined;
  readonly stackTrace: string | undefined;

  constructor(
    errorType: RuntimeErrorType,
    description?: string,
    stackTrace?: string
  ) {
    super(`[${errorType}] ${description ?? errorType}`);
    this.name = "RuntimeError";
    this.errorType = errorType;
    this.description = description;
    this.stackTrace = stackTrace;
  }
}
