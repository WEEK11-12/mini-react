import { createDOMScope, releaseDOMEvents, releaseDOMScope, type DOMScope } from './dom-bindings';
import { diff } from './diff';
import { applyPlan, mountTree } from './patch';
import { normalizeChildren, validateRoot, type Child, type VNode, type VRoot } from './vdom';

export class FunctionComponent<P> {
  readonly hooks: unknown[] = [];
  phase: 'unmounted' | 'rendering' | 'committing' | 'idle' | 'recovering' | 'faulted' | 'unmounting' = 'unmounted';
  private container?: Element;
  private scope?: DOMScope;
  private props?: P;
  private currentTree?: VRoot;

  constructor(private readonly renderFn: (props: P) => Child) {}

  private isFaulted(): boolean { return this.phase === 'faulted'; }

  mount(container: Element, props: P): void {
    if (this.phase !== 'unmounted') throw new Error('Component is already mounted');
    if (container.childNodes.length) throw new Error('Mount requires an empty container');
    const scope = createDOMScope(container);
    this.container = container;
    this.scope = scope;
    try {
      this.render(props, true);
    } catch (error) {
      if (!this.isFaulted()) {
        releaseDOMScope(scope);
        this.container = undefined;
        this.scope = undefined;
        this.phase = 'unmounted';
      }
      throw error;
    }
  }

  update(props?: P): void {
    if (this.phase !== 'idle') throw new Error('Component is not idle');
    this.render(props === undefined ? this.props! : props, false);
  }

  private render(props: P, initial: boolean): void {
    this.phase = 'rendering';
    try {
      const tree: VRoot = { kind: 'root', children: normalizeChildren([this.renderFn(props)]) };
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
      this.phase = 'idle';
    } catch (error) {
      if (this.phase === 'rendering') this.phase = initial ? 'unmounted' : 'idle';
      throw error;
    }
  }

  private recover(): void {
    this.phase = 'recovering';
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
