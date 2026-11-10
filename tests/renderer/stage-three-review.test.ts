// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { applyPlan, mountTree } from '../../src/core/patch';
import { diff } from '../../src/core/diff';
import { createDOMScope, releaseDOMScope } from '../../src/core/dom-bindings';
import { readDOM } from '../../src/core/dom-reader';
import { element, freeze, host, keyed, root, text } from './fixtures';
import type { VNode, VRoot } from '../../src/core/vdom';

const scopes: { container: Element; scope: object }[] = [];
function mount(tree: VRoot) {
  const container = host();
  const scope = createDOMScope(container);
  scopes.push({ container, scope });
  mountTree(container, tree, scope);
  return { container, scope };
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const { container, scope } of scopes.splice(0)) {
    container.replaceChildren();
    releaseDOMScope(scope);
  }
});

it('[PATCH-02][PATCH-03] keep 하위 깊은 폼을 복원하고 두 번째 무변경에는 setter·mutation이 없다', () => {
  const tree = freeze(root(element('section', [element('div', [
    element('input', [], { attrs: { type: 'text' }, domProps: { value: 'target', disabled: false } }),
    element('input', [], { attrs: { type: 'checkbox' }, domProps: { checked: true } }),
    element('textarea', [], { domProps: { value: 'line\nnext', disabled: true } }),
    element('button', [], { attrs: { type: 'button' }, domProps: { disabled: true } }),
  ])])));
  const { container, scope } = mount(tree);
  const [input, check] = Array.from(container.querySelectorAll('input'));
  const area = container.querySelector('textarea')!;
  const button = container.querySelector('button')!;
  input.value = 'native'; input.disabled = true; check.checked = false;
  area.value = 'native'; area.disabled = false; button.disabled = false;
  const plan = diff(tree, tree);
  expect(plan.children.ordered[0]).toMatchObject({ op: 'reuse', patch: { op: 'keep' } });
  applyPlan(container, plan, scope);
  expect([input.value, input.disabled, check.value, check.checked, area.value, area.disabled, button.disabled])
    .toEqual(['target', false, 'on', true, 'line\nnext', true, true]);
  const setters = [vi.spyOn(input, 'value', 'set'), vi.spyOn(input, 'disabled', 'set'),
    vi.spyOn(check, 'checked', 'set'), vi.spyOn(area, 'value', 'set'), vi.spyOn(area, 'disabled', 'set'),
    vi.spyOn(button, 'disabled', 'set')];
  const observer = new MutationObserver(() => undefined);
  observer.observe(container, { subtree: true, attributes: true, childList: true, characterData: true });
  applyPlan(container, plan, scope);
  expect(observer.takeRecords()).toEqual([]);
  for (const setter of setters) expect(setter).not.toHaveBeenCalled();
  observer.disconnect();
});

it('[PATCH-02][PATCH-03] 600개 결정적 혼합 이동·교체·삽입·삭제는 계약의 정체성과 목표 구조를 유지한다', () => {
  let seed = 20261110;
  function random(n: number) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; }
  function children(): VNode[] {
    const result: VNode[] = [];
    const keys = new Set<string>();
    const length = random(7);
    for (let i = 0; i < length; i += 1) {
      const key = ['a', 'b', 'c', 'd'][random(4)];
      if (random(3) !== 0 && !keys.has(key)) {
        keys.add(key); result.push(element(random(2) ? 'p' : 'span', [text(String(random(4)))], { key }));
      } else result.push(random(2) ? text(random(2) ? ' ' : 'x') : element('p', [text('unkeyed')]));
    }
    return result;
  }
  const { container, scope } = mount(root());
  let previous: VRoot = root();
  for (let sample = 0; sample < 600; sample += 1) {
    const next = freeze(root(element('section', children(), { key: 'parent' })));
    const parent = container.firstElementChild;
    const oldChildren = previous.children[0]?.kind === 'element' ? previous.children[0].children : [];
    const oldNodes = Array.from(parent?.childNodes ?? []);
    applyPlan(container, diff(previous, next), scope);
    if (parent) expect(container.firstElementChild, `sample ${sample}: parent`).toBe(parent);
    const target = next.children[0];
    if (target.kind !== 'element') throw new Error('Fixture');
    target.children.forEach((node, index) => {
      const key = node.kind === 'element' ? node.key : undefined;
      const candidate = key !== undefined
        ? oldChildren.findIndex((old) => old.kind === 'element' && old.key === key)
        : oldChildren[index] && (oldChildren[index].kind === 'text' || oldChildren[index].key === undefined) ? index : -1;
      const old = oldChildren[candidate];
      const actual = container.firstElementChild!.childNodes[index];
      if (old && old.kind === node.kind && (old.kind !== 'element' || (node.kind === 'element' && old.tag === node.tag))) {
        expect(actual, `sample ${sample}: reused ${index}`).toBe(oldNodes[candidate]);
      } else expect(oldNodes.includes(actual), `sample ${sample}: fresh ${index}`).toBe(false);
    });
    expect(readDOM(container, scope), `sample ${sample}: target`).toEqual(next);
    previous = next;
  }
}, 20000);

