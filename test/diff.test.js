import test from 'node:test';
import assert from 'node:assert/strict';
import { diff } from '../src/diff.js';
import { deepFreeze, element, text } from './fixtures.js';

// FR-03 / Q-01: 기대값은 diff의 다른 실행 결과가 아니라 직접 확인한 작업이다.
const item = (key, label = key) => element('li', [text(label)], { 'data-key': key });
const list = (...keys) => element('ul', keys.map((key) => item(key)));
const paragraph = (value, attrs = {}) => element('p', [text(value)], attrs);

function assertPlan(before, after, expected) {
  const plan = diff(deepFreeze(before), deepFreeze(after));
  assert.deepEqual(plan.previous, before);
  assert.deepEqual(plan.next, after);
  assert.ok(Array.isArray(plan.operations), 'plan.operations must be an array');
  // 독립 작업의 나열 순서와 속성 삭제 순서는 알고리즘에 강제하지 않는다.
  const normalize = (operations) => operations.map((operation) => {
    const copy = { ...operation };
    if (Array.isArray(copy.remove)) copy.remove = [...copy.remove].sort();
    return copy;
  }).sort((a, b) => JSON.stringify([a.path, a.type, a.index]).localeCompare(
    JSON.stringify([b.path, b.type, b.index]),
  ));
  assert.deepEqual(normalize(plan.operations), normalize(expected));
}

