import { createDOMScope, releaseDOMEvents, releaseDOMScope, type DOMScope } from './dom-bindings';
import { diff } from './diff';
import { beginRender, endRender, type StateSlot } from './hooks';
import { applyPlan, mountTree } from './patch';
import { normalizeChildren, validateRoot, type Child, type VNode, type VRoot } from './vdom';

export class FunctionComponent<P> {
  readonly hooks: StateSlot[] = [];
  phase: 'unmounted' | 'rendering' | 'committing' | 'idle' | 'recovering' | 'faulted' | 'unmounting' = 'unmounted';
  private container?: Element;
  private scope?: DOMScope;
  private props?: P;
  private currentTree?: VRoot;
  private generation = 0;
  private updateQueue: ({ kind: 'state'; index: number; next: unknown } | { kind: 'props'; props?: P })[] = [];
  private draining = false;

  constructor(private readonly renderFn: (props: P) => Child) {}

  private isFaulted(): boolean { return this.phase === 'faulted'; }

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
      if (!this.isFaulted()) {
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
    if (this.phase === 'committing') {
      this.updateQueue.push({ kind: 'props', props });
      return;
    }
    if (this.phase !== 'idle') throw new Error('Component is not idle');
    this.render(props === undefined ? this.props! : props, false);
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
    try {
      while (this.updateQueue.length) {
        if (++count > 50) throw new Error('Too many consecutive updates');
        const request = this.updateQueue.shift()!;
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
      }
    } catch (error) {
      this.updateQueue.length = 0;
      throw error;
    } finally {
      this.draining = false;
    }
  }

  private render(props: P, initial: boolean, candidate: StateSlot[] = this.hooks.slice()): void {
    this.phase = 'rendering';
    try {
      const generation = this.generation;
      beginRender(this.hooks, candidate, (index, next) => this.enqueueState(index, next, generation));
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
      this.phase = 'idle';
    } catch (error) {
      if (this.phase === 'rendering') this.phase = initial ? 'unmounted' : 'idle';
      this.updateQueue.length = 0;
      throw error;
    }
  }

  private recover(): void {
    this.phase = 'recovering';
    this.generation += 1;
    this.updateQueue.length = 0;
    const container = this.container!;
    const scope = this.scope!;
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
    } finally {
      this.phase = 'faulted';
    }
  }

  unmount(): void {
    if (this.phase === 'unmounted') return;
    if (this.phase !== 'idle' && this.phase !== 'faulted') throw new Error('Cannot unmount during an update');
    this.phase = 'unmounting';
    this.generation += 1;
    this.updateQueue.length = 0;
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
      throw error;
    }
  }
}
