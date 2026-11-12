import { beforeEach, describe, expect, it } from 'vitest';
import { projectModule } from '../support/project';

type VText = { kind: 'text'; value: string };
type VElement = {
  kind: 'element'; tag: string; key?: string;
  attrs: Record<string, string>; domProps: Record<string, string | boolean>;
  events: Record<string, never>; children: (VText | VElement)[];
};
type VRoot = { kind: 'root'; children: (VText | VElement)[] };
interface History {
  current(): VRoot;
  canBack(): boolean;
  canForward(): boolean;
  peek(offset: -1 | 1): VRoot | undefined;
  push(tree: VRoot): void;
  commitMove(offset: -1 | 1): void;
}
interface HistoryModule { HistoryStore: new (initial: VRoot) => History }

function tree(value: string): VRoot {
  return { kind: 'root', children: [{ kind: 'text', value }] };
}

function keyed(key: string, value = '같은 화면'): VRoot {
  return {
    kind: 'root', children: [{
      kind: 'element', tag: 'p', key, attrs: {}, domProps: {}, events: {},
      children: [{ kind: 'text', value }],
    }],
  };
}

function frozen<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(frozen);
    Object.freeze(value);
  }
  return value;
}

let HistoryStore: HistoryModule['HistoryStore'];
beforeEach(async () => {
  ({ HistoryStore } = await projectModule<HistoryModule>('playground/history.ts'));
});

