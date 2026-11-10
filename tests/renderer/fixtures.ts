export type Handler = (event: Event) => void;
export type VText = { readonly kind: 'text'; readonly value: string };
export type VElement = {
  readonly kind: 'element';
  readonly tag: string;
  readonly key?: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly domProps: Readonly<{ value?: string; checked?: boolean; disabled?: boolean }>;
  readonly events: Readonly<Partial<Record<'click' | 'input' | 'change', Handler>>>;
  readonly children: readonly VNode[];
};
export type VNode = VText | VElement;
export type VRoot = { readonly kind: 'root'; readonly children: readonly VNode[] };
export type NodePlan =
  | { readonly op: 'keep'; readonly next: VNode }
  | { readonly op: 'text'; readonly next: VText }
  | { readonly op: 'element'; readonly next: VElement; readonly children: ChildrenPlan };
export type Placement =
  | { readonly op: 'create'; readonly next: VNode }
  | { readonly op: 'reuse'; readonly oldIndex: number; readonly patch: NodePlan }
  | { readonly op: 'replace'; readonly oldIndex: number; readonly next: VNode };
export type ChildrenPlan = {
  readonly ordered: readonly Placement[];
  readonly remove: readonly number[];
};
export type PatchPlan = {
  readonly previous: VRoot;
  readonly next: VRoot;
  readonly hasChanges: boolean;
  readonly children: ChildrenPlan;
};
// Opaque: tests neither construct a scope nor inspect its representation.
export type DOMScope = object;
export interface ReaderModule {
  readDOM(container: Element | DocumentFragment, scope?: DOMScope): VRoot;
}
export interface VDOMModule {
  // unknown deliberately allows adversarial runtime input without unsafe assertions.
  validateRoot(root: unknown, mode: 'html' | 'component'): void;
}
export interface DiffModule {
  diff(previous: VRoot, next: VRoot): PatchPlan;
}
export interface PatchModule {
  mountTree(container: Element, tree: VRoot, scope: DOMScope): void;
  applyPlan(container: Element, plan: PatchPlan, scope: DOMScope): void;
}
export interface BindingsModule {
  createDOMScope(container: Element): DOMScope;
  releaseDOMScope(scope: DOMScope): void;
}

export function text(value: string): VText {
  return { kind: 'text', value };
}

export function element(
  tag: string,
  children: readonly VNode[] = [],
  options: Partial<Omit<VElement, 'kind' | 'tag' | 'children'>> = {},
): VElement {
  return { kind: 'element', tag, attrs: {}, domProps: {}, events: {}, children, ...options };
}

export function root(...children: readonly VNode[]): VRoot {
  return { kind: 'root', children };
}

export function keyed(key: string, tag = 'p'): VElement {
  return element(tag, [text(key)], { key });
}

export function host(): HTMLDivElement {
  const container = document.createElement('div');
  document.body.append(container);
  return container;
}

export function parse(html: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.content;
}

export function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) {
      freeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

export function requireElement<T extends Element>(
  container: ParentNode,
  selector: string,
  constructor: { new (...args: never[]): T },
): T {
  const found = container.querySelector(selector);
  if (!(found instanceof constructor)) {
    throw new Error(`Fixture missing ${selector}`);
  }
  return found;
}
