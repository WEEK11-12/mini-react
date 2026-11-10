import { describe, expect, it } from 'vitest';
import { expectSameNodes } from '../support/observations';
import { assertPrepend, type PrependObservation } from '../support/prepend-observation';

// Native DOM fixtures only. No renderer, component, Hook or application replacement.
function item(key: string): HTMLLIElement {
  const node = document.createElement('li');
  node.setAttribute('data-key', key);
  node.textContent = key;
  return node;
}

function listObservation(
  parent: HTMLUListElement,
  before: readonly HTMLLIElement[],
): PrependObservation {
  const elements = Array.from(parent.children);
  const originals = new Map(before.map((node) => [node.getAttribute('data-key')!, node]));
  const beforeKeys = [...originals.keys()];
  return {
    beforeKeys,
    afterKeys: elements.map((node) => node.getAttribute('data-key')!),
    sameNodes: beforeKeys.map((key) =>
      elements.find((node) => node.getAttribute('data-key') === key) === originals.get(key),
    ),
  };
}

describe('검증환경: 실제 DOM matcher와 목록 관찰 반례', () => {
  it('[검증환경] 구조가 같은 복제 노드는 toEqual을 통과하지만 정체성 assertion은 실패한다', () => {
    const original = item('a');
    const clone = original.cloneNode(true);
    expect(clone.isEqualNode(original)).toBe(true);
    expect(() => expect([clone]).toEqual([original])).not.toThrow();
    expect(() => expectSameNodes([clone], [original])).toThrow();
    expect(() => expectSameNodes([original], [original])).not.toThrow();
  });

  it('[검증환경] 구조가 같은 두 노드를 뒤바꾸거나 길이를 바꿔도 정체성 검사는 놓치지 않는다', () => {
    const a = item('same');
    const b = item('same');
    expect(() => expect([b, a]).toEqual([a, b])).not.toThrow();
    expect(() => expectSameNodes([b, a], [a, b])).toThrow();
    expect(() => expectSameNodes([a], [a, b])).toThrow();
  });

  it.each(['no-op', 'delete-all', 'clone-old', 'reorder-old', 'reuse-first-key'] as const)(
    '[검증환경] 앞 삽입 assertion은 %s 반례를 거부한다',
    (mode) => {
      const before = [item('a'), item('b'), item('c')];
      const list = document.createElement('ul');
      list.append(...before);
      if (mode === 'delete-all') list.replaceChildren(item('new'));
      if (mode === 'clone-old') list.replaceChildren(item('new'), ...before.map((node) => node.cloneNode(true)));
      if (mode === 'reorder-old') list.replaceChildren(item('new'), before[2], before[1], before[0]);
      if (mode === 'reuse-first-key') list.prepend(item('a'));
      if (mode === 'no-op' || mode === 'delete-all') {
        const originals = new Map(before.map((node) => [node.getAttribute('data-key'), node]));
        // Reproduce the old browser predicate: both bad transitions used to return true.
        const weak = Array.from(list.children)
          .filter((node) => originals.has(node.getAttribute('data-key')))
          .every((node) => originals.get(node.getAttribute('data-key')) === node);
        expect(weak).toBe(true);
      }
      expect(() => assertPrepend(listObservation(list, before))).toThrow();
    },
  );

  it('[검증환경] 새 첫 항목과 기존 전원의 순서·참조를 유지한 앞 삽입만 허용한다', () => {
    const before = [item('c'), item('b'), item('a')];
    const list = document.createElement('ul');
    list.append(...before);
    list.prepend(item('new'));
    expect(() => assertPrepend(listObservation(list, before))).not.toThrow();
  });
});
