// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { projectModule } from '../support/project';
import { expectSameNodes } from '../support/observations';
import { element, freeze, host, keyed, root, text } from './fixtures';
import type { BindingsModule, ChildrenPlan, DiffModule, DOMScope, PatchModule, PatchPlan, ReaderModule, VRoot } from './fixtures';

let bindings: BindingsModule;
let patch: PatchModule;
let differ: DiffModule;
let reader: ReaderModule;
let container: HTMLDivElement;
let scope: DOMScope | undefined;
let previous: VRoot;

beforeEach(async () => {
  [bindings, patch, differ, reader] = await Promise.all([
    projectModule<BindingsModule>('core/dom-bindings.ts'),
    projectModule<PatchModule>('core/patch.ts'),
    projectModule<DiffModule>('core/diff.ts'),
    projectModule<ReaderModule>('core/dom-reader.ts'),
  ]);
  container = host();
  scope = bindings.createDOMScope(container);
  previous = freeze(root(keyed('a'), keyed('b')));
  patch.mountTree(container, previous, scope);
});

afterEach(() => {
  vi.restoreAllMocks();
  if (scope) {
    patch.applyPlan(container, differ.diff(previous, root()), scope);
    bindings.releaseDOMScope(scope);
    scope = undefined;
  }
  document.body.replaceChildren();
});

function activeScope(): DOMScope {
  if (!scope) throw new Error('Fixture scope not initialized');
  return scope;
}

function assertRejectedWithoutWrites(plan: PatchPlan): void {
  const before = Array.from(container.childNodes);
  const html = container.innerHTML;
  const logicalBefore = reader.readDOM(container, activeScope());
  const observer = new MutationObserver(() => undefined);
  observer.observe(container, { subtree: true, childList: true, attributes: true, characterData: true });
  try {
    expect(() => patch.applyPlan(container, freeze(plan), activeScope())).toThrow();
    expect(observer.takeRecords()).toEqual([]);
    expectSameNodes(container.childNodes, before);
    expect(container.innerHTML).toBe(html);
    expect(reader.readDOM(container, activeScope())).toEqual(logicalBefore);
  } finally {
    observer.disconnect();
  }
}

