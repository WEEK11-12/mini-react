// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { projectModule } from '../support/project';
import { element, freeze, keyed, root, text } from './fixtures';
import type { DiffModule, VRoot } from './fixtures';

describe('diff', () => {
  it('[DIFF-03] 새 객체·속성 열거 순서만 다르면 hasChanges=false이고 ordered는 다음 자식에 대응한다', async () => {
    const { diff } = await projectModule<DiffModule>('core/diff.ts');
    const previous = freeze(root(element('p', [text(' ')], { attrs: { class: 'c', title: 't' } })));
    const next = freeze(root(element('p', [text(' ')], { attrs: { title: 't', class: 'c' } })));
    const plan = diff(previous, next);
    expect(plan.hasChanges).toBe(false);
    expect(plan.previous).toEqual(previous);
    expect(plan.next).toEqual(next);
    expect(plan.children.ordered).toHaveLength(1);
    expect(plan.children.remove).toEqual([]);
    expect(diff(root(), root()).hasChanges).toBe(false);
  });

  it('[DIFF-01][DIFF-03] key 재정렬은 내용이 같아도 hasChanges=true이고 원래 인덱스로 대응한다', async () => {
    const { diff } = await projectModule<DiffModule>('core/diff.ts');
    const previous = freeze(root(keyed('a'), keyed('b'), keyed('c')));
    const next = freeze(root(keyed('c'), keyed('a'), keyed('b')));
    const plan = diff(previous, next);
    expect(plan.hasChanges).toBe(true);
    expect(plan.children.ordered).toHaveLength(3);
    [2, 0, 1].forEach((oldIndex, index) => {
      const placement = plan.children.ordered[index];
      expect(placement).toMatchObject({ op: 'reuse', oldIndex });
      if (placement.op !== 'reuse') throw new Error('Expected an existing keyed node to be reused');
      expect(placement.patch.next).toEqual(next.children[index]);
    });
    expect(plan.children.remove).toEqual([]);
  });

  it('[DIFF-01] 삽입·삭제·태그 교체 계획은 변경 전 인덱스를 중복 소비하지 않는다', async () => {
    const { diff } = await projectModule<DiffModule>('core/diff.ts');
    const previous = freeze(root(keyed('a'), keyed('b'), keyed('c'), keyed('gone')));
    const next = freeze(root(keyed('new'), keyed('c'), keyed('b', 'span')));
    const plan = diff(previous, next);
    expect(plan.hasChanges).toBe(true);
    expect(plan.children.ordered).toHaveLength(3);
    expect(plan.children.ordered[0]).toEqual({ op: 'create', next: next.children[0] });
    const reused = plan.children.ordered[1];
    expect(reused).toMatchObject({ op: 'reuse', oldIndex: 2 });
    if (reused.op !== 'reuse') throw new Error('Expected key c to be reused');
    expect(reused.patch.next).toEqual(next.children[1]);
    expect(plan.children.ordered[2]).toEqual({ op: 'replace', oldIndex: 1, next: next.children[2] });
    expect([...plan.children.remove].sort()).toEqual([0, 3]);
  });

  it('[DIFF-01] 혼합 자식은 keyed 부분목록이 아닌 공백을 포함한 전체 인덱스로 unkeyed를 대응한다', async () => {
    const { diff } = await projectModule<DiffModule>('core/diff.ts');
    const previous = freeze(root(keyed('a'), text(' '), element('span', [text('old')]), keyed('b')));
    const next = freeze(root(keyed('b'), text('\n'), element('span', [text('new')]), keyed('a')));
    const plan = diff(previous, next);
    expect(plan.children.ordered.map((placement) => placement.op === 'create' ? null : placement.oldIndex)).toEqual([3, 1, 2, 0]);
    expect(plan.children.remove).toEqual([]);
    expect(plan.hasChanges).toBe(true);
  });

  it('[DIFF-01] unkeyed가 다른 전체 인덱스로 밀리면 그 이전 unkeyed를 검색해 재사용하지 않는다', async () => {
    const { diff } = await projectModule<DiffModule>('core/diff.ts');
    const previous = freeze(root(keyed('a'), element('span'), text(' ')));
    const next = freeze(root(element('span'), keyed('a'), text(' ')));
    const plan = diff(previous, next);
    expect(plan.children.ordered[0]).toEqual({ op: 'create', next: next.children[0] });
    expect(plan.children.ordered[1]).toMatchObject({ op: 'reuse', oldIndex: 0 });
    expect(plan.children.ordered[2]).toMatchObject({ op: 'reuse', oldIndex: 2 });
    expect(plan.children.remove).toEqual([1]);
  });

  const changes: readonly [string, VRoot, VRoot][] = [
    ['add', root(), root(element('p'))],
    ['remove', root(element('p')), root()],
    ['kind', root(text('x')), root(element('p'))],
    ['tag', root(element('p')), root(element('span'))],
    ['key', root(keyed('a')), root(keyed('b'))],
    ['key added', root(element('p')), root(element('p', [], { key: 'a' }))],
    ['key removed', root(element('p', [], { key: 'a' })), root(element('p'))],
    ['whitespace', root(text(' ')), root(text('\n'))],
    ['empty text', root(text('')), root(text('x'))],
    ['attr add', root(element('p')), root(element('p', [], { attrs: { title: 't' } }))],
    ['attr remove', root(element('p', [], { attrs: { title: 't' } })), root(element('p'))],
    ['attr change', root(element('p', [], { attrs: { title: 'a' } })), root(element('p', [], { attrs: { title: 'b' } }))],
  ];
  it.each(changes)('[DIFF-01][DIFF-02][DIFF-03] %s는 의미상 변경이며 두 입력을 수정하지 않는다', async (_name, previous, next) => {
    const { diff } = await projectModule<DiffModule>('core/diff.ts');
    const before = JSON.stringify([previous, next]);
    freeze(previous);
    freeze(next);
    const plan = diff(previous, next);
    expect(plan.hasChanges).toBe(true);
    expect(plan.next).toEqual(next);
    expect(JSON.stringify([previous, next])).toBe(before);
  });

  it('[DIFF-02][DIFF-03][임시 OPEN-01] 현재 폼 값과 이벤트 함수 참조를 비교한다', async () => {
    const { diff } = await projectModule<DiffModule>('core/diff.ts');
    const handler = vi.fn<(event: Event) => void>();
    const replacement = vi.fn<(event: Event) => void>();
    const field = (value: string, click: (event: Event) => void): VRoot => root(element('input', [], {
      attrs: { type: 'text' }, domProps: { value, disabled: false }, events: { click },
    }));
    expect(diff(field('a', handler), field('a', handler)).hasChanges).toBe(false);
    expect(diff(field('a', handler), field('b', handler)).hasChanges).toBe(true);
    expect(diff(field('a', handler), field('a', replacement)).hasChanges).toBe(true);
    expect(handler).not.toHaveBeenCalled();
    expect(replacement).not.toHaveBeenCalled();
  });

  it.each(['disabled', 'checked'] as const)(
    '[DIFF-02][DIFF-03][임시 OPEN-01] %s만 달라지면 변경이며 같은 값은 무변경이다',
    async (property) => {
      const { diff } = await projectModule<DiffModule>('core/diff.ts');
      const field = (value: boolean): VRoot => freeze(root(element(
        property === 'checked' ? 'input' : 'button', [], {
          attrs: { type: property === 'checked' ? 'checkbox' : 'button' },
          domProps: property === 'checked'
            ? { value: 'on', checked: value, disabled: false }
            : { disabled: value },
        },
      )));
      expect(diff(field(false), field(false)).hasChanges).toBe(false);
      expect(diff(field(true), field(true)).hasChanges).toBe(false);
      expect(diff(field(false), field(true)).hasChanges).toBe(true);
      expect(diff(field(true), field(false)).hasChanges).toBe(true);
    },
  );

  it('[DIFF-01][임시 OPEN-09] 다음 또는 이전 형제 key 중복을 계획 생성 전에 거부한다', async () => {
    const { diff } = await projectModule<DiffModule>('core/diff.ts');
    const invalid = freeze(root(keyed('x'), keyed('x')));
    const valid = freeze(root(keyed('x')));
    expect(() => diff(valid, invalid)).toThrow();
    expect(() => diff(invalid, valid)).toThrow();
  });
});
