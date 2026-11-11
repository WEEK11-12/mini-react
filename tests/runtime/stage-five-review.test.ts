import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FunctionComponent } from '../../src/core/component';
import { h, normalizeChildren, type Child, type Props, type VElement } from '../../src/core/vdom';
import { createDOMScope, releaseDOMScope } from '../../src/core/dom-bindings';

// Stage 5 deliberately imports no Hook module. Only real product modules are exercised.
let host: HTMLDivElement;
const roots: FunctionComponent<unknown>[] = [];
function root<P>(render: (props: P) => Child): FunctionComponent<P> {
  const instance = new FunctionComponent(render);
  roots.push(instance as FunctionComponent<unknown>);
  return instance;
}
beforeEach(() => { host = document.createElement('div'); document.body.append(host); });
afterEach(() => {
  vi.restoreAllMocks();
  for (const instance of roots.splice(0)) instance.unmount();
});
function node(selector: string): Element {
  const found = host.querySelector(selector);
  if (!found) throw new Error(`Expected element: ${selector}`);
  return found;
}
function observation(): MutationObserver {
  const observer = new MutationObserver(() => undefined);
  observer.observe(host, { childList: true, subtree: true, characterData: true, attributes: true });
  return observer;
}
function errorTree(error: unknown): unknown[] {
  if (!error || typeof error !== 'object') return [error];
  const errors = error instanceof AggregateError ? Array.from(error.errors).flatMap(errorTree) : [];
  const cause = 'cause' in error ? errorTree(error.cause) : [];
  return [error, ...errors, ...cause];
}

