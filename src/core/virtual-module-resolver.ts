import { compileString } from "./compiler";
import { CompilerError, ModuleResolveError } from "./errors";
import type { CompilerMessage, Reporter } from "./messages";
import type { RantyProgram } from "./program";
import type { Ranty } from "./ranty";
import type { ModuleResolver } from "./module-resolver";

class CollectingReporter implements Reporter {
  readonly messages: CompilerMessage[] = [];

  report(message: CompilerMessage): void {
    this.messages.push(message);
  }
}

export class VirtualModuleResolver implements ModuleResolver {
  readonly modules: Map<string, string>;

  constructor(modules?: Record<string, string> | Map<string, string>) {
    this.modules =
      modules instanceof Map
        ? new Map(modules)
        : new Map(Object.entries(modules ?? {}));
  }

  setModule(modulePath: string, source: string): this {
    this.modules.set(modulePath, source);
    return this;
  }

  tryResolve(
    context: Ranty,
    modulePath: string,
    _dependant?: { readonly path?: string },
    reporter?: Reporter
  ): RantyProgram {
    const exact = this.modules.get(modulePath);
    if (exact != null) {
      return this.compileModule(context, modulePath, exact, reporter);
    }

    const normalized = modulePath.replace(/^\.\//, "");
    for (const extension of ["ranty", "rant"]) {
      const candidate = normalized.endsWith(`.${extension}`)
        ? normalized
        : `${normalized}.${extension}`;
      const source = this.modules.get(candidate);
      if (source != null) {
        return this.compileModule(context, candidate, source, reporter);
      }
    }

    throw new ModuleResolveError(modulePath, { kind: "not_found" });
  }

  private compileModule(
    context: Ranty,
    path: string,
    source: string,
    reporter?: Reporter
  ): RantyProgram {
    const collecting = new CollectingReporter();
    const compositeReporter = reporter ?? collecting;

    try {
      return compileString(
        source,
        compositeReporter,
        context.options().debugMode,
        { path }
      );
    } catch (error) {
      if (error instanceof CompilerError) {
        throw new ModuleResolveError(path, {
          kind: "compile_failed",
          messages: collecting.messages
        });
      }
      throw error;
    }
  }
}
