import { ID_LISTS, ID_REFERENCES, idTokens, normalizeAttribute } from './dom-policy';
import type { EventName, Handler } from './vdom';

// A scope is an identity token; its mappings and container are never exposed to VDOM.
export type DOMScope = object;
interface ScopeData {
  container: Element;
  prefix: string;
  nextId: number;
  forward: Map<string, string>;
  reverse: Map<string, string>;
  events: Map<Element, Map<EventName, Handler>>;
}
const scopes = new Map<DOMScope, ScopeData>();
let nextScope = 0;

export function createDOMScope(container: Element): DOMScope {
  if (!container || container.nodeType !== 1) throw new Error('Scope requires an Element');
  for (const data of scopes.values()) {
    if (container.contains(data.container) || data.container.contains(container)) throw new Error('Overlapping DOM scopes');
  }
  const scope = Object.freeze({});
  scopes.set(scope, {
    container, prefix: `mini-react-${++nextScope}`, nextId: 0,
    forward: new Map(), reverse: new Map(), events: new Map(),
  });
  return scope;
}

function dataFor(scope: DOMScope): ScopeData {
  const data = scopes.get(scope);
  if (!data) throw new Error('Unknown or released DOM scope');
  return data;
}

export function assertDOMScope(container: Element | DocumentFragment, scope?: DOMScope): void {
  if (scope !== undefined) {
    if (dataFor(scope).container !== container) throw new Error('DOM scope belongs to another container');
    return;
  }
  for (const data of scopes.values()) {
    if (data.container.contains(container) || container.contains(data.container)) throw new Error('Managed DOM requires its own scope');
  }
}

function actualId(data: ScopeData, logical: string): string {
  const existing = data.forward.get(logical);
  if (existing !== undefined) return existing;
  let actual: string;
  do { actual = `${data.prefix}-${++data.nextId}`; } while (data.container.ownerDocument.getElementById(actual));
  data.forward.set(logical, actual);
  data.reverse.set(actual, logical);
  return actual;
}

export function encodeAttribute(scope: DOMScope, name: string, value: string): string {
  const data = dataFor(scope);
  if (name === 'id' || ID_REFERENCES.has(name)) return actualId(data, value);
  if (ID_LISTS.has(name)) return idTokens(value).map((token) => actualId(data, token)).join(' ');
  return value;
}

export function decodeAttribute(scope: DOMScope | undefined, name: string, value: string): string {
  if (scope === undefined) return normalizeAttribute(name, value);
  const data = dataFor(scope);
  const decode = (actual: string): string => {
    const logical = data.reverse.get(actual);
    if (logical === undefined) throw new Error('ID was not issued by this DOM scope');
    return logical;
  };
  if (name === 'id' || ID_REFERENCES.has(name)) return decode(value);
  if (ID_LISTS.has(name)) return idTokens(value).map(decode).join(' ');
  return value;
}

export function bindInitialEvents(scope: DOMScope, node: Element, events: Readonly<Partial<Record<EventName, Handler>>>): void {
  const data = dataFor(scope);
  const attached = new Map<EventName, Handler>();
  data.events.set(node, attached);
  try {
    for (const name of ['click', 'input', 'change'] as const) {
      if (!Object.hasOwn(events, name)) continue;
      const handler = events[name];
      if (handler !== undefined) {
        node.addEventListener(name, handler);
        attached.set(name, handler);
      }
    }
  } catch (error) {
    releaseNodeBindings(scope, node);
    throw error;
  }
}

export function releaseNodeBindings(scope: DOMScope, node: Element): void {
  const data = dataFor(scope);
  const attached = data.events.get(node);
  if (attached) {
    for (const [name, handler] of attached) node.removeEventListener(name, handler);
    data.events.delete(node);
  }
}

export function releaseDOMScope(scope: DOMScope): void {
  const data = dataFor(scope);
  if (data.container.childNodes.length !== 0) throw new Error('Empty the managed DOM before releasing its scope');
  for (const node of data.events.keys()) releaseNodeBindings(scope, node);
  data.forward.clear();
  data.reverse.clear();
  scopes.delete(scope);
}
