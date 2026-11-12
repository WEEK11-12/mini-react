// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { diff } from '../../src/core/diff';
import type { ChildrenPlan, VElement, VNode, VRoot } from './fixtures';
import { element, keyed, root, text } from './fixtures';

function ownRecord<T extends object>(values: T, hidden: boolean): T {
  const result = Object.create(null) as T;
  for (const name of Object.getOwnPropertyNames(values)) {
    Object.defineProperty(result, name, { value: Reflect.get(values, name), enumerable: !hidden });
  }
  return result;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Reflect.ownKeys(value)) deepFreeze(Reflect.get(value, key));
    Object.freeze(value);
  }
  return value;
}

function sameMap(a: object, b: object): boolean {
  const names = Object.getOwnPropertyNames(a).sort();
  return JSON.stringify(names) === JSON.stringify(Object.getOwnPropertyNames(b).sort())
    && names.every((name) => Reflect.get(a, name) === Reflect.get(b, name));
}

// Semantic equality is independent of the generated plan and matching algorithm.
function sameNode(a: VNode, b: VNode): boolean {
  if (a.kind === 'text' || b.kind === 'text') return a.kind === 'text' && b.kind === 'text' && a.value === b.value;
  return a.tag === b.tag && a.key === b.key
    && sameMap(a.attrs, b.attrs) && sameMap(a.domProps, b.domProps) && sameMap(a.events, b.events)
    && sameChildren(a.children, b.children);
}

function sameChildren(a: readonly VNode[], b: readonly VNode[]): boolean {
  return a.length === b.length && a.every((node, index) => sameNode(node, b[index]));
}

// Check the public contract, not an alternative renderer or applyPlan implementation.
function checkChildren(previous: readonly VNode[], next: readonly VNode[], plan: ChildrenPlan): void {
  expect(plan.ordered).toHaveLength(next.length);
  const allOld = [...plan.remove];
  plan.ordered.forEach((placement, index) => {
    const node = next[index];
    const matches = previous.map((old, oldIndex) => ({ old, oldIndex })).filter(({ old, oldIndex }) => {
      if (node.kind === 'element' && node.key !== undefined) return old.kind === 'element' && old.key === node.key;
      return oldIndex === index && (old.kind === 'text' || old.key === undefined);
    });
    expect(matches.length).toBeLessThanOrEqual(1);
    if (matches.length === 0) {
      expect(placement.op).toBe('create');
      if (placement.op === 'create') expect(placement.next).toBe(node);
      return;
    }
    const { old, oldIndex } = matches[0];
    expect(placement.op).not.toBe('create');
    if (placement.op === 'create') return;
    expect(placement.oldIndex).toBe(oldIndex);
    allOld.push(placement.oldIndex);
    const compatible = old.kind === node.kind && (old.kind !== 'element' || (node.kind === 'element' && old.tag === node.tag));
    expect(placement.op).toBe(compatible ? 'reuse' : 'replace');
    if (placement.op === 'replace') {
      expect(placement.next).toBe(node);
      return;
    }
    expect(placement.patch.next).toBe(node);
    expect(placement.patch.op).toBe(sameNode(old, node) ? 'keep' : node.kind === 'text' ? 'text' : 'element');
    if (placement.patch.op === 'element' && old.kind === 'element' && node.kind === 'element') {
      checkChildren(old.children, node.children, placement.patch.children);
    }
  });
  expect(allOld.sort((a, b) => a - b)).toEqual(previous.map((_node, index) => index));
}

function check(previous: VRoot, next: VRoot): ReturnType<typeof diff> {
  deepFreeze(previous);
  deepFreeze(next);
  const plan = diff(previous, next);
  expect(plan.previous).toBe(previous);
  expect(plan.next).toBe(next);
  expect(plan.hasChanges).toBe(!sameChildren(previous.children, next.children));
  checkChildren(previous.children, next.children, plan.children);
  return plan;
}

