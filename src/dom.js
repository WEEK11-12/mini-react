import { element, text, validateVNode } from './vnode.js';
import { isSupportedTag, isSupportedAttribute, isIgnoredText } from './html-policy.js';

const listeners = new WeakMap();
const phase2Tags = new Set(['button', 'input', 'label']);
const phase2Attributes = new Set(['id', 'type', 'min', 'max', 'step', 'name', 'for', 'placeholder', 'role', 'tabindex', 'disabled']);
const allowedAttribute = (name, phase) => isSupportedAttribute(name)
  || (phase === 2 && (phase2Attributes.has(name) || /^aria-[a-z][a-z0-9-]*$/.test(name)));
const eventName = name => /^[a-z]+$/.test(name);
const validProperty = (name, value) => name === 'value' ? typeof value === 'string'
  : name === 'checked' && typeof value === 'boolean';

function updateEvents(dom, set, remove = []) {
  const registered = listeners.get(dom) ?? new Map();
  for (const name of [...remove, ...Object.keys(set)]) {
    const old = registered.get(name);
    if (old && old !== set[name]) { dom.removeEventListener(name, old); registered.delete(name); }
  }
  for (const [name, handler] of Object.entries(set)) {
    if (registered.get(name) !== handler) { dom.addEventListener(name, handler); registered.set(name, handler); }
  }
  if (registered.size) listeners.set(dom, registered);
  else listeners.delete(dom);
}

export function releaseDom(root) {
  for (const [name, handler] of listeners.get(root) ?? []) root.removeEventListener(name, handler);
  listeners.delete(root);
  for (const child of root.childNodes) releaseDom(child);
}

function updateProperties(dom, set, remove = []) {
  for (const name of remove) {
    dom[name] = name === 'checked' ? false : '';
    if (name === 'value') dom.removeAttribute('value');
  }
  for (const [name, value] of Object.entries(set)) if (!Object.is(dom[name], value)) dom[name] = value;
}

function fail(code, message) { throw Object.assign(new Error(message), { code }); }
// This browser-added marker belongs to neither application UI nor HTML input.
const isExternalMarker = name => name === 'bis_skin_checked';
const attributes = node => Object.fromEntries([...node.attributes].filter(attr => !isExternalMarker(attr.name)).map(attr => [attr.name, attr.value]));
const sameAttributes = (dom, node) => [...dom.attributes].filter(attr => !isExternalMarker(attr.name) && !(attr.name === 'value' && Object.hasOwn(node.domProps ?? {}, 'value'))).length === Object.keys(node.attrs).length
  && Object.entries(node.attrs).every(([name, value]) => dom.getAttribute(name) === value);

function checkSupported(node, phase = 1) {
  if (node.kind === 'text') return;
  const events = node.events ?? {}, props = node.domProps ?? {};
  if ((!isSupportedTag(node.tag) && !(phase === 2 && phase2Tags.has(node.tag)))
    || Object.keys(node.attrs).some(name => !allowedAttribute(name, phase))
    || (phase !== 2 && (Object.keys(events).length || Object.keys(props).length))
    || Object.keys(events).some(name => !eventName(name))
    || Object.entries(props).some(([name, value]) => !validProperty(name, value))
    || (Object.keys(props).length && node.tag !== 'input')
    || (node.tag === 'input' && node.children.length)) {
    const unsupported = Object.keys(node.attrs).filter(name => !allowedAttribute(name, phase));
    fail('ERR_INVALID_HTML', `이 렌더링 범위에서 지원하지 않는 요소·속성·프로퍼티입니다. 태그: <${node.tag}>${unsupported.length ? `, 미지원 속성: ${unsupported.join(', ')}` : ''}`);
  }
  node.children.forEach(child => checkSupported(child, phase));
}

export function validateDomTree(tree, { phase = 1 } = {}) {
  validateVNode(tree);
  checkSupported(tree, phase);
  return tree;
}

