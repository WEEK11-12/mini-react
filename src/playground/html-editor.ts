import { readDOM } from '../core/dom-reader';
import { validateRoot, type VNode, type VRoot } from '../core/vdom';

export function parseHTML(html: string, document: Document): VRoot {
  const template = document.createElement('template');
  template.innerHTML = html;
  return readDOM(template.content);
}

export function serializeHTML(tree: VRoot): string {
  validateRoot(tree, 'html');
  const escape = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\r/g, '&#13;');
  function serialize(node: VNode): string {
    if (node.kind === 'text') return escape(node.value);
    const attrs: Record<string, string> = Object.fromEntries(Object.getOwnPropertyNames(node.attrs).map((name) => [name, node.attrs[name]]));
    if (node.key !== undefined) attrs['data-key'] = node.key;
    if (node.tag === 'input') attrs.value = node.domProps.value ?? '';
    if (node.domProps.checked) attrs.checked = '';
    if (node.domProps.disabled) attrs.disabled = '';
    const opening = `<${node.tag}${Object.entries(attrs).map(([name, value]) => ` ${name}="${escape(value)}"`).join('')}>`;
    if (node.tag === 'input' || node.tag === 'br') return opening;
    // HTML parsing strips the first newline immediately after a textarea start tag.
    const content = node.tag === 'textarea' ? `\n${escape(node.domProps.value ?? '')}` : node.children.map(serialize).join('');
    return `${opening}${content}</${node.tag}>`;
  }
  return tree.children.map(serialize).join('');
}
