export type Setter<T> = (next: T | ((previous: T) => T)) => void;
export interface StateSlot {
  readonly kind: 'state';
  readonly value: unknown;
  readonly setter: Setter<unknown>;
}

interface RenderContext {
  readonly previous: readonly StateSlot[];
  readonly candidate: StateSlot[];
  readonly enqueue: (index: number, next: unknown) => void;
  index: number;
  child: boolean;
}

let active: RenderContext | undefined;

export function beginRender(previous: readonly StateSlot[], candidate: StateSlot[], enqueue: RenderContext['enqueue']): void {
  if (active) throw new Error('A root is already rendering');
  active = { previous, candidate, enqueue, index: 0, child: false };
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
  return [context.candidate[index].value as T, slot.setter as Setter<T>];
}