describe('stage 5: component, h and Props contracts', () => {
  it('[COMP-01 COMP-02 TECH-03 TECH-04 PATCH-03] pure child Props updates reuse parent, text and unaffected sibling', () => {
    const seen: Props[] = [];
    const ChildComponent = (props: Props): Child => { seen.push(props); return h('p', null, String(props.label)); };
    const instance = root(({ label }: { label: string }) => h('section', null, h(ChildComponent, { label }), h('span', null, 'stable')));
    instance.mount(host, { label: 'first' });
    const before = [node('section'), node('p'), node('p').firstChild, node('span')];
    expect(instance.phase).toBe('idle');
    expect(instance.hooks).toEqual([]);
    instance.update({ label: 'second' });
    expect(host.textContent).toBe('secondstable');
    [node('section'), node('p'), node('p').firstChild, node('span')].forEach((entry, index) => expect(entry).toBe(before[index]));
    expect(seen.map(props => props.label)).toEqual(['first', 'second']);
    instance.update();
    expect(seen.at(-1)?.label).toBe('second');
  });

  it('[COMP-01] empty, text, number and nested multiple roots flatten in order without wrappers', () => {
    const instance = root(({ empty }: { empty: boolean }) => empty ? [null, false, true, []] : [h('p', null, 'a'), [null, ' ', 0, [false, h('span', null, 'b')]], '']);
    instance.mount(host, { empty: true });
    expect(host.childNodes.length).toBe(0);
    instance.update({ empty: false });
    expect(host.childNodes.length).toBe(5);
    expect(Array.from(host.childNodes, entry => entry.nodeType)).toEqual([1, 3, 3, 1, 3]);
    expect(host.textContent).toBe('a 0b');
    instance.update({ empty: true });
    expect(host.childNodes.length).toBe(0);
  });

  it('[COMP-02] child receives variadic or props.children; unkeyed empty/text/array output works', () => {
    const seen: Props[] = [];
    const ChildComponent = (props: Props): Child => { seen.push(props); return props.children ?? []; };
    const supplied = [h('p', null, 'a'), 'b'];
    const instance = root(() => [h(ChildComponent, { extra: 1 }, ...supplied), h(ChildComponent, { children: ['c', null, false, [2]] }), h(() => null, null)]);
    instance.mount(host, {});
    expect(host.textContent).toBe('abc2');
    expect(seen[0].children).toEqual(supplied);
    expect(seen[0].extra).toBe(1);
    expect(seen[1].children).toEqual(['c', null, false, [2]]);
  });

  it.each(['p', (props: Props): Child => props.children ?? []])('[COMP-02] duplicate children reject before executing host or child: %s', type => {
    expect(() => h(type, { children: [] }, 'also supplied')).toThrow();
  });

  it('[COMP-02] host fields carry attrs, DOM properties and native callbacks', () => {
    const click = vi.fn(); const input = vi.fn(); const change = vi.fn();
    const instance = root(() => [h('button', { attrs: { title: 'button' }, events: { click } }, 'go'), h('input', { attrs: { type: 'checkbox' }, domProps: { value: 'v', checked: true, disabled: false }, events: { input, change } })]);
    instance.mount(host, {});
    expect(node('button').getAttribute('title')).toBe('button');
    const field = node('input') as HTMLInputElement;
    expect([field.value, field.checked, field.disabled]).toEqual(['v', true, false]);
    node('button').dispatchEvent(new Event('click')); field.dispatchEvent(new Event('input')); field.dispatchEvent(new Event('change'));
    expect([click.mock.calls.length, input.mock.calls.length, change.mock.calls.length]).toEqual([1, 1, 1]);
  });

  it.each([{ title: 'wrong-level' }, { attrs: { key: 'k' } }, { attrs: { 'data-key': 'k' } }])('[COMP-02] unsupported host props reject: %j', props => {
    expect(() => h('p', props)).toThrow();
  });

  it.each([undefined, 'same'])('[COMP-02] external key is removed from Props and applied to a copied host; inner key=%s', inner => {
    const original = h('li', { key: inner }, 'item') as VElement;
    Object.freeze(original);
    const child = vi.fn((props: Props): Child => { expect(Object.hasOwn(props, 'key')).toBe(false); expect(props.label).toBe('item'); return original; });
    const output = h(child, { key: 'same', label: 'item' }) as VElement;
    expect(output).not.toBe(original);
    expect(output.key).toBe('same'); expect(original.key).toBe(inner);
    const instance = root(() => h('ul', null, output)); instance.mount(host, {});
    expect(node('li').getAttribute('data-key')).toBe('same');
  });

  it.each(['empty', 'text', 'multiple', 'conflicting'] as const)('[COMP-02] keyed child %s rejects while prior Props and DOM remain retryable', kind => {
    const invalid = (): Child => kind === 'empty' ? null : kind === 'text' ? 'text' : kind === 'multiple' ? [h('p', null), h('p', null)] : h('p', { key: 'inner' });
    const instance = root(({ bad }: { bad: boolean }) => bad ? h(invalid, { key: 'outer' }) : h('p', null, 'good'));
    instance.mount(host, { bad: false }); const previous = node('p'); const observer = observation();
    try { expect(() => instance.update({ bad: true })).toThrow(); expect(observer.takeRecords()).toHaveLength(0); } finally { observer.disconnect(); }
    expect(node('p')).toBe(previous); expect(instance.phase).toBe('idle');
    instance.update(); expect(host.textContent).toBe('good');
  });

  it.each(['', 'bad\u0000key', '\ud800'])('[COMP-02] invalid external key %j rejects before DOM writes', key => {
    const instance = root(() => h(() => h('p', null), { key }));
    const observer = observation();
    try { expect(() => instance.mount(host, {})).toThrow(); expect(observer.takeRecords()).toHaveLength(0); } finally { observer.disconnect(); }
    expect(instance.phase).toBe('unmounted');
    const scope = createDOMScope(host); releaseDOMScope(scope);
  });

  it('[COMP-02 DIFF-01 PATCH-03] keyed reorder/insert/remove reuses every surviving object; updated callbacks replace old ones', () => {
    const calls: string[] = [];
    const ChildComponent = (props: Props): Child => h('button', { events: { click: props.onClick }, attrs: { title: props.version } }, String(props.label));
    const instance = root(({ order, version }: { order: string[]; version: string }) => order.map(key => h(ChildComponent, { key, label: `${key}:${version}`, version, onClick: () => calls.push(`${key}:${version}`) })));
    instance.mount(host, { order: ['a', 'b', 'c'], version: 'old' });
    const refs = Array.from(host.children); refs[0].dispatchEvent(new Event('click'));
    instance.update({ order: ['c', 'new', 'a'], version: 'new' });
    expect(host.children.length).toBe(3);
    expect(Array.from(host.children, entry => entry.getAttribute('data-key'))).toEqual(['c', 'new', 'a']);
    expect(host.children[0]).toBe(refs[2]); expect(host.children[2]).toBe(refs[0]); expect(host.children[1]).not.toBe(refs[1]);
    refs[0].dispatchEvent(new Event('click')); refs[1].dispatchEvent(new Event('click')); refs[2].dispatchEvent(new Event('click'));
    expect(calls).toEqual(['a:old', 'a:new', 'c:new']);
    expect(Array.from(host.children, entry => entry.textContent)).toEqual(['c:new', 'new:new', 'a:new']);
  });

  it('[COMP-02 PATCH-03] same child key and tag survive function type change, but changed key replaces the DOM', () => {
    const A = (): Child => h('p', null, 'A'); const B = (): Child => h('p', null, 'B');
    const instance = root(({ version, key }: { version: boolean; key: string }) => h(version ? B : A, { key }));
    instance.mount(host, { version: false, key: 'a' }); const previous = node('p');
    instance.update({ version: true, key: 'a' }); expect(node('p')).toBe(previous); expect(host.textContent).toBe('B');
    instance.update({ version: true, key: 'b' }); expect(node('p')).not.toBe(previous);
  });

  it('[PATCH-03 QA-04] no-op Props update makes no DOM mutations and keeps each child object', () => {
    const instance = root(() => h('section', null, h('button', { key: 'a' }, 'a'), h('input', { key: 'b', domProps: { value: 'b' } })));
    instance.mount(host, {}); const refs = Array.from(host.querySelectorAll('*')); const observer = observation();
    try { instance.update(); expect(observer.takeRecords()).toHaveLength(0); } finally { observer.disconnect(); }
    const after = Array.from(host.querySelectorAll('*')); expect(after.length).toBe(refs.length); after.forEach((entry, index) => expect(entry).toBe(refs[index]));
  });

  it('[COMP-02 DIFF-01] duplicate keys after flattening reject, but identical keys in distinct parents are valid', () => {
    const instance = root(({ bad }: { bad: boolean }) => bad ? [h('p', { key: 'a' }), [h('p', { key: 'a' })]] : [h('section', null, h('p', { key: 'a' })), h('article', null, h('p', { key: 'a' }))]);
    instance.mount(host, { bad: false }); const refs = Array.from(host.children);
    expect(() => instance.update({ bad: true })).toThrow(); expect(host.children[0]).toBe(refs[0]); expect(host.children[1]).toBe(refs[1]);
  });
});