describe('HistoryStore 공개 API 계약', () => {
  it('[HIST-01, HIST-02][임시 OPEN-03·14] 초기 상태를 보존하고 양쪽 경계를 닫는다', () => {
    const initial = tree('A');
    const history = new HistoryStore(initial);
    expect(history.current()).toEqual(initial);
    expect(history.canBack()).toBe(false);
    expect(history.canForward()).toBe(false);
    expect(history.peek(-1)).toBeUndefined();
    expect(history.peek(1)).toBeUndefined();
  });

  it('[HIST-01][임시 OPEN-03] 생성 시 입력을 재귀 복사해 이후 원본 변경으로부터 보호한다', () => {
    const initial = keyed('a');
    const history = new HistoryStore(initial);
    const saved = structuredClone(initial);
    const element = initial.children[0] as VElement;
    element.key = 'changed';
    element.attrs.title = 'changed';
    (element.children[0] as VText).value = 'changed';
    expect(history.current()).toEqual(saved);
    expect(history.current()).not.toBe(initial);
    expect(history.current().children[0]).not.toBe(element);
  });

  it('[HIST-01, HIST-02] 새 상태 저장은 이전 스냅샷을 변경하지 않는다', () => {
    const history = new HistoryStore(tree('A'));
    const a = history.current();
    history.push(frozen(tree('B')));
    expect(a).toEqual(tree('A'));
    expect(history.current()).toEqual(tree('B'));
    expect(history.peek(-1)).toBe(a);
  });

  it('[HIST-01] push 입력은 복사하며 key·속성·중첩 텍스트를 독립 보존한다', () => {
    const history = new HistoryStore(tree('A'));
    const next = keyed('b');
    const saved = structuredClone(next);
    history.push(next);
    (next.children[0] as VElement).key = 'mutated';
    ((next.children[0] as VElement).children[0] as VText).value = 'mutated';
    expect(history.current()).toEqual(saved);
  });

  it('[HIST-02][임시 OPEN-14] peek는 현재 위치를 이동하지 않고 commitMove만 한 단계 이동한다', () => {
    const history = new HistoryStore(tree('A'));
    history.push(tree('B'));
    history.push(tree('C'));
    const c = history.current();
    const b = history.peek(-1);
    expect(b).toEqual(tree('B'));
    expect(history.current()).toBe(c);
    history.commitMove(-1);
    expect(history.current()).toBe(b);
    expect(history.peek(1)).toBe(c);
    history.commitMove(1);
    expect(history.current()).toBe(c);
  });

  it.each([-1, 1] as const)('[HIST-02, QA-03][임시 OPEN-14] 단일 이력의 %i 방향 경계 요청은 무효다', (offset) => {
    const history = new HistoryStore(tree('A'));
    const current = history.current();
    expect(() => history.commitMove(offset)).not.toThrow();
    expect(history.current()).toBe(current);
    expect(history.canBack()).toBe(false);
    expect(history.canForward()).toBe(false);
  });

  it('[HIST-01, HIST-02][임시 OPEN-04] 과거 위치의 실변경 성공은 이후 분기만 제거한다', () => {
    const history = new HistoryStore(tree('A'));
    const a = history.current();
    history.push(tree('B'));
    const b = history.current();
    history.push(tree('C'));
    history.commitMove(-1);
    history.push(tree('E'));
    expect(history.current()).toEqual(tree('E'));
    expect(history.canForward()).toBe(false);
    expect(history.peek(-1)).toBe(b);
    history.commitMove(-1);
    expect(history.peek(-1)).toBe(a);
  });

  it('[HIST-01] 과거 B에서 의미상 같은 별도 객체를 push해도 앞으로 C와 현재 참조를 보존한다', () => {
    const history = new HistoryStore(tree('A'));
    history.push(tree('B'));
    const b = history.current();
    history.push(tree('C'));
    const c = history.current();
    history.commitMove(-1);
    history.push(tree('B'));
    expect(history.current()).toBe(b);
    expect(history.peek(1)).toBe(c);
    expect(history.canForward()).toBe(true);
    history.commitMove(1);
    expect(history.current()).toBe(c);
  });

  it('[HIST-01] 최초·최신 상태에서 반복 무변경 push는 새 이력을 만들지 않는다', () => {
    const history = new HistoryStore(tree('A'));
    const a = history.current();
    for (let i = 0; i < 3; i += 1) history.push(tree('A'));
    expect(history.current()).toBe(a);
    expect(history.canBack()).toBe(false);
    history.push(tree('B'));
    const b = history.current();
    for (let i = 0; i < 3; i += 1) history.push(tree('B'));
    expect(history.current()).toBe(b);
    history.commitMove(-1);
    expect(history.current()).toBe(a);
    expect(history.canBack()).toBe(false);
  });

  it('[HIST-01] A→B→A 실변경은 전역 중복 제거가 아니라 세 번째 적용으로 저장한다', () => {
    const history = new HistoryStore(tree('A'));
    history.push(tree('B'));
    history.push(tree('A'));
    expect(history.current()).toEqual(tree('A'));
    history.commitMove(-1);
    expect(history.current()).toEqual(tree('B'));
    history.commitMove(-1);
    expect(history.current()).toEqual(tree('A'));
    expect(history.canBack()).toBe(false);
  });

  it('[HIST-01, DIFF-03] 속성 열거 순서는 의미상 동일성에 영향을 주지 않는다', () => {
    const initial = keyed('a');
    (initial.children[0] as VElement).attrs = { title: 'x', class: 'y' };
    const history = new HistoryStore(initial);
    const current = history.current();
    const next = keyed('a');
    (next.children[0] as VElement).attrs = { class: 'y', title: 'x' };
    history.push(next);
    expect(history.current()).toBe(current);
    expect(history.canBack()).toBe(false);
  });

  it.each([
    ['key', keyed('b')],
    ['공백 텍스트', keyed('a', '같은 화면 ')],
  ] as const)('[HIST-01, DIFF-03] %s 변경을 새 이력으로 구별한다', (_label, next) => {
    const history = new HistoryStore(keyed('a'));
    history.push(next as VRoot);
    expect(history.canBack()).toBe(true);
    expect(history.current()).toEqual(next);
  });

  it('[HIST-01, DIFF-03] 같은 자식 집합의 순서만 달라져도 새 이력을 저장한다', () => {
    const initial: VRoot = { kind: 'root', children: [...keyed('a').children, ...keyed('b').children] };
    const history = new HistoryStore(initial);
    const next: VRoot = { kind: 'root', children: [...keyed('b').children, ...keyed('a').children] };
    history.push(next);
    expect(history.canBack()).toBe(true);
    expect(history.current()).toEqual(next);
    expect(history.peek(-1)).toEqual(initial);
  });

  it.each([
    ['value', { value: 'edited', disabled: false }],
    ['disabled', { value: '', disabled: true }],
    ['checked', { value: 'on', checked: true, disabled: false }],
  ])('[HIST-01][임시 OPEN-01] 현재 폼 프로퍼티 %s 변경을 저장한다', (_name, domProps) => {
    const checkbox = 'checked' in domProps;
    const initial: VRoot = { kind: 'root', children: [{
      kind: 'element', tag: 'input', attrs: { type: checkbox ? 'checkbox' : 'text' },
      domProps: checkbox ? { value: 'on', checked: false, disabled: false } : { value: '', disabled: false },
      events: {}, children: [],
    }] };
    const history = new HistoryStore(initial);
    const next = structuredClone(initial);
    (next.children[0] as VElement).domProps = domProps;
    history.push(next);
    expect(history.canBack()).toBe(true);
  });

  it('[HIST-01][임시 OPEN-06] 임의의 작은 고정 개수로 오래된 이력을 잘라내지 않는다', () => {
    const history = new HistoryStore(tree('0'));
    for (let index = 1; index <= 64; index += 1) history.push(tree(String(index)));
    for (let index = 64; index > 0; index -= 1) {
      expect(history.current()).toEqual(tree(String(index)));
      history.commitMove(-1);
    }
    expect(history.current()).toEqual(tree('0'));
    expect(history.canBack()).toBe(false);
  });
});
