// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { applyPlan, mountTree } from '../../src/core/patch';
import { diff, type ChildrenPlan, type PatchPlan } from '../../src/core/diff';
import { createDOMScope, releaseDOMScope } from '../../src/core/dom-bindings';
import { readDOM } from '../../src/core/dom-reader';
import type { VRoot } from '../../src/core/vdom';
import { element, freeze, keyed, root, text } from './fixtures';

const entries: { container: Element; scope: object }[] = [];
function mount(tree: VRoot, owner = document) {
  const container = owner.createElement('div'); owner.body.append(container);
  const scope = createDOMScope(container); entries.push({ container, scope });
  mountTree(container, tree, scope); return { container, scope };
}
afterEach(() => {
  vi.restoreAllMocks();
  entries.splice(0).forEach(({ container, scope }) => { container.replaceChildren(); releaseDOMScope(scope); container.remove(); });
});
function observe(container: Element) {
  const observer = new MutationObserver(() => undefined);
  observer.observe(container, { subtree: true, attributes: true, characterData: true, childList: true });
  return observer;
}

it.each(['reuse', 'nested', 'create', 'replace', 'non-enumerable'] as const)('[F1] %s 이름 오류는 준비·기존 쓰기·이벤트 교체 전에 거부한다', (mode) => {
  const oldHandler = vi.fn(); const nextHandler = vi.fn();
  const previous = root(element('button', [text('old')], { key: 'button', events: { click: oldHandler } }), element('section', [element('p')], { key: 'target' }));
  const { container, scope } = mount(previous);
  const before = Array.from(container.childNodes); const button = container.firstElementChild!;
  const bad = mode === 'non-enumerable' ? Object.defineProperty({}, 'data-\u0000', { value: 'bad' }) : { 'data-\u0000': 'bad' };
  const target = mode === 'nested' ? element('section', [element('p', [], { attrs: bad })], { key: 'target' })
    : element(mode === 'replace' ? 'article' : 'section', [], { key: mode === 'create' ? 'fresh' : 'target', attrs: bad });
  const next = root(element('button', [text('new')], { key: 'button', events: { click: nextHandler } }), element('span', [], { key: 'fresh-first' }), target);
  const plan = freeze(diff(previous, next));
  const create = vi.spyOn(document, 'createElement');
  const name = vi.spyOn(document, 'createAttribute');
  const add = vi.spyOn(button, 'addEventListener'); const remove = vi.spyOn(button, 'removeEventListener');
  const observer = observe(container);
  expect(() => applyPlan(container, plan, scope)).toThrow();
  expect(observer.takeRecords()).toEqual([]); observer.disconnect();
  expect(Array.from(container.childNodes)).toEqual(before);
  expect(button.textContent).toBe('old'); expect(name).toHaveBeenCalledWith('data-\u0000');
  expect(create).not.toHaveBeenCalled(); expect(add).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled();
  button.dispatchEvent(new Event('click')); expect(oldHandler).toHaveBeenCalledTimes(1); expect(nextHandler).not.toHaveBeenCalled();
});

it('[F1] ownerDocument 이름 검사와 keep 하위 정상 속성 검사는 관리 DOM 무변경을 유지한다', () => {
  const owner = document.implementation.createHTMLDocument('owner');
  const tree = root(element('section', [element('p', [text('same')], { attrs: { title: 'same', 'data-note': 'same' } })], { attrs: { class: 'same' } }));
  const { container, scope } = mount(tree, owner);
  const own = vi.spyOn(owner, 'createAttribute'); const other = vi.spyOn(document, 'createAttribute');
  const observer = observe(container);
  applyPlan(container, freeze(diff(tree, tree)), scope);
  expect(own.mock.calls.map(([name]) => name)).toEqual(['class', 'title', 'data-note']);
  expect(other).not.toHaveBeenCalled(); expect(observer.takeRecords()).toEqual([]); observer.disconnect();
});

