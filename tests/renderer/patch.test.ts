// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { projectModule } from '../support/project';
import { expectSameNodes } from '../support/observations';
import { element, freeze, host, keyed, requireElement, root, text } from './fixtures';
import type { BindingsModule, DiffModule, DOMScope, PatchModule, ReaderModule, VRoot } from './fixtures';

let bindings: BindingsModule;
let patch: PatchModule;
let differ: DiffModule;
let reader: ReaderModule;
const mounted: { container: HTMLDivElement; scope: DOMScope; tree: VRoot }[] = [];

beforeEach(async () => {
  [bindings, patch, differ, reader] = await Promise.all([
    projectModule<BindingsModule>('core/dom-bindings.ts'),
    projectModule<PatchModule>('core/patch.ts'),
    projectModule<DiffModule>('core/diff.ts'),
    projectModule<ReaderModule>('core/dom-reader.ts'),
  ]);
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const entry of mounted.splice(0)) {
    patch.applyPlan(entry.container, differ.diff(entry.tree, root()), entry.scope);
    bindings.releaseDOMScope(entry.scope);
  }
  document.body.replaceChildren();
});

function mount(tree: VRoot): typeof mounted[number] {
  const container = host();
  const scope = bindings.createDOMScope(container);
  const entry = { container, scope, tree };
  mounted.push(entry);
  patch.mountTree(container, tree, scope);
  return entry;
}

function update(entry: typeof mounted[number], next: VRoot): void {
  patch.applyPlan(entry.container, differ.diff(entry.tree, next), entry.scope);
  entry.tree = next;
}

