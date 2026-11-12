import { validateRoot, type VElement, type VNode, type VRoot, type VText } from './vdom';

export type NodePlan =
  | { readonly op: 'keep'; readonly next: VNode }
  | { readonly op: 'text'; readonly next: VText }
  | { readonly op: 'element'; readonly next: VElement; readonly children: ChildrenPlan };
export type ChildPlacement =
  | { readonly op: 'create'; readonly next: VNode }
  | { readonly op: 'reuse'; readonly oldIndex: number; readonly patch: NodePlan }
  | { readonly op: 'replace'; readonly oldIndex: number; readonly next: VNode };
export interface ChildrenPlan {
  readonly ordered: readonly ChildPlacement[];
  readonly remove: readonly number[];
}
export interface PatchPlan {
  readonly previous: VRoot;
  readonly next: VRoot;
  readonly hasChanges: boolean;
  readonly children: ChildrenPlan;
}

function sameRecord(previous: Readonly<Record<string, unknown>>, next: Readonly<Record<string, unknown>>): boolean {
  const names = Object.getOwnPropertyNames(previous);
  return names.length === Object.getOwnPropertyNames(next).length
    && names.every((name) => Object.hasOwn(next, name) && previous[name] === next[name]);
}

function nodePlan(previous: VNode, next: VNode): NodePlan | undefined {
  if (previous.kind === 'text' && next.kind === 'text') {
    return { op: previous.value === next.value ? 'keep' : 'text', next };
  }
  if (previous.kind !== 'element' || next.kind !== 'element' || previous.tag !== next.tag) return undefined;
  const children = childrenPlan(previous.children, next.children);
  if (!children.hasChanges && sameRecord(previous.attrs, next.attrs)
    && sameRecord(previous.domProps, next.domProps) && sameRecord(previous.events, next.events)) {
    return { op: 'keep', next };
  }
  return { op: 'element', next, children: children.plan };
}

function childrenPlan(previous: readonly VNode[], next: readonly VNode[]): { plan: ChildrenPlan; hasChanges: boolean } {
  const keyed = new Map<string, number>();
  previous.forEach((node, index) => {
    if (node.kind === 'element' && node.key !== undefined) keyed.set(node.key, index);
  });
  const consumed = new Set<number>();
  let hasChanges = previous.length !== next.length;
  const ordered = next.map((node, index): ChildPlacement => {
    const key = node.kind === 'element' ? node.key : undefined;
    const candidate = previous[index];
    const oldIndex = key !== undefined ? keyed.get(key)
      : candidate !== undefined && (candidate.kind === 'text' || candidate.key === undefined) ? index : undefined;
    if (oldIndex === undefined) {
      hasChanges = true;
      return { op: 'create', next: node };
    }
    consumed.add(oldIndex);
    const patch = nodePlan(previous[oldIndex], node);
    if (patch === undefined) {
      hasChanges = true;
      return { op: 'replace', oldIndex, next: node };
    }
    if (oldIndex !== index || patch.op !== 'keep') hasChanges = true;
    return { op: 'reuse', oldIndex, patch };
  });
  const remove = previous.flatMap((_node, index) => consumed.has(index) ? [] : [index]);
  if (remove.length !== 0) hasChanges = true;
  return { plan: { ordered, remove }, hasChanges };
}

/** Compare normalized logical trees without mutating inputs or accessing DOM. */
export function diff(previous: VRoot, next: VRoot): PatchPlan {
  validateRoot(previous, 'component');
  validateRoot(next, 'component');
  const children = childrenPlan(previous.children, next.children);
  return { previous, next, hasChanges: children.hasChanges, children: children.plan };
}