const cases = [
  ['D-04', '같은 객체는 빈 작업 목록', paragraph('상품 1개'), null, []],
  ['D-04', '별도 객체의 동일 내용도 빈 작업 목록', paragraph('상품 1개'), paragraph('상품 1개'), []],
  ['D-04', '속성 나열 순서만 다르면 무변경',
    paragraph('사과', { class: 'cart', title: '목록' }),
    paragraph('사과', { title: '목록', class: 'cart' }), []],
  ['D-01', '중첩된 텍스트의 이전 경로와 목표값',
    element('div', [element('h2', [text('장바구니')]), paragraph('상품 1개')]),
    element('div', [element('h2', [text('장바구니')]), paragraph('상품 2개')]),
    [{ type: 'text', path: [1, 0], value: '상품 2개' }]],
  ['D-01', '빈 문자열도 유효한 텍스트 목표값', paragraph('사과'), paragraph(''),
    [{ type: 'text', path: [0], value: '' }]],
  ['D-01', '속성 변경은 변경된 속성만 포함',
    paragraph('사과', { class: 'empty', title: '유지' }),
    paragraph('사과', { class: 'filled', title: '유지' }),
    [{ type: 'attrs', path: [], set: { class: 'filled' }, remove: [] }]],
  ['D-02', '빈 속성값 추가와 기존 속성 삭제',
    paragraph('사과', { class: 'cart' }), paragraph('사과', { title: '' }),
    [{ type: 'attrs', path: [], set: { title: '' }, remove: ['class'] }]],
  ['D-01', '빈 부모에 자식 삽입', list(), list('a'),
    [{ type: 'insert', path: [], index: 0, node: item('a') }]],
  ['D-01', '마지막 자식 삭제', list('a'), list(),
    [{ type: 'remove', path: [0] }]],
  ['D-01', '같은 위치의 태그 교체는 하위 작업 없이 서브트리 교체',
    element('div', [paragraph('합계')]), element('div', [element('strong', [text('합계')])]),
    [{ type: 'replace', path: [0], index: 0, node: element('strong', [text('합계')]) }]],
  ['D-02', '루트 교체의 목표 인덱스는 null', paragraph('합계'), element('strong', [text('합계')]),
    [{ type: 'replace', path: [], index: null, node: element('strong', [text('합계')]) }]],
  ['D-02', '루트의 키 변경도 루트 교체 하나',
    paragraph('합계', { 'data-key': 'old' }), paragraph('합계', { 'data-key': 'new' }),
    [{ type: 'replace', path: [], index: null, node: paragraph('합계', { 'data-key': 'new' }) }]],
  ['D-02', '텍스트에서 요소로 종류 교체',
    element('div', [text('사과')]), element('div', [paragraph('사과')]),
    [{ type: 'replace', path: [0], index: 0, node: paragraph('사과') }]],
  ['D-03', '재정렬은 이전 위치에서 목표 위치로 대응', list('a', 'b', 'c'), list('c', 'a', 'b'),
    [{ type: 'move', path: [2], index: 0 }, { type: 'move', path: [0], index: 1 }, { type: 'move', path: [1], index: 2 }]],
  ['D-03', '[A,B,C] 앞에 D를 넣어도 세 기존 항목을 재사용',
    list('a', 'b', 'c'), list('d', 'a', 'b', 'c'),
    [{ type: 'insert', path: [], index: 0, node: item('d') },
      { type: 'move', path: [0], index: 1 }, { type: 'move', path: [1], index: 2 },
      { type: 'move', path: [2], index: 3 }]],
  ['D-03', '키 변경은 기존 항목 제거와 새 항목 삽입', list('a'), list('b'),
    [{ type: 'remove', path: [0] }, { type: 'insert', path: [], index: 0, node: item('b') }]],
  ['D-03', '같은 키의 속성 변경은 교체 없이 속성만 갱신',
    element('ul', [item('a', '사과')]),
    element('ul', [element('li', [text('사과')], { 'data-key': 'a', title: '선택' })]),
    [{ type: 'attrs', path: [0], set: { title: '선택' }, remove: [] }]],
  ['D-03', '이동과 텍스트 변경은 모두 변경 전 경로를 사용',
    element('ul', [item('a', '사과'), item('b', '배')]),
    element('ul', [item('b', '배 2개'), item('a', '사과')]),
    [{ type: 'move', path: [1], index: 0 }, { type: 'move', path: [0], index: 1 },
      { type: 'text', path: [1, 0], value: '배 2개' }]],
  ['D-03', '키 없는 항목은 다른 위치에서 찾아 재사용하지 않음',
    element('ul', [item('a'), element('li', [text('키 없음')])]),
    element('ul', [element('li', [text('키 없음')]), item('a')]),
    [{ type: 'insert', path: [], index: 0, node: element('li', [text('키 없음')]) },
      { type: 'move', path: [0], index: 1 }, { type: 'remove', path: [1] }]],
  ['D-03', '같은 키여도 태그 변경 시 새 위치에 교체',
    element('div', [item('a'), item('b')]),
    element('div', [element('p', [text('b')], { 'data-key': 'b' }), item('a')]),
    [{ type: 'replace', path: [1], index: 0, node: element('p', [text('b')], { 'data-key': 'b' }) },
      { type: 'move', path: [0], index: 1 }]],
  ['D-03', '다른 부모 사이의 같은 키는 이동이 아닌 제거·삽입',
    element('div', [list('a'), list()]), element('div', [list(), list('a')]),
    [{ type: 'remove', path: [0, 0] }, { type: 'insert', path: [1], index: 0, node: item('a') }]],
  ['D-03', '객체 프로퍼티 이름 같은 키도 문자열 식별자',
    list('__proto__', 'constructor', '0'), list('0', '__proto__', 'constructor'),
    [{ type: 'move', path: [2], index: 0 }, { type: 'move', path: [0], index: 1 }, { type: 'move', path: [1], index: 2 }]],
  ['D-03', '키의 공백을 trim하지 않음', list('a', ' a'), list(' a', 'a'),
    [{ type: 'move', path: [1], index: 0 }, { type: 'move', path: [0], index: 1 }]],
  ['D-03', '의미 있는 공백 텍스트도 자식 인덱스에 포함',
    element('div', [item('a'), text(' '), item('b')]),
    element('div', [item('b'), text(' '), item('a')]),
    [{ type: 'move', path: [2], index: 0 }, { type: 'move', path: [0], index: 2 }]],
  ['D-02', '주석으로 나뉜 텍스트 경계는 트리 변경',
    paragraph('사과배'), element('p', [text('사과'), text('배')]),
    [{ type: 'text', path: [0], value: '사과' },
      { type: 'insert', path: [], index: 1, node: text('배') }]],
];