describe('mountTree/applyPlan', () => {
  it('[PATCH-01][VDOM-01][VDOM-02] 빈 root와 중첩 구조·속성·빈 텍스트를 별도 root 요소 없이 생성한다', () => {
    const empty = mount(root());
    expect(empty.container.childNodes).toHaveLength(0);
    const tree = freeze(root(text(''), element('section', [text(' '), element('p', [text('<&>')])], {
      attrs: { class: 'sample', title: 'hello', 'data-note': 'kept' },
    }), element('br')));
    const entry = mount(tree);
    expect(entry.container.childNodes).toHaveLength(3);
    expect(entry.container.firstChild).toBeInstanceOf(Text);
    expect(reader.readDOM(entry.container, entry.scope)).toEqual(tree);
  });

  it('[PATCH-02][PATCH-03] 텍스트·속성만 변경하면 Text·부모·비대상 형제를 유지한다', () => {
    const entry = mount(root(element('p', [text('before')], { attrs: { title: 'old', class: 'remove' } }), element('span', [text('stable')])));
    const paragraph = entry.container.firstChild;
    const textNode = paragraph?.firstChild;
    const sibling = entry.container.lastChild;
    const outside = host();
    outside.textContent = 'outside';
    update(entry, root(element('p', [text('after')], { attrs: { title: 'new', 'data-added': 'yes' } }), element('span', [text('stable')])));
    expect(entry.container.firstChild).toBe(paragraph);
    expect(paragraph?.firstChild).toBe(textNode);
    expect(textNode?.nodeValue).toBe('after');
    expect(entry.container.lastChild).toBe(sibling);
    expect(entry.container.firstElementChild?.getAttribute('title')).toBe('new');
    expect(entry.container.firstElementChild?.hasAttribute('class')).toBe(false);
    expect(outside.textContent).toBe('outside');
    expect(reader.readDOM(entry.container, entry.scope)).toEqual(entry.tree);
  });

  it.each([
    ['rotate', ['c', 'a', 'b']],
    ['reverse', ['c', 'b', 'a']],
    ['front insert', ['new', 'a', 'b', 'c']],
    ['middle insert', ['a', 'new', 'b', 'c']],
    ['end insert', ['a', 'b', 'c', 'new']],
    ['front delete', ['b', 'c']],
    ['middle delete', ['a', 'c']],
    ['end delete', ['a', 'b']],
    ['mixed', ['c', 'new', 'a']],
  ])('[DIFF-01][PATCH-02][PATCH-03] keyed %s에서 살아 있는 노드 정체성과 최종 순서를 유지한다', (_name, keys) => {
    const entry = mount(freeze(root(keyed('a'), keyed('b'), keyed('c'))));
    const old = new Map(Array.from(entry.container.children, (node) => [node.getAttribute('data-key'), node]));
    update(entry, freeze(root(...keys.map((key) => keyed(key)))));
    expect(Array.from(entry.container.children, (node) => node.getAttribute('data-key'))).toEqual(keys);
    for (const key of keys) {
      if (old.has(key)) {
        expect(entry.container.querySelector(`[data-key="${key}"]`)).toBe(old.get(key));
      }
    }
    expect(reader.readDOM(entry.container, entry.scope)).toEqual(entry.tree);
  });

  it('[PATCH-02][PATCH-03] 재정렬·추가·삭제·같은 key 태그교체·내용변경을 한 번에 적용한다', () => {
    const entry = mount(root(keyed('a'), keyed('b'), keyed('c'), keyed('d')));
    const [a, b, c, d] = Array.from(entry.container.children);
    const next = root(element('p', [text('updated')], { key: 'c', attrs: { title: 'new' } }), keyed('new'), keyed('b', 'span'), keyed('a'));
    update(entry, next);
    expect(entry.container.children[0]).toBe(c);
    expect(entry.container.children[2]).not.toBe(b);
    expect(entry.container.children[3]).toBe(a);
    expect(b.isConnected).toBe(false);
    expect(d.isConnected).toBe(false);
    expect(reader.readDOM(entry.container, entry.scope)).toEqual(next);
  });

  it('[DIFF-01][PATCH-03] 혼합 keyed·공백·unkeyed는 전체 인덱스가 같은 경우만 재사용한다', () => {
    const entry = mount(root(keyed('a'), text(' '), element('span', [text('old')]), keyed('b')));
    const before = Array.from(entry.container.childNodes);
    update(entry, root(keyed('b'), text('\n'), element('span', [text('new')]), keyed('a')));
    expectSameNodes(entry.container.childNodes, [before[3], before[1], before[2], before[0]]);
    const oldUnkeyed = before[2];
    update(entry, root(keyed('b'), element('span', [text('new')]), text('\n'), keyed('a')));
    expect(entry.container.childNodes[1]).not.toBe(oldUnkeyed);
    expect(entry.container.contains(oldUnkeyed)).toBe(false);
    expect(reader.readDOM(entry.container, entry.scope)).toEqual(entry.tree);
  });

  it.each([
    [element('p', [], { key: 'a' }), element('p', [], { key: 'b' })],
    [element('p', [], { key: 'a' }), element('p')],
    [element('p'), element('p', [], { key: 'a' })],
    [element('p', [element('span')], { key: 'a' }), element('section', [element('span')], { key: 'a' })],
  ])('[DIFF-01][PATCH-03] key 변경·추가·제거 또는 같은 key의 tag 변경이면 해당 하위 트리를 교체한다 %#', (previous, next) => {
    const entry = mount(root(previous, keyed('stable')));
    const old = entry.container.firstChild;
    const descendant = old?.firstChild;
    const sibling = entry.container.lastChild;
    update(entry, root(next, keyed('stable')));
    expect(entry.container.firstChild).not.toBe(old);
    expect(entry.container.lastChild).toBe(sibling);
    if (descendant) expect(entry.container.contains(descendant)).toBe(false);
    expect(reader.readDOM(entry.container, entry.scope)).toEqual(entry.tree);
  });

  it('[DIFF-01][PATCH-03] 같은 key가 부모를 바꾸면 전역 검색·이동 대신 제거 후 생성한다', () => {
    const entry = mount(root(element('section', [keyed('x')]), element('article')));
    const old = entry.container.querySelector('[data-key="x"]');
    const parents = Array.from(entry.container.children);
    update(entry, root(element('section'), element('article', [keyed('x')])));
    expectSameNodes(entry.container.children, parents);
    expect(entry.container.querySelector('[data-key="x"]')).not.toBe(old);
    expect(old?.isConnected).toBe(false);
  });

  it('[DIFF-01][PATCH-03] 부모 교체는 같은 하위 key를 재사용하지 않는다', () => {
    const entry = mount(root(element('section', [keyed('x')])));
    const oldChild = entry.container.querySelector('[data-key="x"]');
    update(entry, root(element('article', [keyed('x')])));
    expect(entry.container.querySelector('[data-key="x"]')).not.toBe(oldChild);
    expect(oldChild?.isConnected).toBe(false);
  });

  it('[PATCH-03] 삭제 후 재등장한 key는 부활하지 않으며 계속 살아 있는 key만 왕복 재사용한다', () => {
    const initial = freeze(root(keyed('a'), keyed('b'), keyed('c')));
    const entry = mount(initial);
    const [a, b, c] = Array.from(entry.container.children);
    update(entry, root(keyed('c'), keyed('a')));
    update(entry, initial);
    expect(entry.container.children[0]).toBe(a);
    expect(entry.container.children[1]).not.toBe(b);
    expect(entry.container.children[2]).toBe(c);
    expect(reader.readDOM(entry.container, entry.scope)).toEqual(initial);
  });

  it.each(['same-object', 'equivalent-object'] as const)('[DIFF-03][PATCH-03][QA-04] %s 무변경이면 DOM mutation·이동·속성·프로퍼티·리스너 쓰기가 없다', (mode) => {
    const handler = vi.fn<(event: Event) => void>();
    const tree = freeze(root(element('input', [], {
      key: 'field', attrs: { type: 'text', title: 'kept' }, domProps: { value: 'same', disabled: false }, events: { input: handler },
    }), element('p', [text('same')])));
    // Do not JSON/deep clone a function-bearing tree: preserve exactly the event function.
    const next = mode === 'same-object' ? tree : freeze(root(element('input', [], {
      key: 'field', attrs: { title: 'kept', type: 'text' }, domProps: { disabled: false, value: 'same' }, events: { input: handler },
    }), element('p', [text('same')])));
    expect(next === tree).toBe(mode === 'same-object');
    const entry = mount(tree);
    const originalNodes = Array.from(entry.container.childNodes);
    const input = requireElement(entry.container, 'input', HTMLInputElement);
    const observer = new MutationObserver(() => undefined);
    observer.observe(entry.container, { subtree: true, childList: true, attributes: true, characterData: true });
    const value = vi.spyOn(input, 'value', 'set');
    const disabled = vi.spyOn(input, 'disabled', 'set');
    const setAttribute = vi.spyOn(Element.prototype, 'setAttribute');
    const removeAttribute = vi.spyOn(Element.prototype, 'removeAttribute');
    const append = vi.spyOn(Node.prototype, 'appendChild');
    const insert = vi.spyOn(Node.prototype, 'insertBefore');
    const replace = vi.spyOn(Node.prototype, 'replaceChild');
    const remove = vi.spyOn(Node.prototype, 'removeChild');
    const addListener = vi.spyOn(input, 'addEventListener');
    const removeListener = vi.spyOn(input, 'removeEventListener');
    try {
      const plan = differ.diff(tree, next);
      expect(plan.hasChanges).toBe(false);
      patch.applyPlan(entry.container, plan, entry.scope);
      entry.tree = next;
      expectSameNodes(entry.container.childNodes, originalNodes);
      expect(observer.takeRecords()).toEqual([]);
      for (const spy of [value, disabled, setAttribute, removeAttribute, append, insert, replace, remove, addListener, removeListener]) {
        expect(spy).not.toHaveBeenCalled();
      }
    } finally {
      observer.disconnect();
    }
  });

  it('[DIFF-03][PATCH-02][PATCH-03][임시 OPEN-01] hasChanges=false여도 실제 폼 값·checked·disabled를 보정한다', () => {
    const tree = root(
      element('input', [], { attrs: { type: 'text' }, domProps: { value: 'target', disabled: false } }),
      element('input', [], { attrs: { type: 'checkbox' }, domProps: { value: 'on', checked: true, disabled: false } }),
      element('textarea', [], { domProps: { value: 'target\ntext', disabled: false } }),
    );
    const entry = mount(tree);
    const input = requireElement(entry.container, 'input', HTMLInputElement);
    const check = requireElement(entry.container, 'input[type=checkbox]', HTMLInputElement);
    const textarea = requireElement(entry.container, 'textarea', HTMLTextAreaElement);
    input.value = 'user';
    input.disabled = true;
    check.value = 'user';
    check.checked = false;
    textarea.value = 'user';
    const plan = differ.diff(tree, tree);
    expect(plan.hasChanges).toBe(false);
    patch.applyPlan(entry.container, plan, entry.scope);
    expect(input.value).toBe('target');
    expect(input.disabled).toBe(false);
    expect(check.value).toBe('on');
    expect(check.checked).toBe(true);
    expect(textarea.value).toBe('target\ntext');
    expect(reader.readDOM(entry.container, entry.scope)).toEqual(tree);
    const valueSet = vi.spyOn(input, 'value', 'set');
    const checkedSet = vi.spyOn(check, 'checked', 'set');
    const textareaSet = vi.spyOn(textarea, 'value', 'set');
    patch.applyPlan(entry.container, plan, entry.scope);
    expect(valueSet).not.toHaveBeenCalled();
    expect(checkedSet).not.toHaveBeenCalled();
    expect(textareaSet).not.toHaveBeenCalled();
  });

  it('[PATCH-02][PATCH-03][임시 OPEN-01] keyed 폼 이동과 목표 value·checked·disabled·이벤트 변경을 함께 반영한다', () => {
    const oldHandler = vi.fn<(event: Event) => void>();
    const newHandler = vi.fn<(event: Event) => void>();
    const before = root(element('input', [], {
      key: 'check', attrs: { type: 'checkbox' },
      domProps: { value: 'before', checked: false, disabled: false }, events: { change: oldHandler },
    }), keyed('sibling'));
    const entry = mount(freeze(before));
    const input = requireElement(entry.container, 'input', HTMLInputElement);
    const sibling = entry.container.lastChild;
    const target = freeze(root(keyed('sibling'), element('input', [], {
      key: 'check', attrs: { type: 'checkbox' },
      domProps: { value: 'after', checked: true, disabled: true }, events: { change: newHandler },
    })));
    update(entry, target);
    expect(entry.container.firstChild).toBe(sibling);
    expect(entry.container.lastChild).toBe(input);
    expect(input.value).toBe('after');
    expect(input.checked).toBe(true);
    expect(input.disabled).toBe(true);
    input.dispatchEvent(new Event('change'));
    expect(oldHandler).not.toHaveBeenCalled();
    expect(newHandler).toHaveBeenCalledTimes(1);
  });

  it.each(['click', 'input', 'change'] as const)('[PATCH-02][임시 OPEN-01] %s 핸들러를 교체·해제하고 이동만으로 중복 바인딩하지 않는다', (eventName) => {
    const first = vi.fn<(event: Event) => void>();
    const second = vi.fn<(event: Event) => void>();
    const button = (handler?: (event: Event) => void): ReturnType<typeof element> => element('button', [text('go')], {
      key: 'button', attrs: { type: 'button' }, domProps: { disabled: false }, events: handler ? { [eventName]: handler } : {},
    });
    const entry = mount(root(button(first), keyed('other')));
    const node = requireElement(entry.container, 'button', HTMLButtonElement);
    node.dispatchEvent(new Event(eventName));
    expect(first).toHaveBeenCalledTimes(1);
    const add = vi.spyOn(node, 'addEventListener');
    const remove = vi.spyOn(node, 'removeEventListener');
    update(entry, root(keyed('other'), button(first)));
    expect(entry.container.lastChild).toBe(node);
    expect(add).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    update(entry, root(keyed('other'), button(second)));
    node.dispatchEvent(new Event(eventName));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    update(entry, root(keyed('other'), button()));
    node.dispatchEvent(new Event(eventName));
    expect(second).toHaveBeenCalledTimes(1);
  });

  it.each(['remove', 'replace'] as const)('[PATCH-02][임시 OPEN-01] %s 시 분리된 이전 하위 노드에서도 이벤트를 해제한다', (operation) => {
    const handler = vi.fn<(event: Event) => void>();
    const entry = mount(root(element('section', [element('button', [text('go')], {
      attrs: { type: 'button' }, domProps: { disabled: false }, events: { click: handler },
    })])));
    const oldButton = requireElement(entry.container, 'button', HTMLButtonElement);
    update(entry, operation === 'remove' ? root() : root(element('article')));
    oldButton.dispatchEvent(new Event('click'));
    expect(handler).not.toHaveBeenCalled();
    expect(oldButton.isConnected).toBe(false);
  });
});