it.each(['create', 'replace'] as const)('[PATCH-02] %s 준비가 뒤에서 실패하면 먼저 만든 하위 이벤트와 임시 등록을 회수한다', (operation) => {
  const oldHandler = vi.fn(); const newHandler = vi.fn();
  const previous = root(element('button', [], { key: 'old', events: { click: oldHandler } }), keyed('stable'));
  const { container, scope } = mount(previous);
  const before = Array.from(container.childNodes);
  const newTree = element('section', [element('button', [], { events: { click: newHandler } })], { key: operation === 'replace' ? 'old' : 'fresh' });
  const next = root(newTree, element('article', [], { key: 'fail' }));
  const original = document.createElement.bind(document);
  const prepared: Element[] = [];
  vi.spyOn(document, 'createElement').mockImplementation((tag, options) => {
    if (tag === 'article') throw new Error('prepare failure');
    const node = original(tag, options); prepared.push(node); return node;
  });
  const observer = new MutationObserver(() => undefined);
  observer.observe(container, { subtree: true, childList: true, attributes: true, characterData: true });
  expect(() => applyPlan(container, diff(previous, next), scope)).toThrow('prepare failure');
  expect(observer.takeRecords()).toEqual([]); observer.disconnect();
  expect(Array.from(container.childNodes)).toEqual(before);
  before[0].dispatchEvent(new Event('click')); expect(oldHandler).toHaveBeenCalledTimes(1);
  prepared.forEach((node) => node.dispatchEvent(new Event('click')));
  expect(newHandler).not.toHaveBeenCalled();
  const removes = prepared.map((node) => vi.spyOn(node, 'removeEventListener'));
  container.replaceChildren(); releaseDOMScope(scope); scopes.pop();
  for (const remove of removes) expect(remove).not.toHaveBeenCalled();
});

it('[PATCH-01][PATCH-02] 준비 중 두 번째 이벤트 등록 실패도 부분 등록과 이전 준비 노드의 등록을 회수한다', () => {
  const { container, scope } = mount(root());
  const handler = vi.fn();
  const add = Element.prototype.addEventListener;
  const prepared: Element[] = [];
  const original = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag, options) => {
    const node = original(tag, options); prepared.push(node); return node;
  });
  vi.spyOn(Element.prototype, 'addEventListener').mockImplementation(function (this: Element, name, callback, options) {
    if (name === 'input') throw new Error('binding failure');
    return add.call(this, name, callback, options);
  });
  const next = root(element('button', [], { events: { click: handler } }),
    element('input', [], { events: { click: handler, input: handler } }));
  expect(() => applyPlan(container, diff(root(), next), scope)).toThrow('binding failure');
  expect(container.childNodes.length).toBe(0);
  for (const node of prepared) node.dispatchEvent(new Event('click'));
  expect(handler).not.toHaveBeenCalled();
});

it('[PATCH-02] 뒤쪽 재사용 요소의 DOM-invalid data 속성은 앞쪽 쓰기 전에 거부해야 한다', () => {
  const previous = root(element('p', [text('old')]), element('p'));
  const { container, scope } = mount(previous);
  const next = root(element('p', [text('new')]), element('p', [], { attrs: { 'data-\u0000': 'bad' } }));
  const observer = new MutationObserver(() => undefined);
  observer.observe(container, { subtree: true, childList: true, attributes: true, characterData: true });
  expect(() => applyPlan(container, diff(previous, next), scope)).toThrow();
  const mutations = observer.takeRecords(); observer.disconnect();
  expect({ text: container.firstElementChild!.textContent, writes: mutations.length }).toEqual({ text: 'old', writes: 0 });
});

it('[PatchPlan 계약] remove 배열 순서만 다른 유효 계획을 수용해야 한다', () => {
  const previous = root(keyed('a'), keyed('b'), keyed('c'));
  const next = root(keyed('c'));
  const { container, scope } = mount(previous);
  const surviving = container.children[2];
  const plan = diff(previous, next);
  const equivalent = { ...plan, children: { ...plan.children, remove: [...plan.children.remove].reverse() } };
  applyPlan(container, freeze(equivalent), scope);
  expect(container.childNodes.length).toBe(1);
  expect(container.firstChild).toBe(surviving);
  expect(readDOM(container, scope)).toEqual(next);
});

it('[PATCH-03] type 생략 button의 텍스트만 바꾸면 type 속성을 제거·재설정하지 않는다', () => {
  const previous = root(element('button', [text('old')]));
  const next = root(element('button', [text('new')]));
  const { container, scope } = mount(previous);
  const button = container.querySelector('button')!;
  const set = vi.spyOn(button, 'setAttribute'); const remove = vi.spyOn(button, 'removeAttribute');
  const type = vi.spyOn(button, 'type', 'set');
  applyPlan(container, diff(previous, next), scope);
  expect(button.textContent).toBe('new');
  expect({ set: set.mock.calls, remove: remove.mock.calls, type: type.mock.calls }).toEqual({ set: [], remove: [], type: [] });
});
