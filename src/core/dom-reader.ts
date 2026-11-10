import { HTML_NAMESPACE, isSupportedAttribute } from './dom-policy';
import { assertDOMScope, decodeAttribute, type DOMScope } from './dom-bindings';
import { validateRoot, type VNode, type VRoot } from './vdom';

export function readDOM(container: Element | DocumentFragment, scope?: DOMScope): VRoot {
  if (!container || ![1, 11].includes(container.nodeType)) throw new Error('Expected an Element or DocumentFragment');
  assertDOMScope(container, scope);
  function read(node: Node): VNode {
    if (node.nodeType === 3) return { kind: 'text', value: node.nodeValue ?? '' };
    if (node.nodeType !== 1) throw new Error('Unsupported DOM node');
    const element = node as Element;
    if (element.namespaceURI !== HTML_NAMESPACE) throw new Error('Unsupported namespace');
    const tag = element.localName;
    const attrs: Record<string, string> = {};
    let key: string | undefined;
    for (const attribute of Array.from(element.attributes)) {
      const { name, value } = attribute;
      if (!isSupportedAttribute(tag, name)) throw new Error('Unsupported HTML attribute');
      if (name === 'data-key') key = value;
      else if (!['value', 'checked', 'disabled'].includes(name)) attrs[name] = decodeAttribute(scope, name, value);
    }
    if (tag === 'input' || tag === 'button') {
      attrs.type = (attrs.type ?? (tag === 'input' ? 'text' : 'button'))
        .replace(/[A-Z]/g, (letter) => letter.toLowerCase());
    }
    const domProps: { value?: string; checked?: boolean; disabled?: boolean } = {};
    if (tag === 'input') {
      const input = element as HTMLInputElement;
      domProps.value = input.value;
      if (attrs.type === 'checkbox') domProps.checked = input.checked;
      else if (element.hasAttribute('checked')) throw new Error('checked requires a checkbox');
      domProps.disabled = input.disabled;
    } else if (tag === 'textarea') {
      domProps.value = (element as HTMLTextAreaElement).value;
      domProps.disabled = (element as HTMLTextAreaElement).disabled;
      if (Array.from(element.childNodes).some((child) => child.nodeType !== 3)) throw new Error('Unsupported textarea content');
    } else if (tag === 'button') {
      domProps.disabled = (element as HTMLButtonElement).disabled;
    }
    const children = tag === 'textarea' ? [] : Array.from(element.childNodes, read);
    return { kind: 'element', tag, ...(key === undefined ? {} : { key }), attrs, domProps, events: {}, children };
  }
  const tree: VRoot = { kind: 'root', children: Array.from(container.childNodes, read) };
  validateRoot(tree, 'html');
  return tree;
}
