import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistory, commitHistory, moveHistory } from '../src/history.js';
import { deepFreeze, element, snapshot, text } from './fixtures.js';

const state = (label, source = `<p>${label}</p>`) => snapshot(element('p', [text(label)]), source);
// createHistory에 결함이 있어도 commit/move 테스트의 준비 단계는 독립적이다.
const historyOf = (entries, index = entries.length - 1) => ({ entries, index });

test('H-01: 초기 상태는 인덱스 0의 전체 스냅샷 하나', () => {
  const initial = deepFreeze(state('A'));
  assert.deepEqual(createHistory(initial), { entries: [initial], index: 0 });
});

test('H-01: 커밋은 전체 트리와 정확한 소스를 저장', () => {
  const initial = deepFreeze(historyOf([state('A')]));
  const next = deepFreeze(state('B', '<p>\n B\n</p>'));
  assert.deepEqual(commitHistory(initial, next), {
    entries: [state('A'), next], index: 1,
  });
});

test('H-01: A → B → C → 뒤로(B) → 앞으로(C) 연결', () => {
  const a = state('A');
  const b = state('B');
  const c = state('C');
  const atC = commitHistory(commitHistory(createHistory(a), b), c);
  assert.deepEqual(atC, { entries: [a, b, c], index: 2 });
  const atB = moveHistory(atC, -1);
  assert.deepEqual(atB, { entries: [a, b, c], index: 1 });
  assert.deepEqual(moveHistory(atB, 1), { entries: [a, b, c], index: 2 });
});

test('H-02: 과거에서 다른 트리를 커밋하면 기존 미래 전체를 제거', () => {
  const atB = deepFreeze(historyOf([state('A'), state('B'), state('C'), state('E')], 1));
  assert.deepEqual(commitHistory(atB, state('D')), {
    entries: [state('A'), state('B'), state('D')], index: 2,
  });
});

test('H-03: 같은 트리 커밋은 길이·위치·미래 전체를 보존', () => {
  const atB = deepFreeze(historyOf([state('A'), state('B'), state('C')], 1));
  assert.deepEqual(commitHistory(atB, state('B')), atB);
});

test('H-03: 과거에서 소스만 수정해도 미래 보존 및 앞으로 이동 가능', () => {
  const atB = deepFreeze(historyOf([state('A'), state('B'), state('C')], 1));
  const editedB = state('B', '<p><!-- 메모 -->B</p>');
  const result = commitHistory(atB, editedB);
  assert.deepEqual(result, { entries: [state('A'), editedB, state('C')], index: 1 });
  assert.deepEqual(moveHistory(result, 1), {
    entries: [state('A'), editedB, state('C')], index: 2,
  });
  assert.equal(atB.entries[1].source, '<p>B</p>');
});

test('H-03: 속성 순서만 다르면 같은 트리로 판별', () => {
  const oldTree = element('p', [text('사과')], { class: 'cart', title: '목록' });
  const nextTree = element('p', [text('사과')], { title: '목록', class: 'cart' });
  const original = historyOf([snapshot(oldTree, '이전 소스')]);
  const result = commitHistory(original, snapshot(nextTree, '새 소스'));
  assert.equal(result.entries.length, 1);
  assert.equal(result.index, 0);
  assert.deepEqual(result.entries[0].tree, nextTree);
  assert.equal(result.entries[0].source, '새 소스');
});

const changeCases = [
  ['속성', element('p', [text('A')], { class: 'changed' })],
  ['태그', element('strong', [text('A')])],
  ['키', element('p', [text('A')], { 'data-key': 'new' })],
  ['자식 추가', element('p', [text('A'), element('span', [text('추가')])])],
  ['텍스트 경계', element('p', [text(''), text('A')])],
];
for (const [name, nextTree] of changeCases) {
  test(`H-02: 텍스트가 같아도 ${name} 변경은 새 이력`, () => {
    const original = deepFreeze(historyOf([state('A'), state('미래')], 0));
    const next = snapshot(nextTree, '컨트롤러가 검증한 소스');
    assert.deepEqual(commitHistory(original, next), {
      entries: [state('A'), next], index: 1,
    });
  });
}

test('H-02: 동일 항목의 자식 순서 변경은 새 이력', () => {
  const a = element('li', [text('사과')], { 'data-key': 'a' });
  const b = element('li', [text('배')], { 'data-key': 'b' });
  const first = snapshot(element('ul', [a, b]), '이전 소스');
  const next = snapshot(element('ul', [b, a]), '새 소스');
  assert.deepEqual(commitHistory(deepFreeze(historyOf([first])), next), {
    entries: [first, next], index: 1,
  });
});