describe('Diff 단계 경계 계약', () => {
  it('[DIFF-01][DIFF-03] 짧은 혼합 배열의 모든 조합은 oldIndex를 완전분할하고 의미상 변경과 일치한다', () => {
    const atoms = [text(' '), text(''), element('span'), keyed('a'), keyed('b'), keyed('a', 'section')];
    const lists: VNode[][] = [[], ...atoms.map((node) => [node])];
    for (const a of atoms) for (const b of atoms) {
      if (a.kind === 'element' && a.key !== undefined && b.kind === 'element' && a.key === b.key) continue;
      lists.push([a, b]);
    }
    for (const previous of lists) for (const next of lists) check(root(...previous), root(...next));
    // Include parent-level movement with a separate local oldIndex namespace.
    for (const previous of lists) for (const next of lists) {
      check(root(keyed('sibling'), element('div', previous, { key: 'parent' })),
        root(element('div', next, { key: 'parent' }), keyed('sibling')));
    }
  }, 30000);

  it('[DIFF-01] 여러 깊이에서 이동·삽입·삭제·교체가 섞여도 각 부모의 원래 인덱스를 유지한다', () => {
    check(root(element('section', [keyed('gone'), element('div', [keyed('a'), text(' '), keyed('b'), element('span')], { key: 'inner' })], { key: 'outer' }), keyed('tail')),
      root(keyed('tail'), element('section', [element('div', [keyed('b'), text('\n'), keyed('new'), keyed('a', 'span')], { key: 'inner' })], { key: 'outer' })));
  });

  it('[DIFF-01] 다른 부모로 옮긴 key는 전역 재사용하지 않고 부모 교체는 하위 계획을 재사용하지 않는다', () => {
    const previous = root(element('div', [keyed('same')], { key: 'left' }), element('div', [], { key: 'right' }));
    const next = root(element('div', [], { key: 'left' }), element('div', [keyed('same')], { key: 'right' }));
    const plan = check(previous, next);
    expect(plan.children.ordered[0]).toMatchObject({ patch: { children: { remove: [0], ordered: [] } } });
    expect(plan.children.ordered[1]).toMatchObject({ patch: { children: { remove: [], ordered: [{ op: 'create' }] } } });
    const replaced = check(root(element('div', [keyed('same')], { key: 'parent' })), root(element('section', [keyed('same')], { key: 'parent' })));
    expect(replaced.children.ordered[0]).toMatchObject({ op: 'replace', oldIndex: 0 });
    check(root(element('div', [keyed('same')]), element('div', [keyed('same')])) , root(element('div', [keyed('same')]), element('div', [keyed('same')])));
  });

  it.each(['text', 'attrs', 'domProps', 'events', 'order'] as const)('[DIFF-02][DIFF-03] 깊은 하위 %s 변경이 루트 hasChanges까지 전파된다', (change) => {
    const handler = vi.fn();
    const before = element('input', [], { attrs: { type: 'text' }, domProps: { value: 'old' }, events: { input: handler } });
    const after = change === 'attrs' ? { ...before, attrs: { type: 'text', title: 'new' } }
      : change === 'domProps' ? { ...before, domProps: { value: 'new' } }
      : change === 'events' ? { ...before, events: { input: vi.fn() } } : before;
    const wrap = (nodes: VNode[]) => root(element('main', [element('section', [element('div', nodes)])]));
    const nextChildren = change === 'order' ? [keyed('b'), keyed('a'), after, text('old')] : [keyed('a'), keyed('b'), after, text(change === 'text' ? 'new' : 'old')];
    expect(check(wrap([keyed('a'), keyed('b'), before, text('old')]), wrap(nextChildren)).hasChanges).toBe(true);
    expect(handler).not.toHaveBeenCalled();
  });

  it.each(['attrs', 'domProps', 'events'] as const)('[DIFF-02][DIFF-03] 비열거 own %s의 추가·삭제·교체와 순서 무관성을 비교한다', (field) => {
    const a = vi.fn();
    const b = vi.fn();
    const maps = field === 'attrs' ? [{ title: 'a', class: 'x' }, { title: 'b', class: 'x' }, { class: 'x' }, { class: 'x', title: 'a' }]
      : field === 'domProps' ? [{ value: 'a', disabled: false }, { value: 'b', disabled: false }, { disabled: false }, { disabled: false, value: 'a' }]
      : [{ input: a, change: a }, { input: b, change: a }, { change: a }, { change: a, input: a }];
    const make = (map: object, hidden: boolean) => root(element('input', [], { attrs: { type: 'text' }, [field]: ownRecord(map, hidden) }));
    for (const hidden of [false, true]) {
      const previous = make(maps[0], hidden);
      expect(check(previous, make(maps[3], !hidden)).hasChanges).toBe(false);
      for (const map of [maps[1], maps[2], {}]) {
        expect(check(previous, make(map, !hidden)).hasChanges).toBe(true);
        expect(check(make(map, !hidden), previous).hasChanges).toBe(true);
      }
    }
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });

  it.each(['click', 'input', 'change'] as const)('[DIFF-02] %s 이벤트의 추가·삭제·동일 함수·새 함수는 핸들러를 실행하지 않는다', (name) => {
    const handler = vi.fn();
    const replacement = vi.fn();
    const tree = (events: VElement['events']) => root(element('button', [], { events }));
    check(tree({}), tree({ [name]: handler }));
    check(tree({ [name]: handler }), tree({}));
    check(tree({ [name]: handler }), tree({ [name]: handler }));
    check(tree({ [name]: handler }), tree({ [name]: replacement }));
    expect(handler).not.toHaveBeenCalled();
    expect(replacement).not.toHaveBeenCalled();
  });

  it('[DIFF-03] 같은 객체도 전체 검증하며 유효한 frozen 입력은 keep으로 남긴다', () => {
    const tree = root(element('div', [text(' '), keyed('a')]));
    expect(check(tree, tree).hasChanges).toBe(false);
  });

  const invalid: readonly [string, unknown][] = [
    ['null root', null],
    ['wrong root', { kind: 'element', children: [] }],
    ['sparse children', { kind: 'root', children: Array(1) }],
    ['duplicate nested key', root(element('div', [keyed('x'), keyed('x')]))],
    ['empty key', root(element('p', [], { key: '' }))],
    ['numeric key', root({ ...element('p'), key: 1 } as unknown as VElement)],
    ['null key', root({ ...element('p'), key: null } as unknown as VElement)],
    ['NUL key', root(keyed('\u0000'))],
    ['surrogate key', root(keyed('\ud800'))],
    ['reserved attribute', root(element('p', [], { attrs: ownRecord({ 'data-key': 'x' }, true) }))],
    ['hidden unsupported attr', root(element('p', [], { attrs: ownRecord({ style: 'bad' }, true) }))],
    ['hidden unsupported prop', root(element('input', [], { domProps: ownRecord({ checked: true }, true) }))],
    ['hidden invalid event', root(element('p', [], { events: ownRecord({ click: 1 }, true) as unknown as VElement['events'] }))],
    ['symbol attr', root(element('p', [], { attrs: { [Symbol('x')]: 'x' } }))],
    ['symbol prop', root(element('input', [], { domProps: { [Symbol('x')]: 'x' } }))],
    ['symbol event', root(element('p', [], { events: { [Symbol('x')]: () => undefined } }))],
    ['duplicate ID', root(element('p', [], { attrs: { id: 'x' } }), element('span', [], { attrs: { id: 'x' } }))],
    ['missing ID target', root(element('div', [], { attrs: { 'aria-controls': 'missing' } }))],
    ['invalid late subtree', root(text('would change'), element('section', [element('script')]))],
  ];
  it.each(invalid)('[DIFF-01][임시 OPEN-09] %s를 양쪽 입력과 같은 객체 입력에서도 거부한다', (_name, value) => {
    const bad = deepFreeze(value) as VRoot;
    const valid = deepFreeze(root(keyed('valid')));
    expect(() => diff(bad, valid)).toThrow();
    expect(() => diff(valid, bad)).toThrow();
    expect(() => diff(bad, bad)).toThrow();
  });

  it('[DIFF-01] 순환 입력은 같은 객체여도 거부한다', () => {
    const children: VNode[] = [];
    const cyclic = element('div', children);
    children.push(cyclic);
    const invalidRoot = root(cyclic);
    expect(() => diff(invalidRoot, invalidRoot)).toThrow('Cyclic VNode');
  });

  it('[DIFF-01][DIFF-03] key는 trim·숫자 변환·객체 프로퍼티 충돌 없이 정확히 대응한다', () => {
    const keys = [' a ', 'a', '01', '1', '__proto__', 'constructor', '😀', '"&\n'];
    check(root(...keys.map((key) => keyed(key))), root(...keys.toReversed().map((key) => keyed(key))));
  });

  it('[DIFF-01][DIFF-02] DOM 전역 접근을 차단해도 정상·오류 경로가 동작한다', () => {
    const names = ['document', 'window', 'Node', 'Element', 'MutationObserver'] as const;
    const descriptors = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
    const accesses: string[] = [];
    try {
      names.forEach((name) => Object.defineProperty(globalThis, name, { configurable: true, get() {
        accesses.push(name);
        throw new Error(`Unexpected DOM access: ${name}`);
      } }));
      const plan = diff(root(keyed('a'), text(' ')), root(text('\n'), keyed('a')));
      if (!plan.hasChanges) throw new Error('Missing changes');
      let rejected = false;
      try { diff(root(keyed('x'), keyed('x')), root()); } catch { rejected = true; }
      if (!rejected) throw new Error('Invalid tree accepted');
    } finally {
      names.forEach((name, index) => {
        const descriptor = descriptors[index];
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      });
    }
    expect(accesses).toEqual([]);
  });
});
