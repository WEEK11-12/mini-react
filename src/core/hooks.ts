export type Setter<T> = (next: T | ((previous: T) => T)) => void;
export interface StateSlot {
  readonly kind: 'state';
  readonly value: unknown;
  readonly setter: Setter<unknown>;
}

export interface EffectSlot {
  readonly kind: 'effect';
  readonly value?: never;
  readonly deps: readonly unknown[] | undefined;
  cleanup?: () => void;
}
export interface MemoSlot {
  readonly kind: 'memo';
  readonly deps: readonly unknown[];
  readonly value: unknown;
}
export type HookSlot = StateSlot | EffectSlot | MemoSlot;
export interface PendingEffect {
  readonly slotIndex: number;
  readonly setup: () => void | (() => void);
}
interface RenderContext {
  readonly previous: readonly HookSlot[];
  readonly candidate: HookSlot[];
  readonly pendingEffects: PendingEffect[];
  readonly enqueue: (index: number, next: unknown) => void;
  index: number;
  child: boolean;
}

let active: RenderContext | undefined;

export function beginRender(previous: readonly HookSlot[], candidate: HookSlot[], pendingEffects: PendingEffect[], enqueue: RenderContext['enqueue']): void {
  if (active) throw new Error('A root is already rendering');
  active = { previous, candidate, pendingEffects, enqueue, index: 0, child: false };
}

export function endRender(): number {
  const context = active;
  active = undefined;
  return context?.index ?? 0;
}

export function withChildContext<T>(render: () => T): T {
  const context = active;
  if (!context) return render();
  const wasChild = context.child;
  context.child = true;
  try {
    return render();
  } finally {
    context.child = wasChild;
  }
}

export function useState<T>(initial: T | (() => T)): [T, Setter<T>] {
  const context = active;
  if (!context || context.child) throw new Error('Hooks may only run in the root render');
  const index = context.index++;
  const previous = context.previous[index];
  if (previous && previous.kind !== 'state') throw new Error('Hook kind changed');
  if (!previous && index < context.previous.length) throw new Error('Hook kind changed');
  const enqueue = context.enqueue;
  const slot = previous ?? {
    kind: 'state' as const,
    value: typeof initial === 'function' ? (initial as () => T)() : initial,
    setter: (next: unknown) => enqueue(index, next),
  };
  context.candidate[index] ??= slot;
  return [(context.candidate[index] as StateSlot).value as T, slot.setter as Setter<T>];
}

export function useEffect(setup: () => void | (() => void), deps?: readonly unknown[]): void {
  const context = active;
  if (!context || context.child) throw new Error('Hooks may only run in the root render');
  if (typeof setup !== 'function' || (deps !== undefined && !Array.isArray(deps))) {
    throw new Error('Invalid Effect arguments');
  }
  const index = context.index++;
  const previous = context.previous[index];
  if (previous && previous.kind !== 'effect' || !previous && index < context.previous.length) {
    throw new Error('Hook kind changed');
  }
  if (previous && (previous.deps === undefined) !== (deps === undefined) ||
    previous?.deps && deps && previous.deps.length !== deps.length) {
    throw new Error('Effect dependency shape changed');
  }
  let changed = !previous || deps === undefined;
  if (!changed && deps) {
    for (let i = 0; i < deps.length; i++) {
      if (!Object.is(deps[i], previous!.deps![i])) {
        changed = true;
        break;
      }
    }
  }
  context.candidate[index] = changed ? { kind: 'effect', deps: deps?.slice(), cleanup: previous?.cleanup } : previous;
  if (changed) context.pendingEffects.push({ slotIndex: index, setup });
}

export function useMemo<T>(calculate: () => T, deps: readonly unknown[]): T {
  const context = active;
  if (!context || context.child) throw new Error('Hooks may only run in the root render');
  if (typeof calculate !== 'function' || !Array.isArray(deps)) throw new Error('Invalid Memo arguments');
  const index = context.index++;
  const previous = context.previous[index];
  if (previous && previous.kind !== 'memo' || !previous && index < context.previous.length) {
    throw new Error('Hook kind changed');
  }
  if (previous && previous.deps.length !== deps.length) throw new Error('Memo dependency shape changed');
  let changed = !previous;
  if (previous) {
    for (let i = 0; i < deps.length; i++) {
      if (!Object.is(deps[i], previous.deps[i])) {
        changed = true;
        break;
      }
    }
  }
  if (!changed) {
    context.candidate[index] = previous!;
    return previous!.value as T;
  }
  const value = calculate();
  context.candidate[index] = { kind: 'memo', deps: deps.slice(), value };
  return value;
}
