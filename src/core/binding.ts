import type { Sequence } from "./lang";
import type { RantyValue } from "./values";

export interface LazyThunk {
  readonly name: string | null;
  readonly expr: Sequence;
  readonly scopes: readonly Map<string, RantyBinding>[];
}

export interface PendingLazyState {
  readonly kind: "pending";
  readonly thunk: LazyThunk;
}

export interface EvaluatingLazyState {
  readonly kind: "evaluating";
  readonly thunk: LazyThunk;
}

export interface ReadyLazyState {
  readonly kind: "ready";
  readonly value: RantyValue;
}

export type LazyState = PendingLazyState | EvaluatingLazyState | ReadyLazyState;

export interface ValueBinding {
  kind: "value";
  value: RantyValue;
  readonly const: boolean;
}

export interface LazyBinding {
  kind: "lazy";
  state: LazyState;
  readonly const: boolean;
}

export type RantyBinding = ValueBinding | LazyBinding;

export function valueBinding(value: RantyValue, isConst = false): RantyBinding {
  return {
    kind: "value",
    value,
    const: isConst
  };
}

export function lazyBinding(thunk: LazyThunk, isConst = false): RantyBinding {
  return {
    kind: "lazy",
    state: {
      kind: "pending",
      thunk
    },
    const: isConst
  };
}
