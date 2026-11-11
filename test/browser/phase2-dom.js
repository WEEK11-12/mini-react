import { element as e, text as t } from '../fixtures.js';
import { render, patch, readDom, releaseDom } from '../../src/dom.js';
import { diff } from '../../src/diff.js';

export const tests = [];
const test = (name, run) => tests.push({ name, run });
const assert = (condition, message = '기대 조건 불일치') => { if (!condition) throw new Error(message); };
const equal = (a, b) => assert(Object.is(a, b), `expected ${b}, got ${a}`);
const throws = (run, code) => { let error; try { run(); } catch (caught) { error = caught; } assert(error); equal(error.code, code); };
const options = { phase: 2 };
const button = handler => ({ ...e('button', [t('실행')], { type: 'button' }), events: handler ? { click: handler } : {} });
const input = (key, value) => ({ ...e('input', [], { 'data-key': key, type: 'text' }), domProps: { value } });
function fixture(tree, run) {
  const host = document.createElement('div'); document.body.append(host);
  let root;
  try { root = render(tree, document, options); host.append(root); run(root, host); }
  finally { if (host.firstChild) releaseDom(host.firstChild); host.remove(); }
}

test('C-05 DOM: bis_skin_checked가 추가돼도 이벤트·입력 Patch와 노드 재사용 가능', () => {
  let calls = 0;
  const before = e('div', [button(() => calls++), input('a', '1')]);
  const after = e('div', [button(() => calls += 2), input('a', '2')]);
  fixture(before, root => {
    const field = root.lastChild;
    for (const node of [root, ...root.children]) node.setAttribute('bis_skin_checked', '1');
    patch(root, diff(before, after), options);
    root.firstChild.click(); equal(calls, 2);
    equal(field.value, '2'); assert(root.lastChild === field);
    root.setAttribute('title', '외부 변경');
    throws(() => patch(root, diff(after, after), options), 'ERR_DOM_MISMATCH');
  });
});

test('C-05 DOM: 함수 이벤트 연결과 입력 프로퍼티를 실제 DOM에 적용', () => {
  let calls = 0;
  const tree = e('div', [button(() => calls++), input('a', '사과')]);
  fixture(tree, root => {
    root.firstChild.click(); equal(calls, 1); equal(root.lastChild.value, '사과');
    assert(!root.firstChild.hasAttribute('onclick'));
  });
});
test('C-05 DOM: 이벤트 교체는 이전 핸들러를 해제하고 중복 실행하지 않음', () => {
  let old = 0, next = 0;
  const before = button(() => old++), after = button(() => next++);
  fixture(before, root => {
    patch(root, diff(before, after), options);
    for (let i = 0; i < 3; i++) root.click();
    equal(old, 0); equal(next, 3);
    const removed = button(); patch(root, diff(after, removed), options); root.click(); equal(next, 3);
  });
});
test('C-04 DOM: 제거한 서브트리와 releaseDom은 모든 등록 이벤트 해제', () => {
  let calls = 0;
  const before = e('div', [button(() => calls++)]), after = e('div');
  fixture(before, root => {
    const removed = root.firstChild; patch(root, diff(before, after), options); removed.click(); equal(calls, 0);
  });
  fixture(button(() => calls++), root => { releaseDom(root); root.click(); equal(calls, 0); });
});
test('C-05 DOM: 브라우저 입력값 변화는 외부 구조 변조로 보지 않고 포커스 유지', () => {
  const before = input('a', 'a'), after = input('a', 'ab');
  fixture(before, root => {
    root.focus(); root.value = 'ab'; root.setSelectionRange(1, 1);
    patch(root, diff(before, after), options);
    equal(root.value, 'ab'); assert(document.activeElement === root); equal(root.selectionStart, 1);
  });
});
test('C-05 DOM: 빈 Diff 계획도 거부한 입력값을 목표값으로 복원', () => {
  const tree = input('a', '확정');
  fixture(tree, root => { root.value = '거부된 초안'; patch(root, diff(tree, tree), options); equal(root.value, '확정'); });
});
test('C-05 DOM: value·checked 삭제 시 브라우저 현재값도 기본값으로 초기화', () => {
  const before = { ...e('input', [], { type: 'checkbox' }), domProps: { value: 'apple', checked: true } };
  const after = e('input', [], { type: 'checkbox' });
  fixture(before, root => {
    assert(root.checked); patch(root, diff(before, after), options); equal(root.value, 'on'); equal(root.checked, false);
  });
});
test('C-05 DOM: 입력 항목 재정렬은 노드·현재값·포커스·커서 유지', () => {
  const before = e('div', [input('a', 'apple'), input('b', 'pear')]);
  const after = e('div', [input('b', 'pear'), input('a', 'apple')]);
  fixture(before, root => {
    const a = root.firstChild; a.focus(); a.setSelectionRange(2, 2);
    patch(root, diff(before, after), options);
    assert(root.lastChild === a && document.activeElement === a); equal(a.value, 'apple'); equal(a.selectionStart, 2);
  });
});
test('C-05 DOM: Phase 2에서도 인라인 이벤트 속성·임의 DOM 프로퍼티 거부', () => {
  throws(() => render(e('button', [], { onclick: 'alert(1)' }), document, options), 'ERR_INVALID_HTML');
  throws(() => render({ ...e('div'), domProps: { innerHTML: '<script></script>' } }, document, options), 'ERR_INVALID_HTML');
});
test('V-03 회귀: Phase 2 지원 요소가 Phase 1 HTML 읽기 허용 목록을 넓히지 않음', () => {
  const button = document.createElement('button');
  throws(() => readDom(button), 'ERR_INVALID_HTML');
  throws(() => render(e('button')), 'ERR_INVALID_HTML');
});