describe('stage 5: lifecycle, dedicated scope and render errors', () => {
  it('[TECH-03 TECH-04] misuse guards, idempotent unmount and fresh remount preserve unrelated DOM', () => {
    const outside = document.createElement('aside'); document.body.append(outside);
    const click = vi.fn();
    const instance = root(({ value }: { value: string }) => h('button', { attrs: { id: 'logical' }, events: { click } }, value));
    expect(instance.phase).toBe('unmounted'); expect(() => instance.update()).toThrow(); instance.unmount();
    instance.mount(host, { value: 'first' }); const old = node('button'); const id = old.id;
    expect(() => instance.mount(host, { value: 'bad' })).toThrow(); expect(node('button')).toBe(old);
    instance.unmount(); expect(host.childNodes.length).toBe(0); old.dispatchEvent(new Event('click')); expect(click).not.toHaveBeenCalled();
    expect(instance.phase).toBe('unmounted'); instance.unmount(); expect(() => instance.update()).toThrow();
    const scope = createDOMScope(host); releaseDOMScope(scope);
    instance.mount(host, { value: 'fresh' }); expect(node('button')).not.toBe(old); expect(node('button').id).not.toBe(id); expect(outside.isConnected).toBe(true);
  });

  it('[COMP-01] a nonempty container is rejected unchanged without reserving its scope', () => {
    const original = document.createElement('p'); host.append(original);
    const instance = root(() => null); expect(() => instance.mount(host, {})).toThrow(); expect(host.firstChild).toBe(original);
    host.replaceChildren(); const scope = createDOMScope(host); releaseDOMScope(scope);
  });

  it('[COMP-01] external overlapping scope is rejected and is not released by failed mount', () => {
    const scope = createDOMScope(host); const instance = root(() => null);
    try { expect(() => instance.mount(host, {})).toThrow(); expect(instance.phase).toBe('unmounted'); expect(() => createDOMScope(host)).toThrow(); } finally { releaseDOMScope(scope); }
    instance.mount(host, {});
  });

  it('[COMP-01 COMP-02] separate roots isolate logical ID/label bindings; removing one does not affect another', () => {
    const other = document.createElement('div'); document.body.append(other);
    const render = (): Child => [h('label', { attrs: { for: 'field' } }, 'toggle'), h('input', { attrs: { id: 'field', type: 'checkbox' } })];
    const a = root(render); const b = root(render); a.mount(host, {}); b.mount(other, {});
    const inputA = node('input'); const inputB = other.querySelector('input')!;
    expect(inputA.id).not.toBe(inputB.id); expect((node('label') as HTMLLabelElement).control).toBe(inputA); expect(other.querySelector('label')!.control).toBe(inputB);
    a.unmount(); b.update(); expect(other.querySelector('input')).toBe(inputB);
  });

  it.each(['throw', 'validation'] as const)('[COMP-01] initial %s failure releases scope and permits a valid retry', kind => {
    const instance = root(({ bad }: { bad: boolean }) => { if (bad && kind === 'throw') throw new Error('render error'); return bad ? h('unsupported', null) : h('p', null, 'retry'); });
    expect(() => instance.mount(host, { bad: true })).toThrow(); expect(instance.phase).toBe('unmounted'); expect(host.childNodes.length).toBe(0);
    const scope = createDOMScope(host); releaseDOMScope(scope);
    instance.mount(host, { bad: false }); expect(host.textContent).toBe('retry');
  });

  it.each(['throw', 'validation'] as const)('[COMP-02] update %s error preserves successful Props, DOM objects and callback', kind => {
    const calls: string[] = [];
    const instance = root(({ label, bad }: { label: string; bad: boolean }) => { if (bad && kind === 'throw') throw new Error('render failure'); return h('button', { events: { click: () => calls.push(label) } }, bad ? h('unsupported', null) : label); });
    instance.mount(host, { label: 'old', bad: false }); const previous = node('button'); const observer = observation();
    try { expect(() => instance.update({ label: 'bad', bad: true })).toThrow(); expect(observer.takeRecords()).toHaveLength(0); } finally { observer.disconnect(); }
    expect(instance.phase).toBe('idle'); expect(node('button')).toBe(previous); previous.dispatchEvent(new Event('click')); expect(calls).toEqual(['old']);
    instance.update(); expect(host.textContent).toBe('old'); expect(node('button')).toBe(previous);
  });

  it.each(['mount', 'update', 'unmount'] as const)('[TECH-03] rendering-time %s rejects before resource/state changes', method => {
    const instance = root(({ attempt }: { attempt: boolean }) => {
      if (attempt) {
        if (method === 'mount') instance.mount(host, { attempt: false });
        else if (method === 'update') instance.update({ attempt: false });
        else instance.unmount();
      }
      return h('p', null, 'alive');
    });
    instance.mount(host, { attempt: false }); const previous = node('p');
    expect(() => instance.update({ attempt: true })).toThrow(); expect(instance.phase).toBe('idle'); expect(node('p')).toBe(previous);
    instance.update(); expect(node('p')).toBe(previous);
  });
});

