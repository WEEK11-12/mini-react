export const text = (value) => ({ kind: 'text', value });

export const element = (tag, children = [], attrs = {}) => ({
  kind: 'element', tag, attrs, children, events: {}, domProps: {},
});

export const getKey = (node) => node.kind === 'element' && Object.hasOwn(node.attrs, 'data-key')
  ? node.attrs['data-key'] : undefined;

const record = (value) => value !== null && typeof value === 'object'
  && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));

export function validateVNode(tree) {
  const active = new Set();
  const invalid = () => { throw Object.assign(new Error('Invalid VNode'), { code: 'ERR_INVALID_VNODE' }); };
  function visit(node, root = false) {
    if (!record(node) || active.has(node)) invalid();
    if (node.kind === 'text') {
      if (root || typeof node.value !== 'string') invalid();
      return;
    }
    if (node.kind !== 'element' || typeof node.tag !== 'string'
      || !/^[a-z][a-z0-9-]*$/.test(node.tag) || !record(node.attrs)
      || Object.values(node.attrs).some((value) => typeof value !== 'string')
      || !Array.isArray(node.children)) invalid();
    if (Object.hasOwn(node.attrs, 'data-key') && node.attrs['data-key'] === '') invalid();
    for (const name of ['events', 'domProps']) {
      if (node[name] !== undefined && !record(node[name])) invalid();
    }
    if (Object.values(node.events ?? {}).some((handler) => typeof handler !== 'function')) invalid();
    active.add(node);
    const keys = new Set();
    for (const child of node.children) {
      visit(child);
      const key = getKey(child);
      if (key !== undefined) {
        if (keys.has(key)) {
          throw Object.assign(new Error('Duplicate sibling key'), { code: 'ERR_DUPLICATE_KEY' });
        }
        keys.add(key);
      }
    }
    active.delete(node);
  }
  visit(tree, true);
  return tree;
}

const sameMap = (a = {}, b = {}) => Object.keys(a).length === Object.keys(b).length
  && Object.keys(a).every((key) => Object.hasOwn(b, key) && Object.is(a[key], b[key]));

// Callers validate the complete trees once at their public boundary.
export function sameTree(a, b) {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'text') return a.value === b.value;
  return a.tag === b.tag && sameMap(a.attrs, b.attrs)
    && sameMap(a.events, b.events) && sameMap(a.domProps, b.domProps)
    && a.children.length === b.children.length
    && a.children.every((child, index) => sameTree(child, b.children[index]));
}
