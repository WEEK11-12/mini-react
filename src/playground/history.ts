import { diff } from '../core/diff';
import { validateRoot, type VNode, type VRoot } from '../core/vdom';

function snapshot(tree: VRoot): VRoot {
  validateRoot(tree, 'html');
  function copy(node: VNode): VNode {
    if (node.kind === 'text') return Object.freeze({ kind: 'text', value: node.value });
    return Object.freeze({ kind: 'element', tag: node.tag,
      ...(node.key === undefined ? {} : { key: node.key }),
      attrs: Object.freeze(Object.fromEntries(Object.getOwnPropertyNames(node.attrs).map((name) => [name, node.attrs[name]]))),
      domProps: Object.freeze(Object.fromEntries(Object.getOwnPropertyNames(node.domProps).map((name) => [name, Reflect.get(node.domProps, name)]))), events: Object.freeze({}),
      children: Object.freeze(node.children.map(copy)) });
  }
  return Object.freeze({ kind: 'root', children: Object.freeze(tree.children.map(copy)) });
}

export class HistoryStore {
  private entries: VRoot[];
  private cursor = 0;

  constructor(initial: VRoot) { this.entries = [snapshot(initial)]; }
  current(): VRoot { return this.entries[this.cursor]; }
  canBack(): boolean { return this.cursor > 0; }
  canForward(): boolean { return this.cursor + 1 < this.entries.length; }
  peek(offset: -1 | 1): VRoot | undefined { return this.entries[this.cursor + offset]; }
  push(tree: VRoot): void {
    validateRoot(tree, 'html');
    if (!diff(this.current(), tree).hasChanges) return;
    const next = snapshot(tree);
    this.entries = [...this.entries.slice(0, this.cursor + 1), next];
    this.cursor += 1;
  }
  commitMove(offset: -1 | 1): void { if (this.peek(offset)) this.cursor += offset; }
  position(): number { return this.cursor + 1; }
  count(): number { return this.entries.length; }
}
