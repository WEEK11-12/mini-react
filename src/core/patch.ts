import { validateRoot, type VElement, type VNode, type VRoot } from './vdom';
import { diff, type ChildrenPlan, type PatchPlan } from './diff';
import { assertDOMScope, bindInitialEvents, encodeAttribute, releaseNodeBindings, updateNodeEvents, type DOMScope } from './dom-bindings';

function nodeCreator(document: Document, scope: DOMScope, prepared: Element[]): (node: VNode) => Node {
  function create(node: VNode): Node {
    if (node.kind === 'text') return document.createTextNode(node.value);
    const element = document.createElement(node.tag);
    prepared.push(element);
    for (const name of Object.getOwnPropertyNames(node.attrs)) element.setAttribute(name, encodeAttribute(scope, name, node.attrs[name]));
    if (node.key !== undefined) element.setAttribute('data-key', node.key);
    for (const child of node.children) element.appendChild(create(child));
    const value = Object.hasOwn(node.domProps, 'value') ? node.domProps.value : undefined;
    const disabled = Object.hasOwn(node.domProps, 'disabled') && node.domProps.disabled === true;
    if (node.tag === 'input') {
      const input = element as HTMLInputElement;
      input.type = Object.hasOwn(node.attrs, 'type') ? node.attrs.type : 'text';
      input.value = value ?? (input.type === 'checkbox' ? 'on' : '');
      if (input.type === 'checkbox') input.checked = Object.hasOwn(node.domProps, 'checked') && node.domProps.checked === true;
      input.disabled = disabled;
    } else if (node.tag === 'textarea') {
      const textarea = element as HTMLTextAreaElement;
      textarea.value = value ?? '';
      textarea.disabled = disabled;
    } else if (node.tag === 'button') {
      const button = element as HTMLButtonElement;
      button.type = 'button';
      button.disabled = disabled;
    }
    bindInitialEvents(scope, element, node.events);
    return element;
  }
  return create;
}

/** Validate and prepare the complete tree before connecting it. */
export function mountTree(container: Element, tree: VRoot, scope: DOMScope): void {
  assertDOMScope(container, scope);
  if (container.childNodes.length !== 0) throw new Error('Initial mount requires an empty container');
  validateRoot(tree, 'component');
  const prepared: Element[] = [];
  const create = nodeCreator(container.ownerDocument, scope, prepared);
  try {
    const fragment = container.ownerDocument.createDocumentFragment();
    for (const node of tree.children) fragment.appendChild(create(node));
    container.appendChild(fragment);
  } catch (error) {
    for (const node of prepared) releaseNodeBindings(scope, node);
    throw error;
  }
}

function samePlan(actual: unknown, expected: unknown): boolean {
  if (actual === expected) return true;
  if (actual === null || expected === null || typeof actual !== 'object' || typeof expected !== 'object') return false;
  if (Array.isArray(actual) !== Array.isArray(expected)) return false;
  const names = Reflect.ownKeys(expected);
  return Reflect.ownKeys(actual).length === names.length && names.every((name) => {
    if (!Object.hasOwn(actual, name)) return false;
    const value: unknown = Reflect.get(actual, name);
    const target: unknown = Reflect.get(expected, name);
    if (name === 'remove' && Array.isArray(value) && Array.isArray(target)) {
      return value.length === target.length && new Set(value).size === value.length
        && target.every((index: unknown) => value.includes(index));
    }
    return samePlan(value, target);
  });
}

function restoreForm(element: Element, node: VElement): void {
  const value = Object.hasOwn(node.domProps, 'value') ? node.domProps.value : undefined;
  const disabled = Object.hasOwn(node.domProps, 'disabled') && node.domProps.disabled === true;
  if (node.tag === 'input') {
    const input = element as HTMLInputElement;
    const type = Object.hasOwn(node.attrs, 'type') ? node.attrs.type : 'text';
    if (input.type !== type) input.type = type;
    const target = value ?? (type === 'checkbox' ? 'on' : '');
    if (input.value !== target) input.value = target;
    const checked = type === 'checkbox' && Object.hasOwn(node.domProps, 'checked') && node.domProps.checked === true;
    if (input.checked !== checked) input.checked = checked;
    if (input.disabled !== disabled) input.disabled = disabled;
  } else if (node.tag === 'textarea') {
    const textarea = element as HTMLTextAreaElement;
    if (textarea.value !== (value ?? '')) textarea.value = value ?? '';
    if (textarea.disabled !== disabled) textarea.disabled = disabled;
  } else if (node.tag === 'button') {
    const button = element as HTMLButtonElement;
    if (button.type !== 'button') button.type = 'button';
    if (button.disabled !== disabled) button.disabled = disabled;
  }
}