for (const [id, name, before, after, expected] of cases) {
  test(`${id}: ${name}`, () => assertPlan(before, after ?? before, expected));
}

// 삽입·삭제 위치 0/1/2는 사람이 정한 세 경계 사례이며 Diff를 기대값 생성에 사용하지 않는다.
for (const index of [0, 1, 2]) {
  const oldKeys = ['a', 'b'];
  const newKeys = [...oldKeys.slice(0, index), 'x', ...oldKeys.slice(index)];
  test(`D-02: 위치 ${index} 삽입과 뒤 형제 대응`, () => {
    const expected = [{ type: 'insert', path: [], index, node: item('x') }];
    oldKeys.forEach((_, oldIndex) => {
      if (oldIndex >= index) expected.push({ type: 'move', path: [oldIndex], index: oldIndex + 1 });
    });
    assertPlan(list(...oldKeys), list(...newKeys), expected);
  });
  test(`D-02: 위치 ${index} 삭제와 뒤 형제 대응`, () => {
    const expected = [{ type: 'remove', path: [index] }];
    for (let oldIndex = index + 1; oldIndex < 3; oldIndex++) {
      expected.push({ type: 'move', path: [oldIndex], index: oldIndex - 1 });
    }
    assertPlan(list(...newKeys), list(...oldKeys), expected);
  });
}

for (const [name, before, after] of [
  ['새 트리', list('a'), list('a', 'a')],
  ['이전 트리', list('a', 'a'), list('a')],
  ['삽입 서브트리', element('div'), element('div', [list('a', 'a')])],
  ['교체 서브트리', paragraph('사과'), element('div', [list('a', 'a')])],
]) {
  test(`V-05: ${name}의 중복 키를 구체적인 검증 오류로 거부`, () => {
    assert.throws(() => diff(before, after), { code: 'ERR_DUPLICATE_KEY' });
  });
}

test('V-05: 같은 객체여도 검증을 생략하지 않는다', () => {
  const duplicate = list('a', 'a');
  assert.throws(() => diff(duplicate, duplicate), { code: 'ERR_DUPLICATE_KEY' });
});

test('V-05: 다른 부모의 같은 키는 허용', () => {
  const tree = element('div', [list('a'), list('a')]);
  assertPlan(tree, structuredClone(tree), []);
});

for (const [name, invalid] of [
  ['null', null], ['배열 루트', []], ['텍스트 루트', text('사과')],
  ['문자열 아닌 텍스트', element('p', [text(0)])],
  ['자식 배열 누락', { kind: 'element', tag: 'p', attrs: {} }],
  ['알 수 없는 자식 종류', element('p', [{ kind: 'comment', value: 'x' }])],
  ['빈 키', list('')], ['문자열 아닌 속성', paragraph('사과', { title: false })],
]) {
  for (const side of ['previous', 'next']) {
    test(`D-06: ${side}의 잘못된 VNode(${name}) 거부`, () => {
      const valid = paragraph('사과');
      assert.throws(() => diff(side === 'previous' ? invalid : valid, side === 'next' ? invalid : valid),
        { code: 'ERR_INVALID_VNODE' });
    });
  }
}

test('D-04: 변경 계획을 만들 때 입력 트리와 하위 배열을 수정하지 않음', () => {
  const before = deepFreeze(list('a', 'b'));
  const after = deepFreeze(list('b', 'c'));
  const original = structuredClone({ before, after });
  diff(before, after);
  assert.deepEqual({ before, after }, original);
});