export function readDom(root) {
  function read(node) {
    if (node.nodeType === 8 || (node.nodeType === 3 && isIgnoredText(node.nodeValue))) return null;
    if (node.nodeType === 3) return text(node.nodeValue);
    if (node.nodeType !== 1) fail('ERR_INVALID_HTML', '요소와 텍스트만 읽을 수 있습니다.');
    return element(node.localName, [...node.childNodes].map(read).filter(child => child !== null), attributes(node));
  }
  const tree = read(root);
  validateVNode(tree);
  checkSupported(tree);
  return tree;
}

export function render(tree, document = globalThis.document, { phase = 1 } = {}) {
  validateVNode(tree?.kind === 'text' ? element('div', [tree]) : tree);
  checkSupported(tree, phase);
  function build(node) {
    if (node.kind === 'text') return document.createTextNode(node.value);
    const dom = document.createElement(node.tag);
    for (const [name, value] of Object.entries(node.attrs)) dom.setAttribute(name, value);
    for (const child of node.children) dom.append(build(child));
    updateEvents(dom, node.events ?? {});
    updateProperties(dom, node.domProps ?? {});
    return dom;
  }
  return build(tree);
}

const pathKey = path => path.join('/');
const matches = (dom, node) => node.kind === 'text'
  ? dom.nodeType === 3 && dom.nodeValue === node.value
  : dom.nodeType === 1 && dom.localName === node.tag;
const ignored = dom => dom.nodeType === 8 || (dom.nodeType === 3 && isIgnoredText(dom.nodeValue));

// Resolve every old path before writes; child indices must not shift underneath later operations.
function collect(root, tree) {
  const nodes = new Map(), children = new Map();
  function visit(dom, node, path) {
    if (!dom || !matches(dom, node) || (node.kind === 'element' && !sameAttributes(dom, node))) {
      fail('ERR_DOM_MISMATCH', '실제 영역이 이전 Virtual DOM과 다릅니다.');
    }
    nodes.set(pathKey(path), dom);
    if (node.kind === 'text') return;
    const actual = [...dom.childNodes], managed = [];
    let cursor = 0;
    node.children.forEach((child, index) => {
      while (actual[cursor] && ignored(actual[cursor]) && !matches(actual[cursor], child)) cursor++;
      const target = actual[cursor++];
      visit(target, child, [...path, index]);
      managed.push(target);
    });
    if (actual.slice(cursor).some(child => !ignored(child))) fail('ERR_DOM_MISMATCH', '예상하지 못한 DOM 자식이 있습니다.');
    children.set(pathKey(path), managed);
  }
  visit(root, tree, []);
  return { nodes, children };
}