describe('prevalidation', () => {
  const next = freeze(root(keyed('b'), keyed('a')));
  const reuseA = { op: 'reuse', oldIndex: 0, patch: { op: 'keep', next: next.children[1] } } as const;
  const reuseB = { op: 'reuse', oldIndex: 1, patch: { op: 'keep', next: next.children[0] } } as const;
  const invalidPlans: readonly [string, ChildrenPlan][] = [
    ['duplicate oldIndex', { ordered: [reuseA, reuseA], remove: [1] }],
    ['negative oldIndex', { ordered: [{ ...reuseB, oldIndex: -1 }, reuseA], remove: [1] }],
    ['out of range oldIndex', { ordered: [{ ...reuseB, oldIndex: 2 }, reuseA], remove: [1] }],
    ['fractional oldIndex', { ordered: [{ ...reuseB, oldIndex: 0.5 }, reuseA], remove: [1] }],
    ['NaN oldIndex', { ordered: [{ ...reuseB, oldIndex: Number.NaN }, reuseA], remove: [1] }],
    ['missing old index', { ordered: [{ op: 'create', next: next.children[0] }, reuseA], remove: [] }],
    ['duplicate remove', { ordered: [{ op: 'create', next: next.children[0] }, reuseA], remove: [1, 1] }],
    ['remove overlaps ordered', { ordered: [reuseB, reuseA], remove: [1] }],
    ['remove out of range', { ordered: [reuseB, reuseA], remove: [2] }],
    ['remove negative', { ordered: [reuseB, reuseA], remove: [-1] }],
    ['ordered too short', { ordered: [reuseB], remove: [0] }],
    ['ordered too long', { ordered: [reuseB, reuseA, { op: 'create', next: keyed('extra') }], remove: [] }],
  ];

  it.each(invalidPlans)('[DIFF-01][PATCH-02][QA-03][임시 OPEN-09] invalid plan %s는 DOM을 바꾸기 전에 거부한다', (_name, children) => {
    assertRejectedWithoutWrites({ previous, next, hasChanges: true, children });
  });

  it('[PATCH-02][QA-03][임시 OPEN-09] 뒤쪽 하위 계획 오류를 앞쪽 텍스트·속성 쓰기 전에 발견한다', () => {
    patch.applyPlan(container, differ.diff(previous, root()), activeScope());
    previous = freeze(root(element('p', [text('old')]), element('section', [keyed('x')])));
    patch.mountTree(container, previous, activeScope());
    const target = root(element('p', [text('new')], { attrs: { title: 'new' } }), element('section', [keyed('x')]));
    const plan: PatchPlan = {
      previous, next: target, hasChanges: true,
      children: { ordered: [
        { op: 'reuse', oldIndex: 0, patch: { op: 'element', next: element('p', [text('new')], { attrs: { title: 'new' } }), children: {
          ordered: [{ op: 'reuse', oldIndex: 0, patch: { op: 'text', next: text('new') } }], remove: [],
        } } },
        { op: 'reuse', oldIndex: 1, patch: { op: 'element', next: element('section', [keyed('x')]), children: {
          ordered: [{ op: 'reuse', oldIndex: 99, patch: { op: 'keep', next: keyed('x') } }], remove: [0],
        } } },
      ], remove: [] },
    };
    assertRejectedWithoutWrites(plan);
  });

  const invalidTrees: readonly [string, VRoot][] = [
    ['duplicate key', root(keyed('x'), keyed('x'))],
    ['empty key', root(element('p', [], { key: '' }))],
    ['reserved data-key', root(element('p', [], { attrs: { 'data-key': 'x' } }))],
    ['duplicate ID', root(element('p', [], { attrs: { id: 'x' } }), element('p', [], { attrs: { id: 'x' } }))],
    ['missing reference', root(element('label', [], { attrs: { for: 'absent' } }))],
    ['unsupported attribute', root(element('p', [], { attrs: { style: 'color:red' } }))],
  ];

  it.each(invalidTrees)('[PATCH-01][PATCH-02][임시 OPEN-01][임시 OPEN-09] %s를 포함한 전체 다음 트리는 연결·변경 전에 거부한다', (_name, invalid) => {
    const nextTree = freeze(root(element('p', [text('would change')]), ...invalid.children));
    const plan: PatchPlan = {
      previous, next: nextTree, hasChanges: true,
      children: { ordered: nextTree.children.map((node) => ({ op: 'create', next: node })), remove: [0, 1] },
    };
    assertRejectedWithoutWrites(plan);
    const fresh = host();
    const freshScope = bindings.createDOMScope(fresh);
    try {
      const observer = new MutationObserver(() => undefined);
      observer.observe(fresh, { subtree: true, childList: true, attributes: true });
      try {
        expect(() => patch.mountTree(fresh, nextTree, freshScope)).toThrow();
        expect(fresh.childNodes).toHaveLength(0);
        expect(observer.takeRecords()).toEqual([]);
      } finally {
        observer.disconnect();
      }
    } finally {
      bindings.releaseDOMScope(freshScope);
    }
  });

  it('[PATCH-02][임시 OPEN-01][임시 OPEN-09] 검증 실패로 기존 이벤트 바인딩을 해제하거나 새 핸들러를 활성화하지 않는다', () => {
    const oldHandler = vi.fn<(event: Event) => void>();
    const newHandler = vi.fn<(event: Event) => void>();
    patch.applyPlan(container, differ.diff(previous, root()), activeScope());
    previous = root(element('button', [text('old')], {
      attrs: { type: 'button' }, domProps: { disabled: false }, events: { click: oldHandler },
    }));
    patch.mountTree(container, previous, activeScope());
    const oldButton = container.firstElementChild;
    const nextTree = root(element('button', [text('new')], {
      attrs: { type: 'button' }, domProps: { disabled: false }, events: { click: newHandler },
    }), keyed('duplicate'), keyed('duplicate'));
    assertRejectedWithoutWrites({
      previous, next: nextTree, hasChanges: true,
      children: { ordered: nextTree.children.map((node) => ({ op: 'create', next: node })), remove: [0] },
    });
    oldButton?.dispatchEvent(new Event('click'));
    expect(oldHandler).toHaveBeenCalledTimes(1);
    expect(newHandler).not.toHaveBeenCalled();
  });
});
