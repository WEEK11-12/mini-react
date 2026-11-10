// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { projectModule } from '../support/project';
import { expectSameNodes } from '../support/observations';
import { element, freeze, host, keyed, requireElement, root, text } from './fixtures';
import type { BindingsModule, DiffModule, DOMScope, PatchModule, ReaderModule, VRoot } from './fixtures';

let bindings: BindingsModule;
let patch: PatchModule;
let differ: DiffModule;
let reader: ReaderModule;
const entries: { container: HTMLDivElement; scope: DOMScope; tree: VRoot }[] = [];

beforeEach(async () => {
  [bindings, patch, differ, reader] = await Promise.all([
    projectModule<BindingsModule>('core/dom-bindings.ts'),
    projectModule<PatchModule>('core/patch.ts'),
    projectModule<DiffModule>('core/diff.ts'),
    projectModule<ReaderModule>('core/dom-reader.ts'),
  ]);
});

afterEach(() => {
  for (const entry of entries.splice(0)) {
    patch.applyPlan(entry.container, differ.diff(entry.tree, root()), entry.scope);
    bindings.releaseDOMScope(entry.scope);
  }
  document.body.replaceChildren();
});

function mount(tree: VRoot): typeof entries[number] {
  const container = host();
  const scope = bindings.createDOMScope(container);
  const entry = { container, scope, tree };
  entries.push(entry);
  patch.mountTree(container, tree, scope);
  return entry;
}

function linkedTree(id = 'field'): VRoot {
  return root(
    element('label', [text('Toggle')], { attrs: { for: id } }),
    element('input', [], { key: 'same-key', attrs: { type: 'checkbox', id }, domProps: { value: 'on', checked: false, disabled: false } }),
    element('p', [text('help')], { attrs: { id: 'help' } }),
    element('section', [], { attrs: {
      'aria-activedescendant': id,
      'aria-errormessage': 'help',
      'aria-labelledby': `${id} help`,
      'aria-describedby': `help ${id}`,
      'aria-controls': id,
      'aria-owns': 'help',
      'aria-flowto': `${id} help`,
      'aria-label': 'field help',
      title: 'field help',
      'data-id-like': id,
    } }),
  );
}