export function patch(root, plan, { phase = 1 } = {}) {
  if (!plan || !Array.isArray(plan.operations)) fail('ERR_INVALID_PLAN', '변경 계획이 필요합니다.');
  validateDomTree(plan.previous, { phase }); validateDomTree(plan.next, { phase });
  const { nodes, children } = collect(root, plan.previous);
  const groups = new Map(), updates = [];
  let replacement;
  const invalid = () => fail('ERR_INVALID_PLAN', '변경 계획의 경로·종류·목표가 올바르지 않습니다.');
  function group(path) {
    const key = pathKey(path);
    if (!children.has(key)) invalid();
    if (!groups.has(key)) groups.set(key, { path, parent: nodes.get(key), old: children.get(key), consumed: new Set(), discard: new Set(), placements: new Map(), delta: 0 });
    return groups.get(key);
  }
  for (const op of plan.operations) {
    if (!op || !Array.isArray(op.path) || op.path.some(index => !Number.isInteger(index) || index < 0)
      || !nodes.has(pathKey(op.path))) invalid();
    const dom = nodes.get(pathKey(op.path));
    if (op.type === 'text') {
      if (dom.nodeType !== 3 || typeof op.value !== 'string') invalid();
      updates.push(() => { if (dom.nodeValue !== op.value) dom.nodeValue = op.value; });
    } else if (op.type === 'attrs') {
      if (dom.nodeType !== 1 || !op.set || !Array.isArray(op.remove)
        || Object.entries(op.set).some(([name, value]) => !allowedAttribute(name, phase) || typeof value !== 'string')
        || op.remove.some(name => typeof name !== 'string' || !allowedAttribute(name, phase))) invalid();
      updates.push(() => {
        for (const name of op.remove) dom.removeAttribute(name);
        for (const [name, value] of Object.entries(op.set)) if (dom.getAttribute(name) !== value) dom.setAttribute(name, value);
      });
    } else if (phase === 2 && (op.type === 'events' || op.type === 'domProps')) {
      if (dom.nodeType !== 1 || !op.set || !Array.isArray(op.remove)) invalid();
      if (op.type === 'events') {
        if (Object.entries(op.set).some(([name, handler]) => !eventName(name) || typeof handler !== 'function')
          || op.remove.some(name => typeof name !== 'string' || !eventName(name))) invalid();
        updates.push(() => updateEvents(dom, op.set, op.remove));
      } else {
        if (dom.localName !== 'input' || Object.entries(op.set).some(([name, value]) => !validProperty(name, value))
          || op.remove.some(name => !['value', 'checked'].includes(name))) invalid();
        updates.push(() => updateProperties(dom, op.set, op.remove));
      }
    } else if (['insert', 'remove', 'move', 'replace'].includes(op.type)) {
      if (op.type === 'replace' && op.path.length === 0) {
        if (plan.operations.length !== 1 || op.index !== null) invalid();
        replacement = render(op.node, root.ownerDocument, { phase });
        continue;
      }
      if (op.type !== 'insert' && op.path.length === 0) invalid();
      if (op.type !== 'remove' && (!Number.isInteger(op.index) || op.index < 0)) invalid();
      const target = group(op.type === 'insert' ? op.path : op.path.slice(0, -1));
      if (op.type !== 'insert') {
        if (target.consumed.has(dom)) invalid();
        target.consumed.add(dom);
      }
      if (op.type === 'remove' || op.type === 'replace') target.discard.add(dom);
      if (op.type === 'remove') target.delta--;
      else {
        if (target.placements.has(op.index)) invalid();
        target.placements.set(op.index, op.type === 'move' ? dom : render(op.node, root.ownerDocument, { phase }));
        if (op.type === 'insert') target.delta++;
      }
    } else invalid();
  }
  for (const target of groups.values()) {
    const length = target.old.length + target.delta;
    if (length < 0 || [...target.placements.keys()].some(index => index >= length)) invalid();
    const remaining = target.old.filter(dom => !target.consumed.has(dom));
    let remainingIndex = 0;
    target.next = Array.from({ length }, (_, index) => target.placements.get(index) ?? remaining[remainingIndex++]);
    if (remainingIndex !== remaining.length || target.next.some(dom => !dom)) invalid();
  }
  if (replacement) {
    if (root.parentNode) root.parentNode.replaceChild(replacement, root);
    releaseDom(root);
    collect(replacement, plan.next);
    return replacement;
  }
  const focused = root.ownerDocument.activeElement;
  const selection = focused && root.contains(focused) ? { node: focused, value: focused.value, start: focused.selectionStart, end: focused.selectionEnd, direction: focused.selectionDirection } : null;
  updates.forEach(update => update());
  for (const target of [...groups.values()].sort((a, b) => b.path.length - a.path.length)) {
    for (const dom of target.discard) { target.parent.removeChild(dom); releaseDom(dom); }
    const wanted = new Set(target.next);
    let cursor = target.parent.firstChild;
    target.next.forEach(dom => {
      while (cursor && !wanted.has(cursor)) cursor = cursor.nextSibling;
      if (cursor === dom) cursor = cursor.nextSibling;
      else target.parent.insertBefore(dom, cursor);
    });
  }
  const finalNodes = collect(root, plan.next).nodes;
  function synchronize(node, path = []) {
    if (node.kind === 'text') return;
    updateProperties(finalNodes.get(pathKey(path)), node.domProps ?? {});
    node.children.forEach((child, index) => synchronize(child, [...path, index]));
  }
  synchronize(plan.next);
  if (selection?.node.isConnected && root.contains(selection.node)) {
    if (root.ownerDocument.activeElement !== selection.node) selection.node.focus({ preventScroll: true });
    if (selection.start !== null && selection.start !== undefined && selection.value === selection.node.value) {
      selection.node.setSelectionRange(selection.start, selection.end, selection.direction);
    }
  }
  return root;
}
