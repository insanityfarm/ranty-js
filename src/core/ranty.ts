import { BUILD_VERSION, MODULES_CACHE_KEY } from "./constants";
import type { RantyBinding } from "./binding";
import { valueBinding } from "./binding";
import { compileFile, compileString } from "./compiler";
import { nullReporter } from "./compiler/message";
import type { DataSource } from "./data-source";
import { ModuleResolveError, RuntimeError, RuntimeErrorType } from "./errors";
import {
  defaultOutputFormatState,
  type OutputFormatState
} from "./format-state";
import { DefaultModuleResolver, type ModuleResolver } from "./module-resolver";
import type { Reporter } from "./messages";
import type { RantyProgram } from "./program";
import { RantyRng } from "./rng";
import { VM } from "./runtime/vm";
import { loadStdlib } from "./stdlib";
import { VirtualModuleResolver } from "./virtual-module-resolver";
import type { RantyValue } from "./values";

export interface RantyOptions {
  useStdlib: boolean;
  debugMode: boolean;
  topLevelDefsAreGlobals: boolean;
  seed: bigint | number;
  gcAllocationThreshold: number;
}

export const DEFAULT_ALLOCATION_THRESHOLD = 1024;

export class Ranty {
  static readonly BUILD_VERSION = BUILD_VERSION;

  static createVirtualModules(
    modules?: Record<string, string> | Map<string, string>
  ) {
    return new VirtualModuleResolver(modules);
  }

  static evaluate(
    source: string,
    options: Partial<RantyOptions> = {}
  ): RantyValue {
    const ranty = new Ranty(options);
    const program = ranty.compileQuiet(source);
    return ranty.run(program);
  }

  #options: RantyOptions;
  #moduleResolver: ModuleResolver;
  #rngStack: RantyRng[];
  #globals = new Map<string, RantyBinding>();
  #dataSources = new Map<string, DataSource>();
  #loadingModules = new Set<string>();
  #activeVms: VM[] = [];
  #formatState: OutputFormatState;

