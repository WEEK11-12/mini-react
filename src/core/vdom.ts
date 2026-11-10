import { HTML_SPACE, ID_LISTS, ID_REFERENCES, TAGS, idTokens, isSupportedAttribute } from './dom-policy';

export type EventName = 'click' | 'input' | 'change';
export type Handler = (event: Event) => void;
export interface VText { readonly kind: 'text'; readonly value: string }
export interface VElement {
  readonly kind: 'element';
  readonly tag: string;
  readonly key?: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly domProps: Readonly<{ value?: string; checked?: boolean; disabled?: boolean }>;
  readonly events: Readonly<Partial<Record<EventName, Handler>>>;
  readonly children: readonly VNode[];
}
export type VNode = VText | VElement;
export interface VRoot { readonly kind: 'root'; readonly children: readonly VNode[] }

export function text(value: string | number): VText {
  if (typeof value !== 'string' && typeof value !== 'number') throw new Error('Text requires a string or number');
  return { kind: 'text', value: String(value) };
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a record');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error('Expected a plain record');
  return value as Record<string, unknown>;
}

function fields(value: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(value).some((name) => !allowed.includes(name))) throw new Error('Unsupported VNode field');
}

/** Validate the complete normalized tree without changing it or touching DOM. */
export function validateRoot(input: unknown, mode: 'html' | 'component'): asserts input is VRoot {
  if (mode !== 'html' && mode !== 'component') throw new Error('Invalid validation mode');
  const root = record(input);
  fields(root, ['kind', 'children']);
  if (root.kind !== 'root') throw new Error('Expected a VRoot');
  const ids = new Map<string, string>();
  const references: { target: string; label: boolean }[] = [];
  const ancestors = new Set<object>();

  function visitChildren(children: unknown): void {
    if (!Array.isArray(children)) throw new Error('children must be an array');
    const keys = new Set<string>();
    // Index iteration also rejects holes, which array.forEach would silently skip.
    for (let index = 0; index < children.length; index += 1) {
      const node = record(children[index]);
      visit(node);
      if (node.kind === 'element' && node.key !== undefined) {
        const key = node.key as string; // visit validated this value.
        if (keys.has(key)) throw new Error('Duplicate sibling key');
        keys.add(key);
      }
    }
  }

  function visit(node: Record<string, unknown>): void {
    if (ancestors.has(node)) throw new Error('Cyclic VNode');
    ancestors.add(node);
    try {
      if (node.kind === 'text') {
        fields(node, ['kind', 'value']);
        if (typeof node.value !== 'string') throw new Error('Invalid text value');
        return;
      }
      fields(node, ['kind', 'tag', 'key', 'attrs', 'domProps', 'events', 'children']);
      if (node.kind !== 'element' || typeof node.tag !== 'string' || !TAGS.has(node.tag)) throw new Error('Unsupported element');
      const tag = node.tag;
      if (node.key !== undefined && (typeof node.key !== 'string' || node.key.length === 0 || /[\u0000\uD800-\uDFFF]/u.test(node.key))) {
        throw new Error('Invalid key');
      }
      const attrs = record(node.attrs);
      const props = record(node.domProps);
      const events = record(node.events);
      for (const name of Reflect.ownKeys(attrs)) {
        if (typeof name !== 'string') throw new Error('Unsupported attribute name');
        const value = attrs[name];
        if (!isSupportedAttribute(tag, name) || ['data-key', 'value', 'checked', 'disabled'].includes(name) || typeof value !== 'string') {
          throw new Error('Unsupported or duplicate attribute');
        }
        if (name === 'id') {
          if (!value || HTML_SPACE.test(value) || ids.has(value)) throw new Error('Invalid or duplicate ID');
          ids.set(value, tag);
        }
        if (ID_REFERENCES.has(name) || ID_LISTS.has(name)) {
          const tokens = idTokens(value);
          if (tokens.length === 0 || (ID_REFERENCES.has(name) && (tokens.length !== 1 || value !== tokens[0]))) throw new Error('Invalid ID reference');
          references.push(...tokens.map((target) => ({ target, label: name === 'for' })));
        }
      }
      const type = Object.hasOwn(attrs, 'type') ? attrs.type : undefined;
      if (tag === 'input' && type !== undefined && !['text', 'checkbox'].includes(String(type))) throw new Error('Unsupported input type');
      if (tag === 'button' && type !== undefined && type !== 'button') throw new Error('Unsupported button type');
      for (const name of Reflect.ownKeys(props)) {
        if (typeof name !== 'string') throw new Error('Unsupported DOM property name');
        const value = props[name];
        const supported = (name === 'disabled' && ['input', 'button', 'textarea'].includes(tag))
          || (name === 'value' && ['input', 'textarea'].includes(tag))
          || (name === 'checked' && tag === 'input' && type === 'checkbox');
        if (!supported || (name === 'value' ? typeof value !== 'string' : typeof value !== 'boolean')) throw new Error('Unsupported DOM property');
        // Native setters sanitize these line endings; normalized VDOM must already match.
        if (name === 'value' && typeof value === 'string'
          && (tag === 'textarea' ? /\r/.test(value) : type !== 'checkbox' && /[\r\n]/.test(value))) {
          throw new Error('Non-normalized form value');
        }
      }
      for (const name of Reflect.ownKeys(events)) {
        if (mode === 'html' || typeof name !== 'string'
          || !['click', 'input', 'change'].includes(name) || typeof events[name] !== 'function') throw new Error('Unsupported event');
      }
      if (['input', 'br', 'textarea'].includes(tag) && (!Array.isArray(node.children) || node.children.length !== 0)) throw new Error('Element cannot have VNode children');
      visitChildren(node.children);
    } finally {
      ancestors.delete(node);
    }
  }
  visitChildren(root.children);
  for (const { target, label } of references) {
    const tag = ids.get(target);
    if (!tag || (label && !['input', 'button', 'textarea'].includes(tag))) throw new Error('Missing or unsuitable ID target');
  }
}
