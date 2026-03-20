import type { CompilerMessage, Reporter } from "./messages";
import { RANTY_SUPPORTED_FILE_EXTENSIONS } from "./constants";
import { CompilerError, ModuleResolveError } from "./errors";
import type { RantyProgram } from "./program";
import type { Ranty } from "./ranty";
import type * as NodeFs from "node:fs";
import type * as NodePath from "node:path";
import { loadNodeFs } from "./util";
import { compileString } from "./compiler";

class CollectingReporter implements Reporter {
  readonly messages: CompilerMessage[] = [];

  report(message: CompilerMessage): void {
    this.messages.push(message);
  }
}

function toPosixPath(path: string): string {
  return path.replaceAll("\\", "/");
}

export interface ModuleResolver {
  tryResolve(
    context: Ranty,
    modulePath: string,
    dependant?: { readonly path?: string },
    reporter?: Reporter
  ): RantyProgram;
}

export class DefaultModuleResolver implements ModuleResolver {
  static readonly ENV_MODULES_PATH_KEY = "RANTY_MODULES_PATH";

  readonly enableGlobalModules: boolean;
  readonly localModulesPath: string | undefined;

  constructor(
    options: { enableGlobalModules?: boolean; localModulesPath?: string } = {}
  ) {
    this.enableGlobalModules = options.enableGlobalModules ?? true;
    this.localModulesPath = options.localModulesPath;
  }

  tryResolve(
    context: Ranty,
    modulePath: string,
    dependant?: { readonly path?: string },
    reporter?: Reporter
  ): RantyProgram {
    const node = loadNodeFs();
    if (!node) {
      throw new ModuleResolveError(modulePath, { kind: "not_found" });
    }

    const fullModulePath = this.findModulePath(
      node.path,
      node.fs,
      modulePath,
      dependant
    );
    if (!fullModulePath) {
      throw new ModuleResolveError(modulePath, { kind: "not_found" });
    }

    try {
      const source = node.fs.readFileSync(fullModulePath, "utf8");
      const collecting = new CollectingReporter();
      const compositeReporter = reporter ?? collecting;
      try {
        return compileString(
          source,
          compositeReporter,
          context.options().debugMode,
          {
            path: fullModulePath
          }
        );
      } catch (error) {
        if (error instanceof CompilerError) {
          throw new ModuleResolveError(modulePath, {
            kind: "compile_failed",
            messages: collecting.messages
          });
        }
        throw error;
      }
    } catch (error) {
      if (error instanceof ModuleResolveError) {
        throw error;
      }
      throw new ModuleResolveError(modulePath, {
        kind: "file_io_error",
        error
      });
    }
  }

  private findModulePath(
    pathApi: typeof NodePath,
    fsApi: typeof NodeFs,
    modulePath: string,
    dependant?: { readonly path?: string }
  ): string | undefined {
    const absoluteCandidates = pathApi.extname(modulePath)
      ? [modulePath]
      : RANTY_SUPPORTED_FILE_EXTENSIONS.map(
          (extension) => `${modulePath}.${extension}`
        );

    if (pathApi.isAbsolute(modulePath)) {
      for (const candidate of absoluteCandidates) {
        if (fsApi.existsSync(candidate)) {
          return fsApi.realpathSync(candidate);
        }
      }
      return undefined;
    }

    const roots: string[] = [];
    const dependantPath = dependant?.path;
    if (dependantPath) {
      roots.push(pathApi.dirname(dependantPath));
    }

    roots.push(this.localModulesPath ?? process.cwd());

    if (this.enableGlobalModules) {
      const globalPath =
        process.env[DefaultModuleResolver.ENV_MODULES_PATH_KEY];
      if (globalPath) {
        roots.push(globalPath);
      }
    }

    for (const root of roots) {
      const canonicalRoot = fsApi.existsSync(root)
        ? fsApi.realpathSync(root)
        : root;
      for (const candidate of absoluteCandidates) {
        const joined = pathApi.resolve(canonicalRoot, candidate);
        if (!toPosixPath(joined).startsWith(toPosixPath(canonicalRoot))) {
          continue;
        }
        if (fsApi.existsSync(joined)) {
          return fsApi.realpathSync(joined);
        }
      }
    }

    return undefined;
  }
}