describe('DOMScope', () => {
  it('[VDOM-02][PATCH-01][임시 OPEN-01] 같은 논리 ID·key의 두 영역은 실제 ID가 다르고 label.control은 자기 input만 가리킨다', () => {
    const tree = freeze(linkedTree());
    const actual = mount(tree);
    const preview = mount(tree);
    const actualInput = requireElement(actual.container, 'input', HTMLInputElement);
    const previewInput = requireElement(preview.container, 'input', HTMLInputElement);
    expect(actualInput.id).not.toBe(previewInput.id);
    expect(actualInput.id).not.toBe('field');
    expect(requireElement(actual.container, 'label', HTMLLabelElement).control).toBe(actualInput);
    expect(requireElement(preview.container, 'label', HTMLLabelElement).control).toBe(previewInput);
    expect(actualInput.getAttribute('data-key')).toBe('same-key');
    expect(previewInput.getAttribute('data-key')).toBe('same-key');
    const actualIds = new Set(Array.from(actual.container.querySelectorAll('[id]'), (node) => node.id));
    const previewIds = Array.from(preview.container.querySelectorAll('[id]'), (node) => node.id);
    expect(previewIds.every((id) => !actualIds.has(id))).toBe(true);
    expect(reader.readDOM(actual.container, actual.scope)).toEqual(tree);
    expect(reader.readDOM(preview.container, preview.scope)).toEqual(tree);
    expect(differ.diff(reader.readDOM(actual.container, actual.scope), reader.readDOM(preview.container, preview.scope)).hasChanges).toBe(false);
    expect(tree.children[1]).toMatchObject({ attrs: { id: 'field' } });
  });

  it('[VDOM-02][PATCH-01][임시 OPEN-01] 지원 단일·목록 ARIA 참조를 모두 변환하고 일반 문자열은 그대로 둔다', () => {
    const entry = mount(freeze(linkedTree()));
    const input = requireElement(entry.container, 'input', HTMLInputElement);
    const help = requireElement(entry.container, 'p', HTMLParagraphElement);
    const section = requireElement(entry.container, 'section', HTMLElement);
    const expected: Record<string, string> = {
      'aria-activedescendant': input.id,
      'aria-errormessage': help.id,
      'aria-labelledby': `${input.id} ${help.id}`,
      'aria-describedby': `${help.id} ${input.id}`,
      'aria-controls': input.id,
      'aria-owns': help.id,
      'aria-flowto': `${input.id} ${help.id}`,
    };
    for (const [name, value] of Object.entries(expected)) {
      expect(section.getAttribute(name)).toBe(value);
      for (const token of value.split(' ')) {
        const target = document.getElementById(token);
        expect(target).not.toBeNull();
        expect(entry.container.contains(target)).toBe(true);
      }
    }
    expect(section.getAttribute('aria-label')).toBe('field help');
    expect(section.getAttribute('title')).toBe('field help');
    expect(section.getAttribute('data-id-like')).toBe('field');
    expect(reader.readDOM(entry.container, entry.scope)).toEqual(entry.tree);
  });

  it('[VDOM-02][임시 OPEN-01] 원본 HTML의 ID 목록은 HTML 공백을 한 칸으로 정규화한다', () => {
    const template = document.createElement('template');
    template.innerHTML = '<p id="a"></p><p id="b"></p><section aria-labelledby=" \ta\n\fb\r a "></section>';
    const tree = reader.readDOM(template.content);
    expect(tree).toEqual(root(
      element('p', [], { attrs: { id: 'a' } }), element('p', [], { attrs: { id: 'b' } }),
      element('section', [], { attrs: { 'aria-labelledby': 'a b a' } }),
    ));
    const entry = mount(tree);
    expect(reader.readDOM(entry.container, entry.scope)).toEqual(tree);
  });

  it('[PATCH-02][PATCH-03][임시 OPEN-01] ID와 for·ARIA를 함께 바꿔 왕복해도 scope 매핑이 안정적이고 DOM은 유지된다', () => {
    const initial = freeze(linkedTree('field'));
    const entry = mount(initial);
    const input = requireElement(entry.container, 'input', HTMLInputElement);
    const firstId = input.id;
    const target = freeze(linkedTree('renamed'));
    patch.applyPlan(entry.container, differ.diff(initial, target), entry.scope);
    entry.tree = target;
    expect(entry.container.querySelector('input')).toBe(input);
    expect(input.id).not.toBe(firstId);
    expect(requireElement(entry.container, 'label', HTMLLabelElement).control).toBe(input);
    expect(reader.readDOM(entry.container, entry.scope)).toEqual(target);
    patch.applyPlan(entry.container, differ.diff(target, initial), entry.scope);
    entry.tree = initial;
    expect(input.id).toBe(firstId);
    expect(reader.readDOM(entry.container, entry.scope)).toEqual(initial);
    expect(initial).toEqual(linkedTree('field'));
  });

  it('[VDOM-02][PATCH-01][임시 OPEN-01] 인코딩 충돌 가능 논리 ID도 일대일·안정적으로 왕복한다', () => {
    const ids = ['a', '_a', 'a-b', 'a_b', 'a:b', 'a/b', 'a%2Fb', '한글', '🔑', '__proto__'];
    const tree = freeze(root(...ids.map((id) => element('p', [], { attrs: { id } }))));
    const entry = mount(tree);
    const actualIds = Array.from(entry.container.children, (node) => node.id);
    expect(new Set(actualIds).size).toBe(ids.length);
    expect(reader.readDOM(entry.container, entry.scope)).toEqual(tree);
    patch.applyPlan(entry.container, differ.diff(tree, tree), entry.scope);
    expect(Array.from(entry.container.children, (node) => node.id)).toEqual(actualIds);
  });

  it.each(['same', 'parent-first', 'child-first'] as const)('[PATCH-01][임시 OPEN-01][임시 OPEN-09] 동일·중첩 컨테이너의 중복 scope를 거부한다: %s', (order) => {
    const parent = host();
    const child = document.createElement('div');
    parent.append(child);
    const owner = order === 'child-first' ? child : parent;
    const other = order === 'same' ? parent : order === 'parent-first' ? child : parent;
    const scope = bindings.createDOMScope(owner);
    try {
      expect(() => bindings.createDOMScope(other)).toThrow();
    } finally {
      parent.replaceChildren();
      bindings.releaseDOMScope(scope);
    }
  });

  it('[VDOM-02][PATCH-01][PATCH-02][임시 OPEN-01][임시 OPEN-09] 다른 컨테이너의 scope로 읽기·생성·적용하면 양쪽을 변경하지 않는다', () => {
    const first = mount(linkedTree());
    const other = mount(root(keyed('other')));
    const firstNodes = Array.from(first.container.childNodes);
    const otherNodes = Array.from(other.container.childNodes);
    const plan = differ.diff(other.tree, root(keyed('changed')));
    expect(() => reader.readDOM(other.container, first.scope)).toThrow();
    expect(() => patch.applyPlan(other.container, plan, first.scope)).toThrow();
    expect(() => patch.mountTree(other.container, root(), first.scope)).toThrow();
    expectSameNodes(first.container.childNodes, firstNodes);
    expectSameNodes(other.container.childNodes, otherNodes);
  });

  it.each(['foreign', 'unissued'] as const)('[VDOM-02][임시 OPEN-01][임시 OPEN-09] 참조 없는 단독 id의 %s 실제 ID 역변환을 거부한다', (source) => {
    // No label/ARIA links: missing-target validation cannot hide pass-through decoding.
    const first = mount(root(element('p', [], { attrs: { id: 'field' } })));
    const other = mount(root(element('p', [], { attrs: { id: 'field' } })));
    const node = requireElement(first.container, 'p', HTMLParagraphElement);
    const original = node.id;
    const invalid = source === 'foreign'
      ? requireElement(other.container, 'p', HTMLParagraphElement).id
      : `${original}-not-issued`;
    expect(reader.readDOM(first.container, first.scope)).toEqual(first.tree);
    try {
      node.id = invalid;
      expect(() => reader.readDOM(first.container, first.scope)).toThrow();
    } finally {
      node.id = original;
    }
  });

  it.each(['for', 'aria-activedescendant', 'aria-labelledby'])(
    '[VDOM-02][임시 OPEN-01][임시 OPEN-09] %s 참조의 외부 실제 ID를 논리 ID로 그대로 통과시키지 않는다',
    (attribute) => {
      const other = mount(root(element('p', [], { attrs: { id: 'foreign' } })));
      const foreignId = requireElement(other.container, 'p', HTMLParagraphElement).id;
      // Deliberately use the foreign actual ID as a VALID logical target in this root.
      // A broken pass-through decoder would therefore pass logical target validation.
      const linked = mount(root(
        element('input', [], {
          attrs: { type: 'text', id: foreignId }, domProps: { value: '', disabled: false },
        }),
        element(attribute === 'for' ? 'label' : 'section', [], { attrs: { [attribute]: foreignId } }),
      ));
      const reference = linked.container.children[1];
      const original = reference.getAttribute(attribute)!;
      expect(original).not.toBe(foreignId);
      expect(reader.readDOM(linked.container, linked.scope)).toEqual(linked.tree);
      try {
        reference.setAttribute(attribute, foreignId);
        expect(() => reader.readDOM(linked.container, linked.scope)).toThrow();
      } finally {
        reference.setAttribute(attribute, original);
      }
    },
  );

  it('[VDOM-02][PATCH-01][PATCH-02][임시 OPEN-01][임시 OPEN-09] DOM·바인딩 정리 후 scope를 해제하면 모든 재사용을 거부하고 컨테이너를 재등록할 수 있다', () => {
    const container = host();
    const scope = bindings.createDOMScope(container);
    const tree = linkedTree();
    patch.mountTree(container, tree, scope);
    const oldInput = requireElement(container, 'input', HTMLInputElement);
    patch.applyPlan(container, differ.diff(tree, root()), scope);
    expect(container.childNodes).toHaveLength(0);
    expect(oldInput.isConnected).toBe(false);
    bindings.releaseDOMScope(scope);
    expect(() => reader.readDOM(container, scope)).toThrow();
    expect(() => patch.mountTree(container, root(), scope)).toThrow();
    expect(() => patch.applyPlan(container, differ.diff(root(), root()), scope)).toThrow();
    const replacement = bindings.createDOMScope(container);
    try {
      patch.mountTree(container, root(), replacement);
      expect(reader.readDOM(container, replacement)).toEqual(root());
    } finally {
      bindings.releaseDOMScope(replacement);
    }
  });
});