describe('stage 5: DOM failure recovery and cleanup', () => {
  it('[PATCH-02] partial native write faults, restores successful display without listeners, rejects update/mount and remounts only after removal', () => {
    const oldClick = vi.fn(); const newClick = vi.fn(); const prepared: Element[] = [];
    const instance = root(({ value }: { value: string }) => [h('button', { attrs: { title: value }, events: { click: value === 'old' ? oldClick : newClick } }, value), ...(value === 'old' ? [] : [h('p', { events: { click: newClick } }, 'prepared')])]);
    instance.mount(host, { value: 'old' }); const previous = node('button'); previous.dispatchEvent(new Event('click')); expect(oldClick).toHaveBeenCalledTimes(1);
    const native = Element.prototype.setAttribute; let injected = false;
    const create = document.createElement.bind(document);
    const createSpy = vi.spyOn(document, 'createElement').mockImplementation((tag, options) => { const element = create(tag, options); if (tag === 'p') prepared.push(element); return element; });
    const spy = vi.spyOn(Element.prototype, 'setAttribute').mockImplementation(function (this: Element, name, value) {
      native.call(this, name, value);
      if (!injected && this === previous && name === 'title' && value === 'new') { injected = true; expect(previous.getAttribute('title')).toBe('new'); expect(() => instance.unmount()).toThrow(); throw new Error('partial apply failure'); }
    });
    try { expect(() => instance.update({ value: 'new' })).toThrow('partial apply failure'); expect(injected).toBe(true); } finally { spy.mockRestore(); createSpy.mockRestore(); }
    expect(instance.phase).toBe('faulted'); expect(host.textContent).toBe('old'); expect(node('button').getAttribute('title')).toBe('old'); expect(prepared.length).toBe(1);
    for (const element of [previous, node('button'), ...prepared]) element.dispatchEvent(new Event('click'));
    expect(oldClick).toHaveBeenCalledTimes(1); expect(newClick).not.toHaveBeenCalled();
    expect(() => instance.update()).toThrow(); expect(() => instance.mount(host, { value: 'fresh' })).toThrow();
    instance.unmount(); instance.mount(host, { value: 'old' }); node('button').dispatchEvent(new Event('click')); expect(oldClick).toHaveBeenCalledTimes(2);
  });

  it('[PATCH-01] initial mount fails after connecting real nodes, clears events/DOM, retains faulted scope until unmount', () => {
    const click = vi.fn(); const instance = root(() => h('button', { events: { click } }, 'mount'));
    const native = host.appendChild.bind(host); let connected: Node | null = null;
    const spy = vi.spyOn(host, 'appendChild').mockImplementation(<T extends Node>(child: T): T => { const result = native(child); connected = host.firstChild; throw new Error('after append'); return result; });
    try { expect(() => instance.mount(host, {})).toThrow('after append'); } finally { spy.mockRestore(); }
    expect(connected).not.toBeNull(); expect(instance.phase).toBe('faulted'); expect(host.childNodes.length).toBe(0);
    (connected as unknown as Node).dispatchEvent(new Event('click')); expect(click).not.toHaveBeenCalled();
    expect(() => createDOMScope(host)).toThrow(); instance.unmount();
    const scope = createDOMScope(host); releaseDOMScope(scope); instance.mount(host, {});
  });

  it('[TECH-03] removal failure must disable old handlers before leaving faulted, keep scope and allow removal retry', () => {
    const click = vi.fn(); const instance = root(() => h('button', { events: { click } }, 'alive'));
    instance.mount(host, {}); const previous = node('button'); previous.dispatchEvent(new Event('click')); expect(click).toHaveBeenCalledTimes(1);
    const removalError = new Error('remove failed');
    const spy = vi.spyOn(host, 'replaceChildren').mockImplementation(() => { throw removalError; });
    let caught: unknown;
    try { instance.unmount(); } catch (error) { caught = error; } finally { spy.mockRestore(); }
    expect(errorTree(caught)).toContain(removalError);
    expect(instance.phase).toBe('faulted'); expect(host.firstChild).toBe(previous); expect(() => createDOMScope(host)).toThrow(); expect(() => instance.update()).toThrow();
    previous.dispatchEvent(new Event('click')); const callsAfterFailure = click.mock.calls.length;
    instance.unmount(); expect(instance.phase).toBe('unmounted');
    const scope = createDOMScope(host); releaseDOMScope(scope);
    instance.mount(host, {}); node('button').dispatchEvent(new Event('click')); expect(click.mock.calls.length).toBe(callsAfterFailure + 1);
    expect(callsAfterFailure, 'faulted removal must not execute the prior native handler').toBe(1);
  });

  it('[PATCH-02] simultaneous application and reconstruction errors remain separately observable and faulted is removable', () => {
    const instance = root(({ value }: { value: string }) => h('button', { attrs: { title: value } }, value));
    instance.mount(host, { value: 'old' }); const previous = node('button');
    const applicationError = new Error('application failed after write'); const recoveryError = new Error('display reconstruction failed');
    const native = Element.prototype.setAttribute; let partial = false; let recovery = false;
    const spy = vi.spyOn(Element.prototype, 'setAttribute').mockImplementation(function (this: Element, name, value) {
      native.call(this, name, value);
      if (this === previous && name === 'title' && value === 'new') { partial = true; throw applicationError; }
      if (partial && this !== previous && name === 'title' && value === 'old') { recovery = true; throw recoveryError; }
    });
    let caught: unknown;
    try { instance.update({ value: 'new' }); } catch (error) { caught = error; } finally { spy.mockRestore(); }
    expect(partial).toBe(true); expect(recovery).toBe(true); expect(instance.phase).toBe('faulted');
    expect(() => instance.update()).toThrow(); instance.unmount(); instance.mount(host, { value: 'fresh' }); expect(host.textContent).toBe('fresh');
    const chain = errorTree(caught);
    expect.soft(chain, 'preserve original apply error alongside reconstruction error').toContain(applicationError);
    expect.soft(chain).toContain(recoveryError);
  });

  it('[PATCH-02] reconstruction DOM clear failure still disables prior events and keeps owned scope until removal', () => {
    const click = vi.fn(); const instance = root(({ value }: { value: string }) => h('button', { attrs: { title: value }, events: { click } }, value));
    instance.mount(host, { value: 'old' }); const previous = node('button'); const native = Element.prototype.setAttribute;
    const applySpy = vi.spyOn(Element.prototype, 'setAttribute').mockImplementation(function (this: Element, name, value) { native.call(this, name, value); if (this === previous && name === 'title' && value === 'new') throw new Error('apply failure'); });
    const clearSpy = vi.spyOn(host, 'replaceChildren').mockImplementation(() => { throw new Error('recovery clear failure'); });
    try { expect(() => instance.update({ value: 'new' })).toThrow(); } finally { applySpy.mockRestore(); clearSpy.mockRestore(); }
    previous.dispatchEvent(new Event('click')); expect(click).not.toHaveBeenCalled(); expect(instance.phase).toBe('faulted'); expect(() => createDOMScope(host)).toThrow();
    instance.unmount(); const scope = createDOMScope(host); releaseDOMScope(scope);
  });
});