function nestedFixture() {
  const previous = root(element('p', [text('old')]), element('section', [element('article', [keyed('a'), keyed('b'), keyed('c'), keyed('d')], { key: 'inside' }), keyed('drop-a'), keyed('drop-b')], { key: 'parent' }), keyed('outer-a'), keyed('outer-b'));
  const next = root(element('p', [text('new')]), element('section', [element('article', [keyed('c')], { key: 'inside' })], { key: 'parent' }));
  const entry = mount(previous); return { ...entry, previous, next, plan: diff(previous, next) };
}
function mapRemove(children: ChildrenPlan, deepest?: readonly unknown[]): ChildrenPlan {
  return { ordered: children.ordered.map((item) => item.op === 'reuse' && item.patch.op === 'element'
    ? { ...item, patch: { ...item.patch, children: mapRemove(item.patch.children, deepest) } } : item),
    remove: children.remove.length === 3 && deepest !== undefined ? deepest as readonly number[] : [...children.remove].reverse() };
}
it('[F2] 세 깊이 remove 역순을 수용하고 목표 DOM·노드 정체성·불변 입력을 유지한다', () => {
  const { container, scope, previous, next, plan } = nestedFixture();
  const parent = container.querySelector('section'); const inside = container.querySelector('article'); const c = container.querySelector('[data-key=c]');
  const candidate: PatchPlan = freeze({ ...plan, children: mapRemove(plan.children) });
  applyPlan(container, candidate, scope);
  expect(container.querySelector('section')).toBe(parent); expect(container.querySelector('article')).toBe(inside); expect(container.querySelector('[data-key=c]')).toBe(c);
  expect(readDOM(container, scope)).toEqual(next);
  expect(candidate.children.remove).toEqual([3, 2]); expect(plan.children.remove).toEqual([2, 3]);
  expect(previous.children.length).toBe(4);
});
it.each([
  ['duplicate-same-length', [0, 0, 3]], ['missing', [0, 1]], ['extra', [0, 1, 3, 99]], ['overlap', [0, 1, 2]],
  ['negative', [0, 1, -1]], ['fraction', [0, 1, 0.5]], ['NaN', [0, 1, NaN]], ['string', [0, 1, '3']], ['hole', [0, 1, ,]],
] as const)('[F2] 중첩 %s remove를 앞쪽 부분쓰기 전에 거부한다', (_name, removed) => {
  const { container, scope, plan } = nestedFixture();
  const before = Array.from(container.childNodes); const html = container.innerHTML;
  const candidate: PatchPlan = freeze({ ...plan, children: mapRemove(plan.children, removed) });
  const create = vi.spyOn(document, 'createElement'); const observer = observe(container);
  expect(() => applyPlan(container, candidate, scope)).toThrow('Invalid PatchPlan');
  expect(observer.takeRecords()).toEqual([]); observer.disconnect();
  expect(container.innerHTML).toBe(html); expect(Array.from(container.childNodes)).toEqual(before); expect(create).not.toHaveBeenCalled();
});

it.each(['omitted-text', 'explicit-to-omitted', 'omitted-to-explicit', 'disabled', 'no-op', 'actual-type-drift'] as const)('[F3] %s는 필요한 쓰기만 하고 button 기본 type을 유지한다', (mode) => {
  const previous = root(element('button', [text('old')], { attrs: mode === 'explicit-to-omitted' ? { type: 'button' } : {} }));
  const next = mode === 'no-op' ? previous : root(element('button', [text('new')], { attrs: mode === 'omitted-to-explicit' ? { type: 'button' } : {}, domProps: mode === 'disabled' ? { disabled: true } : {} }));
  const { container, scope } = mount(previous); const button = container.querySelector('button')!;
  if (mode === 'actual-type-drift') button.type = 'submit';
  const type = vi.spyOn(button, 'type', 'set'); const attr = vi.spyOn(button, 'setAttribute'); const remove = vi.spyOn(button, 'removeAttribute');
  const disabled = vi.spyOn(button, 'disabled', 'set'); const observer = observe(container);
  applyPlan(container, freeze(diff(previous, next)), scope);
  const records = observer.takeRecords(); observer.disconnect();
  expect(container.querySelector('button')).toBe(button); expect(button.type).toBe('button');
  expect(remove).not.toHaveBeenCalled(); expect(attr).not.toHaveBeenCalled();
  expect(type).toHaveBeenCalledTimes(mode === 'actual-type-drift' ? 1 : 0);
  expect(disabled).toHaveBeenCalledTimes(mode === 'disabled' ? 1 : 0);
  expect(records.filter((record) => record.type === 'attributes' && record.attributeName === 'type').length).toBe(mode === 'actual-type-drift' ? 1 : 0);
  if (mode === 'no-op') expect(records).toEqual([]);
  else expect(button.textContent).toBe('new');
});