for (const [name, index, direction, expectedIndex] of [
  ['처음에서 뒤로', 0, -1, 0],
  ['마지막에서 앞으로', 2, 1, 2],
  ['마지막에서 뒤로', 2, -1, 1],
  ['중간에서 앞으로', 1, 1, 2],
  ['중간에서 뒤로', 1, -1, 0],
]) {
  test(`H-03: ${name}는 올바른 인덱스와 모든 스냅샷 보존`, () => {
    const entries = [state('A'), state('B'), state('C')];
    const original = deepFreeze(historyOf(entries, index));
    assert.deepEqual(moveHistory(original, direction), { entries, index: expectedIndex });
    assert.equal(original.index, index);
  });
}

test('H-03: 이력이 하나일 때 양쪽 경계를 넘지 않음', () => {
  const initial = deepFreeze(historyOf([state('A')]));
  assert.deepEqual(moveHistory(initial, -1), initial);
  assert.deepEqual(moveHistory(initial, 1), initial);
});

test('H-03: 커밋은 기존 이력과 입력 스냅샷을 변경하지 않음', () => {
  const original = deepFreeze(historyOf([state('A'), state('미래')], 0));
  const next = deepFreeze(state('B'));
  const saved = structuredClone({ original, next });
  commitHistory(original, next);
  assert.deepEqual({ original, next }, saved);
});

test('H-03: 초기화 후 호출자가 입력 객체를 바꿔도 저장 상태 보존', () => {
  const initial = state('A');
  const history = createHistory(initial);
  initial.tree.children[0].value = '외부 변경';
  initial.source = '외부 변경';
  assert.deepEqual(history, { entries: [state('A')], index: 0 });
});

test('H-03: 커밋 후 호출자가 입력 객체를 바꿔도 저장 상태 보존', () => {
  const next = state('B');
  const history = commitHistory(historyOf([state('A')]), next);
  next.tree.attrs.title = '외부 변경';
  next.tree.children.push(text('외부 변경'));
  next.source = '외부 변경';
  assert.deepEqual(history, { entries: [state('A'), state('B')], index: 1 });
});

for (const direction of [0, 2, -2, 0.5, NaN, '1', undefined]) {
  test(`H-03: -1/+1 이외의 이동값 ${String(direction)} 거부`, () => {
    const history = deepFreeze(historyOf([state('A')]));
    assert.throws(() => moveHistory(history, direction), { code: 'ERR_INVALID_HISTORY' });
  });
}

for (const [name, invalid] of [
  ['빈 이력', { entries: [], index: 0 }],
  ['음수 인덱스', historyOf([state('A')], -1)],
  ['범위 밖 인덱스', historyOf([state('A')], 1)],
  ['정수 아닌 인덱스', historyOf([state('A')], 0.5)],
]) {
  test(`H-03: 잘못된 상태(${name})에서 이동·커밋 거부`, () => {
    assert.throws(() => moveHistory(invalid, 1), { code: 'ERR_INVALID_HISTORY' });
    assert.throws(() => commitHistory(invalid, state('B')), { code: 'ERR_INVALID_HISTORY' });
  });
}

for (const [name, invalid] of [
  ['스냅샷 없음', null],
  ['소스가 문자열 아님', snapshot(element('p'), 1)],
]) {
  test(`H-03: 잘못된 스냅샷(${name})으로 초기화·커밋 거부`, () => {
    assert.throws(() => createHistory(invalid), { code: 'ERR_INVALID_HISTORY' });
    assert.throws(() => commitHistory(historyOf([state('A')]), invalid), { code: 'ERR_INVALID_HISTORY' });
  });
}

test('H-03: 빈 문자열 소스는 유효하며 그대로 보존', () => {
  const initial = snapshot(element('p'), '');
  assert.deepEqual(createHistory(initial), { entries: [initial], index: 0 });
});

test('H-03: 현재 위치 밖 손상된 이력도 이동·커밋 전에 거부', () => {
  const invalid = historyOf([state('A'), { tree: element('p'), source: null }], 0);
  assert.throws(() => moveHistory(invalid, 1), { code: 'ERR_INVALID_HISTORY' });
  assert.throws(() => commitHistory(invalid, state('B')), { code: 'ERR_INVALID_HISTORY' });
});

test('H-03: 저장 전 VNode 검증 오류를 구분하여 전달', () => {
  const cyclic = element('div');
  cyclic.children.push(cyclic);
  assert.throws(() => createHistory(snapshot(cyclic)), { code: 'ERR_INVALID_VNODE' });
  const duplicate = snapshot(element('ul', [
    element('li', [], { 'data-key': 'a' }), element('li', [], { 'data-key': 'a' }),
  ]));
  assert.throws(() => commitHistory(historyOf([state('A')]), duplicate), { code: 'ERR_DUPLICATE_KEY' });
});
