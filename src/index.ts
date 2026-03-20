import "./hosts/browser/index";

import {
  BUILD_VERSION,
  DEFAULT_PROGRAM_NAME,
  RANTY_COMPAT_FILE_EXTENSION,
  RANTY_FILE_EXTENSION,
  RANTY_LANG_VERSION,
  RANTY_SUPPORTED_FILE_EXTENSIONS
} from "./core/constants";
import { DataSourceError } from "./core/errors";
import {
  RuntimeError,
  RuntimeErrorType,
  ModuleResolveError,
  ModuleLoadError,
  CompilerError
} from "./core/errors";
import type { DataSource } from "./core/data-source";
import { RantyInt } from "./core/int64";
import { CompilerMessage } from "./core/messages";
import { DefaultModuleResolver } from "./core/module-resolver";
import { RantyProgram } from "./core/program";
import { Ranty } from "./core/ranty";
import { RantyRng } from "./core/rng";
import { VirtualModuleResolver } from "./core/virtual-module-resolver";
import { runCli } from "./hosts/node/cli";

export {
  BUILD_VERSION,
  CompilerError,
  CompilerMessage,
  DataSourceError,
  DEFAULT_PROGRAM_NAME,
  DefaultModuleResolver,
  ModuleLoadError,
  ModuleResolveError,
  Ranty,
  RantyInt,
  RantyProgram,
  RantyRng,
  RANTY_COMPAT_FILE_EXTENSION,
  RANTY_FILE_EXTENSION,
  RANTY_LANG_VERSION,
  RANTY_SUPPORTED_FILE_EXTENSIONS,
  RuntimeError,
  RuntimeErrorType,
  VirtualModuleResolver
};

export type { DataSource };

declare const module:
  | { readonly filename?: string; readonly parent?: unknown }
  | undefined;

function isDirectExecution(): boolean {
  return (
    typeof process !== "undefined" &&
    typeof module !== "undefined" &&
    module?.parent == null
  );
}

if (isDirectExecution()) {
  void runCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