  constructor(options: Partial<RantyOptions> = {}) {
    this.#options = {
      useStdlib: options.useStdlib ?? true,
      debugMode: options.debugMode ?? false,
      topLevelDefsAreGlobals: options.topLevelDefsAreGlobals ?? false,
      seed: options.seed ?? 0n,
      gcAllocationThreshold:
        options.gcAllocationThreshold ?? DEFAULT_ALLOCATION_THRESHOLD
    };
    this.#moduleResolver = new DefaultModuleResolver();
    this.#rngStack = [new RantyRng(this.#options.seed)];
    this.#globals.set(
      MODULES_CACHE_KEY,
      valueBinding(new Map<string, RantyValue>())
    );
    this.#formatState = defaultOutputFormatState();
    if (this.#options.useStdlib) {
      loadStdlib(this);
    }
  }

  usingModuleResolver(moduleResolver: ModuleResolver): this {
    this.#moduleResolver = moduleResolver;
    return this;
  }

  moduleResolver(): ModuleResolver {
    return this.#moduleResolver;
  }

  options(): Readonly<RantyOptions> {
    return this.#options;
  }

  optionsMut(): RantyOptions {
    return this.#options;
  }

  seed(): bigint {
    return this.rng().seed();
  }

  rng(): RantyRng {
    return this.#rngStack[this.#rngStack.length - 1] ?? this.#rngStack[0]!;
  }

  setSeed(seed: bigint | number): void {
    this.#options.seed = seed;
    this.#rngStack = [new RantyRng(seed)];
  }

  resetSeed(): void {
    this.#rngStack = [new RantyRng(this.#options.seed)];
  }

  compile<R extends Reporter>(source: string, _reporter: R): RantyProgram {
    return compileString(source, _reporter, this.#options.debugMode, {});
  }

  compileNamed<R extends Reporter>(
    source: string,
    reporter: R,
    name: string
  ): RantyProgram {
    return compileString(source, reporter, this.#options.debugMode, { name });
  }

  compileQuiet(source: string): RantyProgram {
    return compileString(source, nullReporter(), this.#options.debugMode, {});
  }

  compileQuietNamed(source: string, name: string): RantyProgram {
    return compileString(source, nullReporter(), this.#options.debugMode, {
      name
    });
  }

  compileFile(path: string): RantyProgram {
    return compileFile(path, nullReporter(), this.#options.debugMode);
  }

  compileFileQuiet(path: string): RantyProgram {
    return compileFile(path, nullReporter(), this.#options.debugMode);
  }

  setGlobalBinding(key: string, binding: RantyBinding): boolean {
    if (this.#globals.get(key)?.const) {
      return false;
    }
    this.#globals.set(key, binding);
    return true;
  }

  setGlobalBindingForce(key: string, binding: RantyBinding): void {
    this.#globals.set(key, binding);
  }

  setGlobal(key: string, value: RantyValue): boolean {
    return this.setGlobalBinding(key, valueBinding(value));
  }

  setGlobalConst(key: string, value: RantyValue): boolean {
    return this.setGlobalBinding(key, valueBinding(value, true));
  }

  setGlobalForce(key: string, value: RantyValue): void {
    this.setGlobalBindingForce(key, valueBinding(value));
  }

  getGlobal(key: string): RantyValue | undefined {
    const binding = this.#globals.get(key);
    if (!binding) {
      return undefined;
    }

    const activeVm = this.activeVm();
    if (activeVm) {
      return activeVm.readBindingValue(binding);
    }

    if (binding.kind === "value") {
      return binding.value;
    }

    return binding.state.kind === "ready" ? binding.state.value : undefined;
  }

  hasGlobal(key: string): boolean {
    return this.#globals.has(key);
  }

  deleteGlobal(key: string): boolean {
    return this.#globals.delete(key);
  }

  globalNames(): IterableIterator<string> {
    return this.#globals.keys();
  }

  getGlobalBinding(key: string): RantyBinding | undefined {
    return this.#globals.get(key);
  }

  addDataSource(dataSource: DataSource): void {
    this.#dataSources.set(dataSource.typeId(), dataSource);
  }

  removeDataSource(name: string): DataSource | undefined {
    const source = this.#dataSources.get(name);
    this.#dataSources.delete(name);
    return source;
  }

  hasDataSource(name: string): boolean {
    return this.#dataSources.has(name);
  }

  clearDataSources(): void {
    this.#dataSources.clear();
  }

  dataSource(name: string): DataSource | undefined {
    return this.#dataSources.get(name);
  }

  iterDataSources(): IterableIterator<[string, DataSource]> {
    return this.#dataSources.entries();
  }

  run(program: RantyProgram): RantyValue {
    return new VM(this, program).run();
  }

  runWith(program: RantyProgram, args: Record<string, RantyValue>): RantyValue {
    return new VM(this, program).runWith(args);
  }

  collectGarbage(): void {}

  tryLoadGlobalModule(modulePath: string): void {
    this.#moduleResolver.tryResolve(this, modulePath);
  }

  pushRng(rng: RantyRng): void {
    this.#rngStack.push(rng);
  }

  popRng(): RantyRng | undefined {
    if (this.#rngStack.length <= 1) {
      return undefined;
    }
    return this.#rngStack.pop();
  }

  withActiveVm<T>(vm: VM, fn: () => T): T {
    this.#activeVms.push(vm);
    try {
      return fn();
    } finally {
      this.#activeVms.pop();
    }
  }

  activeVm(): VM | undefined {
    return this.#activeVms[this.#activeVms.length - 1];
  }

  formatState(): OutputFormatState {
    return this.#formatState;
  }

  resetFormatState(): void {
    this.#formatState = defaultOutputFormatState();
  }

  loadModule(
    modulePath: string,
    dependant?: { readonly path?: string }
  ): RantyValue {
    let program: RantyProgram;

    try {
      program = this.#moduleResolver.tryResolve(this, modulePath, dependant);
    } catch (error) {
      if (error instanceof ModuleResolveError) {
        throw new RuntimeError(RuntimeErrorType.ModuleError, error.message);
      }
      throw error;
    }

    const cache = this.moduleCache();
    const cacheKey = program.path() ?? modulePath;
    const cached = cache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    if (this.#loadingModules.has(cacheKey)) {
      throw new RuntimeError(
        RuntimeErrorType.ModuleError,
        "cyclic module import detected"
      );
    }

    this.#loadingModules.add(cacheKey);
    try {
      const value = new VM(this, program).runRaw();
      cache.set(cacheKey, value);
      return value;
    } finally {
      this.#loadingModules.delete(cacheKey);
    }
  }

  private moduleCache(): Map<string, RantyValue> {
    const existing = this.#globals.get(MODULES_CACHE_KEY);
    if (existing?.kind === "value" && existing.value instanceof Map) {
      return existing.value as Map<string, RantyValue>;
    }

    const cache = new Map<string, RantyValue>();
    this.#globals.set(MODULES_CACHE_KEY, valueBinding(cache));
    return cache;
  }
}
