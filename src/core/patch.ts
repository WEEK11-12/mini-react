import { validateRoot, type VNode, type VRoot } from './vdom';
import { assertDOMScope, bindInitialEvents, encodeAttribute, releaseNodeBindings, type DOMScope } from './dom-bindings';

/** Initial creation only. Diff and incremental applyPlan are implemented in later stages. */
export function mountTree(container: Element, tree: VRoot, scope: DOMScope): void {
  assertDOMScope(container, scope);
  if (container.childNodes.length !== 0) throw new Error('Initial mount requires an empty container');
  validateRoot(tree, 'component');
  const document = container.ownerDocument;
  const prepared: Element[] = [];
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
  try {
    const fragment = document.createDocumentFragment();
    for (const node of tree.children) fragment.appendChild(create(node));
    container.appendChild(fragment);
  } catch (error) {
    for (const node of prepared) releaseNodeBindings(scope, node);
    throw error;
  }
}
