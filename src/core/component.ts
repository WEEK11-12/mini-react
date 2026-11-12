import { createDOMScope, releaseDOMEvents, releaseDOMScope, type DOMScope } from './dom-bindings';
import { diff } from './diff';
import { beginRender, endRender, type EffectSlot, type HookSlot, type PendingEffect } from './hooks';
import { applyPlan, mountTree } from './patch';
import { normalizeChildren, validateRoot, type Child, type VNode, type VRoot } from './vdom';

class EffectExecutionError extends AggregateError {}

export class FunctionComponent<P> {
  readonly hooks: HookSlot[] = [];
  phase: 'unmounted' | 'rendering' | 'committing' | 'effects' | 'idle' | 'recovering' | 'faulted' | 'unmounting' = 'unmounted';
  private container?: Element;
  private scope?: DOMScope;
  private props?: P;
  private currentTree?: VRoot;
  private generation = 0;
  private updateQueue: ({ kind: 'state'; index: number; next: unknown } | { kind: 'props'; props?: P })[] = [];
  private draining = false;

  constructor(private readonly renderFn: (props: P) => Child) {}

  private isFaulted(): boolean { return this.phase === 'faulted'; }
  private isIdle(): boolean { return this.phase === 'idle'; }

  mount(container: Element, props: P): void {
    if (this.phase !== 'unmounted') throw new Error('Component is already mounted');
    if (container.childNodes.length) throw new Error('Mount requires an empty container');
    const scope = createDOMScope(container);
    this.container = container;
    this.scope = scope;
    this.generation += 1;
    try {
      this.render(props, true);
    } catch (error) {
      if (!this.isFaulted() && !this.isIdle()) {
        this.generation += 1;
        this.updateQueue.length = 0;
        releaseDOMScope(scope);
        this.container = undefined;
        this.scope = undefined;
        this.phase = 'unmounted';
      }
      throw error;
    }
    this.drainQueue();
  }

  update(props?: P): void {
    if (this.phase === 'committing' || this.phase === 'effects') {
      this.updateQueue.push({ kind: 'props', props });
      return;
    }
    if (this.phase !== 'idle') throw new Error('Component is not idle');
    this.render(props === undefined ? this.props! : props, false, undefined, 1);
    this.drainQueue(1);
  }

  private enqueueState(index: number, next: unknown, generation: number): void {
    if (generation !== this.generation || this.phase === 'unmounted' || this.phase === 'faulted' ||
      this.phase === 'unmounting' || this.phase === 'recovering') return;
    if (this.phase === 'rendering') throw new Error('Cannot update state during render');
    this.updateQueue.push({ kind: 'state', index, next });
    if (this.phase === 'idle') this.drainQueue();
  }

  private drainQueue(initialCount = 0): void {
    if (this.draining || this.phase !== 'idle') return;
    this.draining = true;
    let count = initialCount;
    const effectErrors: unknown[] = [];
    try {
      while (this.updateQueue.length) {
        if (++count > 50) throw new Error('Too many consecutive updates');
        const request = this.updateQueue.shift()!;
        try {
          if (request.kind === 'props') {
            this.render(request.props === undefined ? this.props! : request.props, false);
            continue;
          }
          const slot = this.hooks[request.index];
          if (!slot || slot.kind !== 'state') continue;
          this.phase = 'rendering';
          let value: unknown;
          try {
            value = typeof request.next === 'function'
              ? (request.next as (previous: unknown) => unknown)(slot.value) : request.next;
          } finally {
            this.phase = 'idle';
          }
          if (Object.is(value, slot.value)) continue;
          const candidate = this.hooks.slice();
          candidate[request.index] = { ...slot, value };
          this.render(this.props!, false, candidate);
        } catch (error) {
          if (!(error instanceof EffectExecutionError)) throw error;
          effectErrors.push(...error.errors);
        }
      }
      if (effectErrors.length) throw new EffectExecutionError(effectErrors, 'Effect execution failed');
    } catch (error) {
      this.updateQueue.length = 0;
      if (effectErrors.length && !(error instanceof EffectExecutionError)) {
        throw new AggregateError([...effectErrors, error], 'Queued updates failed');
      }
      throw error;
    } finally {
      this.draining = false;
    }
  }