/** Apply a validated Diff plan. Unexpected DOM failures propagate to the owner for recovery. */
export function applyPlan(container: Element, plan: PatchPlan, scope: DOMScope): void {
  assertDOMScope(container, scope);
  // Reuse Diff's correspondence rules; removal order does not affect the contract.
  const expected = diff(plan.previous, plan.next);
  if (!samePlan(plan, expected)) throw new Error('Invalid PatchPlan');
  function validateAttributeNames(children: readonly VNode[]): void {
    for (const node of children) {
      if (node.kind !== 'element') continue;
      for (const name of Object.getOwnPropertyNames(node.attrs)) container.ownerDocument.createAttribute(name);
      validateAttributeNames(node.children);
    }
  }
  validateAttributeNames(plan.next.children);
  const prepared: Element[] = [];
  const create = nodeCreator(container.ownerDocument, scope, prepared);
  const snapshots = new Map<ChildrenPlan, readonly Node[]>();
  const replacements = new Map<object, Node>();

  function snapshot(parent: Node, children: ChildrenPlan, previous: readonly VNode[]): void {
    const nodes = Array.from(parent.childNodes);
    if (nodes.length !== previous.length) throw new Error('Managed DOM structure changed');
    snapshots.set(children, nodes);
    for (let index = 0; index < nodes.length; index += 1) {
      const node = previous[index];
      if (node.kind === 'text' ? nodes[index].nodeType !== 3
        : nodes[index].nodeType !== 1 || (nodes[index] as Element).localName !== node.tag) {
        throw new Error('Managed DOM structure changed');
      }
    }
    for (const placement of children.ordered) {
      if (placement.op === 'reuse' && placement.patch.op === 'element') {
        const old = previous[placement.oldIndex];
        if (old.kind !== 'element') throw new Error('Invalid element correspondence');
        snapshot(nodes[placement.oldIndex], placement.patch.children, old.children);
      }
    }
  }

  function prepare(children: ChildrenPlan): void {
    for (const placement of children.ordered) {
      if (placement.op !== 'reuse') replacements.set(placement, create(placement.next));
      else if (placement.patch.op === 'element') prepare(placement.patch.children);
    }
  }

  function release(node: Node): void {
    for (const child of Array.from(node.childNodes)) release(child);
    if (node.nodeType === 1) releaseNodeBindings(scope, node as Element);
  }

  function apply(parent: Node, children: ChildrenPlan): void {
    const nodes = snapshots.get(children)!;
    for (const index of children.remove) {
      release(nodes[index]);
      parent.removeChild(nodes[index]);
    }
    children.ordered.forEach((placement, index) => {
      let node: Node;
      if (placement.op !== 'reuse') {
        node = replacements.get(placement)!;
        if (placement.op === 'replace') {
          release(nodes[placement.oldIndex]);
          parent.removeChild(nodes[placement.oldIndex]);
        }
      } else {
        node = nodes[placement.oldIndex];
        const patch = placement.patch;
        if (patch.op === 'text') {
          if (node.nodeValue !== patch.next.value) node.nodeValue = patch.next.value;
        } else if (patch.op === 'element') {
          const element = node as Element;
          const next = patch.next;
          for (const attribute of Array.from(element.attributes)) {
            if (attribute.name === 'type' && next.tag === 'button' && !Object.hasOwn(next.attrs, 'type')) continue;
            if (attribute.name !== 'data-key' && !Object.hasOwn(next.attrs, attribute.name)
              && !['value', 'checked', 'disabled'].includes(attribute.name)) element.removeAttribute(attribute.name);
          }
          for (const name of Object.getOwnPropertyNames(next.attrs)) {
            const value = encodeAttribute(scope, name, next.attrs[name]);
            if (element.getAttribute(name) !== value) element.setAttribute(name, value);
          }
          if (next.key === undefined) {
            if (element.hasAttribute('data-key')) element.removeAttribute('data-key');
          } else if (element.getAttribute('data-key') !== next.key) element.setAttribute('data-key', next.key);
          updateNodeEvents(scope, element, next.events);
          apply(element, patch.children);
        }
      }
      if (parent.childNodes[index] !== node) parent.insertBefore(node, parent.childNodes[index] ?? null);
    });
  }

  function restore(parent: Node, children: readonly VNode[]): void {
    children.forEach((node, index) => {
      if (node.kind === 'element') {
        const element = parent.childNodes[index] as Element;
        restoreForm(element, node);
        restore(element, node.children);
      }
    });
  }

  try {
    snapshot(container, plan.children, plan.previous.children);
    prepare(plan.children);
    apply(container, plan.children);
    restore(container, plan.next.children);
  } catch (error) {
    for (const node of prepared) releaseNodeBindings(scope, node);
    throw error;
  }
}