  private render(props: P, initial: boolean, candidate: HookSlot[] = this.hooks.slice(), initialCount = 0): void {
    const pendingEffects: PendingEffect[] = [];
    let committed = false;
    this.phase = 'rendering';
    try {
      const generation = this.generation;
      beginRender(this.hooks, candidate, pendingEffects, (index, next) => this.enqueueState(index, next, generation));
      let tree: VRoot;
      let count: number;
      try {
        tree = { kind: 'root', children: normalizeChildren([this.renderFn(props)]) };
      } finally {
        count = endRender();
      }
      if (!initial && count !== this.hooks.length) throw new Error('Hook count changed');
      validateRoot(tree, 'component');
      const plan = initial ? undefined : diff(this.currentTree!, tree);
      this.phase = 'committing';
      try {
        if (initial) mountTree(this.container!, tree, this.scope!);
        else applyPlan(this.container!, plan!, this.scope!);
      } catch (error) {
        try {
          this.recover();
        } catch (recoveryError) {
          throw new AggregateError([error, recoveryError], 'DOM application and display recovery failed');
        }
        throw error;
      }
      this.currentTree = tree;
      this.props = props;
      this.hooks.splice(0, this.hooks.length, ...candidate);
      committed = true;
      this.phase = 'effects';
      const errors: unknown[] = [];
      for (const { slotIndex, setup } of pendingEffects) {
        const slot = this.hooks[slotIndex] as EffectSlot;
        const cleanup = slot.cleanup;
        slot.cleanup = undefined;
        try { cleanup?.(); } catch (error) { errors.push(error); }
        try {
          const result: unknown = setup();
          if (result !== undefined && typeof result !== 'function') throw new Error('Effect must return a cleanup function or undefined');
          slot.cleanup = result as (() => void) | undefined;
        } catch (error) { errors.push(error); }
      }
      this.phase = 'idle';
      if (errors.length) {
        if (!this.draining) {
          try { this.drainQueue(initialCount); } catch (error) { errors.push(error); }
        }
        throw new EffectExecutionError(errors, 'Effect execution failed');
      }
    } catch (error) {
      if (this.phase === 'rendering') this.phase = initial ? 'unmounted' : 'idle';
      if (!committed) this.updateQueue.length = 0;
      throw error;
    }
  }

  private recover(): void {
    this.phase = 'recovering';
    this.generation += 1;
    this.updateQueue.length = 0;
    const container = this.container!;
    const scope = this.scope!;
    const errors = this.cleanupEffects();
    try {
      releaseDOMEvents(scope);
      container.replaceChildren();
      if (this.currentTree) {
        const displayNode = (node: VNode): VNode => node.kind === 'text' ? node : {
          kind: 'element', tag: node.tag, key: node.key, attrs: node.attrs,
          domProps: node.domProps, events: {}, children: node.children.map(displayNode),
        };
        mountTree(container, { kind: 'root', children: this.currentTree.children.map(displayNode) }, scope);
      }
    } catch (error) {
      errors.push(error);
    } finally {
      this.phase = 'faulted';
    }
    if (errors.length) throw new AggregateError(errors, 'Display recovery failed');
  }

  private cleanupEffects(): unknown[] {
    const errors: unknown[] = [];
    for (const slot of this.hooks) {
      if (slot.kind !== 'effect') continue;
      const cleanup = slot.cleanup;
      slot.cleanup = undefined;
      try { cleanup?.(); } catch (error) { errors.push(error); }
    }
    return errors;
  }

  unmount(): void {
    if (this.phase === 'unmounted') return;
    if (this.phase !== 'idle' && this.phase !== 'faulted') throw new Error('Cannot unmount during an update');
    this.phase = 'unmounting';
    this.generation += 1;
    this.updateQueue.length = 0;
    const errors = this.cleanupEffects();
    try {
      releaseDOMEvents(this.scope!);
      this.container!.replaceChildren();
      releaseDOMScope(this.scope!);
      this.hooks.length = 0;
      this.currentTree = undefined;
      this.container = undefined;
      this.scope = undefined;
      this.props = undefined;
      this.phase = 'unmounted';
    } catch (error) {
      this.phase = 'faulted';
      errors.push(error);
    }
    if (errors.length) throw new AggregateError(errors, 'Component removal failed');
  }
}
