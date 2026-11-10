import { readDom, render, patch } from '../../src/dom.js';
import { diff } from '../../src/diff.js';
import { createPlayground } from '../../src/playground.js';
import { parseHTML } from '../../src/html-input.js';
import { tests as phase2DomTests } from './phase2-dom.js';
import { tests as componentTests } from './components.js';
import { tests as cartTests } from './cart.js';
import { element as e, text as t } from '../fixtures.js';

const tests = [];
const test = (name, run) => tests.push({ name, run });
const assert = (condition, message = '기대 조건 불일치') => { if (!condition) throw new Error(message); };
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const equal = (actual, expected) => assert(JSON.stringify(canonical(actual)) === JSON.stringify(canonical(expected)), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
const throws = (run, code) => {
  let error;
  try { run(); } catch (caught) { error = caught; }
  assert(error, '오류가 발생해야 함');
  if (code) equal(error.code, code);
};
const fixture = document.querySelector('#fixture');
function mount(tree) { const root = render(tree); fixture.replaceChildren(root); return root; }
const item = (key) => e('li', [t(key)], { 'data-key': key });
const list = (...keys) => e('ul', keys.map(item));

test('V-01·04 DOM 읽기는 속성·순서·텍스트 경계를 보존하고 들여쓰기·주석 제외', () => {
  fixture.innerHTML = '<div title="목록">\n  <p>사과<!--메모-->배</p> <span>과일</span>\n</div>';
  equal(readDom(fixture.firstChild), e('div', [e('p', [t('사과'), t('배')]), t(' '), e('span', [t('과일')])], { title: '목록' }));
});
test('V-01·03 렌더러는 꺾쇠 문자열을 HTML로 실행하지 않음', () => {
  const tree = e('p', [t('<script>alert(1)</script>')], { title: 'a > b' });
  const root = mount(tree);
  equal(root.textContent, '<script>alert(1)</script>');
  assert(!root.querySelector('script'));
  equal(readDom(root), tree);
});
test('V-01·D-06 DOM의 bis_skin_checked는 읽기·Patch에서 제외하고 다른 속성은 검사', () => {
  const before = e('div', [e('p', [t('사과 2,000원')])]);
  const after = e('div', [e('p', [t('포도 3,000원')])]);
  const root = mount(before), child = root.firstChild;
  for (const node of [root, child]) node.setAttribute('bis_skin_checked', '1');
  equal(readDom(root), before);
  patch(root, diff(before, after));
  equal(readDom(root), after);
  assert(root.firstChild === child);
  throws(() => parseHTML('<div bis_skin_checked="1"></div>'), 'ERR_INVALID_HTML');
  child.setAttribute('style', 'color:red');
  throws(() => readDom(root), 'ERR_INVALID_HTML');
});

test('V-03 DOM 읽기 오류는 미지원 속성 이름을 알려줌', () => {
  fixture.innerHTML = '<div><span browser-added="true">사과</span></div>';
  let caught;
  try { readDom(fixture.firstChild); } catch (error) { caught = error; }
  equal(caught?.code, 'ERR_INVALID_HTML');
  assert(caught.message.includes('<span>') && caught.message.includes('browser-added'), '문제 태그와 속성명을 표시해야 함');
});

test('V-03 DOM 읽기도 미지원 요소·속성과 중복 키를 거부', () => {
  fixture.innerHTML = '<div><script></script></div>';
  throws(() => readDom(fixture.firstChild), 'ERR_INVALID_HTML');
  fixture.innerHTML = '<p style="color:red">x</p>';
  throws(() => readDom(fixture.firstChild), 'ERR_INVALID_HTML');
  fixture.innerHTML = '<ul><li data-key="a"></li><li data-key="a"></li></ul>';
  throws(() => readDom(fixture.firstChild), 'ERR_DUPLICATE_KEY');
});
test('D-01 텍스트·속성 변경 후 무관한 제목과 대상 요소 참조 유지', () => {
  const before = e('div', [e('h2', [t('장바구니')]), e('p', [t('1개')], { class: 'empty', title: '삭제' })]);
  const after = e('div', [e('h2', [t('장바구니')]), e('p', [t('2개')], { class: 'filled' })]);
  const root = mount(before), heading = root.firstChild, paragraph = root.lastChild;
  patch(root, diff(before, after));
  equal(readDom(root), after);
  assert(root.firstChild === heading && root.lastChild === paragraph);
  assert(!paragraph.hasAttribute('title'));
});
test('D-04 동일 트리 Patch는 MutationObserver 변경 기록 없음', () => {
  const tree = list('a', 'b');
  const root = mount(tree), child = root.firstChild;
  const observer = new MutationObserver(() => {});
  observer.observe(root, { subtree: true, attributes: true, characterData: true, childList: true });
  try { patch(root, diff(tree, structuredClone(tree))); equal(observer.takeRecords().length, 0); }
  finally { observer.disconnect(); }
  assert(root.firstChild === child);
});
for (const [label, keys] of [['앞 삽입', ['d', 'a', 'b', 'c']], ['중간 삭제', ['a', 'c']], ['재정렬', ['c', 'a', 'b']], ['전체 삭제', []]]) {
  test(`D-02·03 ${label}: 내용·순서와 생존한 키 노드 참조 유지`, () => {
    const before = list('a', 'b', 'c'), after = list(...keys), root = mount(before);
    const refs = new Map([...root.children].map(node => [node.dataset.key, node]));
    patch(root, diff(before, after));
    equal(readDom(root), after);
    for (const node of root.children) if (refs.has(node.dataset.key)) assert(refs.get(node.dataset.key) === node);
  });
}
test('D-02 루트 교체는 반환된 새 루트와 컨테이너를 함께 갱신', () => {
  const before = e('p', [t('합계')]), after = e('strong', [t('합계')]);
  const old = mount(before), next = patch(old, diff(before, after));
  assert(next !== old && fixture.firstChild === next);
  equal(readDom(next), after);
});
test('D-03 부모 이동과 중첩 자식 변경이 함께 있어도 이전 경로를 사용', () => {
  const before = e('div', [e('ul', [item('x')], { 'data-key': 'a' }), e('p', [t('B')], { 'data-key': 'b' })]);
  const after = e('div', [e('p', [t('B2')], { 'data-key': 'b' }), e('ul', [item('y'), item('x')], { 'data-key': 'a' })]);
  const root = mount(before), first = root.firstChild;
  patch(root, diff(before, after));
  equal(readDom(root), after);
  assert(root.lastChild === first);
});
test('D-05 실제 DOM에 남은 들여쓰기·주석이 자식 경로를 밀지 않음', () => {
  fixture.innerHTML = '<div>\n <h2>장바구니</h2><!--주석-->\n <p>1개</p>\n</div>';
  const root = fixture.firstChild, before = readDom(root), title = root.querySelector('h2');
  const after = e('div', [e('h2', [t('장바구니')]), e('p', [t('2개')])]);
  patch(root, diff(before, after)); equal(readDom(root), after); assert(root.querySelector('h2') === title);
});
test('D-05 VNode에 명시된 줄바꿈 텍스트는 Patch에서 버리지 않음', () => {
  const before = e('div', [t('\n'), e('p', [t('A')])]), after = e('div', [t('\n\n'), e('p', [t('B')])]);
  const root = mount(before), newline = root.firstChild;
  patch(root, diff(before, after));
  assert(root.firstChild === newline); equal(newline.nodeValue, '\n\n'); equal(root.lastChild.textContent, 'B');
});
test('D-06 무변경 형제의 외부 변조도 적용 전에 발견', () => {
  const before = e('div', [e('h2', [t('장바구니')]), e('p', [t('A')])]);
  const root = mount(before); root.firstChild.textContent = '변조';
  const after = e('div', [e('h2', [t('장바구니')]), e('p', [t('B')])]);
  throws(() => patch(root, diff(before, after)), 'ERR_DOM_MISMATCH');
  equal(root.lastChild.textContent, 'A');
});
test('D-06 잘못된 계획 경로·작업 종류는 DOM 쓰기 전에 거부', () => {
  const tree = e('p', [t('A')]), root = mount(tree);
  for (const operations of [[{ type: 'text', path: [9], value: 'B' }], [{ type: 'unknown', path: [] }]]) {
    throws(() => patch(root, { previous: tree, next: tree, operations }), 'ERR_INVALID_PLAN');
    equal(root.textContent, 'A');
  }
});
test('D-03 무키 항목은 위치 대응하고 키 항목은 이동해 재사용', () => {
  const unkeyed = e('li', [t('키 없음')]);
  const before = e('ul', [item('a'), unkeyed]), after = e('ul', [unkeyed, item('a')]);
  const root = mount(before), a = root.firstChild, oldUnkeyed = root.lastChild;
  patch(root, diff(before, after)); equal(readDom(root), after);
  assert(root.lastChild === a && root.firstChild !== oldUnkeyed);
});

test('D-02·03 삭제·삽입·이동·같은 키의 태그 교체를 함께 적용', () => {
  const before = e('div', [item('a'), item('b'), item('c'), item('d')]);
  const after = e('div', [e('p', [t('B 교체')], { 'data-key': 'b' }), item('e'), item('a')]);
  const root = mount(before), a = root.firstChild, b = root.children[1];
  patch(root, diff(before, after)); equal(readDom(root), after);
  assert(root.lastChild === a && root.firstChild !== b);
});
test('D-05 주석·들여쓰기 사이에서 목록 삽입·삭제·재정렬', () => {
  fixture.innerHTML = '<ul>\n<li data-key="a">a</li><!--메모-->\n<li data-key="b">b</li>\n<li data-key="c">c</li>\n</ul>';
  const root = fixture.firstChild, before = readDom(root), c = root.children[2];
  const after = list('c', 'd', 'a'); patch(root, diff(before, after));
  equal(readDom(root), after); assert(root.children[0] === c);
});
test('D-02·03 세 키의 모든 부분순열 사이 256개 전이가 참조·내용을 보존', () => {
  const variants = [[]];
  function permutations(prefix, remaining) {
    for (const key of remaining) {
      const next = [...prefix, key]; variants.push(next);
      permutations(next, remaining.filter(value => value !== key));
    }
  }
  permutations([], ['a', 'b', 'c']);
  for (const oldKeys of variants) for (const newKeys of variants) {
    const before = list(...oldKeys), after = list(...newKeys), root = mount(before);
    const refs = new Map([...root.children].map(node => [node.dataset.key, node]));
    patch(root, diff(before, after)); equal(readDom(root), after);
    for (const node of root.children) if (refs.has(node.dataset.key)) assert(refs.get(node.dataset.key) === node);
  }
});

function playground(initialTree) {
  fixture.innerHTML = '<div id="actual"><div class="cart"><h2>장바구니</h2><p>A</p></div></div><div id="preview"></div><textarea></textarea><button id="patch">Patch</button><button id="back">뒤로</button><button id="forward">앞으로</button><p id="error"></p><p id="status"></p>';
  const find = selector => fixture.querySelector(selector);
  const ui = { actual: find('#actual'), preview: find('#preview'), editor: find('textarea'), patchButton: find('#patch'), backButton: find('#back'), forwardButton: find('#forward'), error: find('#error'), status: find('#status') };
  if (initialTree) ui.actual.replaceChildren(render(initialTree));
  createPlayground(ui);
  return {
    ...ui,
    edit(source) { ui.editor.value = source; ui.editor.dispatchEvent(new Event('input', { bubbles: true })); },
    apply(value) { this.edit(`<div class="cart"><h2>장바구니</h2><p>${value}</p></div>`); ui.patchButton.click(); },
  };
}
test('V-01 초기 DOM의 NBSP는 미지원 &nbsp; 참조로 바뀌지 않음', () => {
  const ui = playground(e('p', [t('사과\u00a0배')], { title: '사과\u00a0배' }));
  assert(!ui.error.textContent && !ui.patchButton.disabled, ui.error.textContent);
  equal(ui.preview.textContent, '사과\u00a0배');
});
test('V-01 초기 DOM의 인접 텍스트 경계가 편집 소스에서도 보존', () => {
  const ui = playground(e('p', [t('사과'), t('배')]));
  assert(!ui.error.textContent && !ui.patchButton.disabled, ui.error.textContent);
  equal(ui.preview.firstChild.childNodes.length, 2);
  ui.patchButton.click(); assert(ui.backButton.disabled);
});
test('V-01·02·H-01 초기 동기화와 편집/Patch 경계를 지킴', () => {
  const ui = playground(), title = ui.actual.querySelector('h2');
  equal(ui.actual.textContent, ui.preview.textContent); assert(ui.backButton.disabled && ui.forwardButton.disabled);
  ui.edit('<div class="cart"><h2>장바구니</h2><p>B</p></div>');
  equal(ui.actual.querySelector('p').textContent, 'A'); equal(ui.preview.querySelector('p').textContent, 'B');
  ui.patchButton.click(); equal(ui.actual.querySelector('p').textContent, 'B');
  assert(ui.actual.querySelector('h2') === title); assert(!ui.backButton.disabled);
});
test('V-03 잘못된 입력은 마지막 유효 미리보기·실제 영역·이력 보존', () => {
  const ui = playground(); ui.apply('B'); const source = ui.editor.value;
  ui.edit('<script>window.__unsafe = true</script>');
  assert(ui.patchButton.disabled && ui.error.textContent); equal(ui.preview.querySelector('p').textContent, 'B');
  equal(ui.actual.querySelector('p').textContent, 'B'); assert(!window.__unsafe);
  ui.edit(source); assert(!ui.patchButton.disabled && !ui.error.textContent);
});
test('V-03 미리보기를 외부에서 바꾸면 소스와 다른 내용을 적용하지 않음', () => {
  const ui = playground(); ui.preview.querySelector('p').textContent = '소스에 없는 변경';
  ui.patchButton.click();
  equal(ui.actual.querySelector('p').textContent, 'A');
  assert(ui.backButton.disabled && ui.patchButton.disabled && ui.error.textContent);
});
test('H-01·02 A→B→C→뒤로 B→앞으로 C, B→D는 미래 삭제', () => {
  const ui = playground(); ui.apply('B'); ui.apply('C');
  ui.backButton.click(); equal(ui.actual.querySelector('p').textContent, 'B');
  equal(ui.editor.value, '<div class="cart"><h2>장바구니</h2><p>B</p></div>');
  equal(ui.preview.querySelector('p').textContent, 'B'); assert(!ui.forwardButton.disabled);
  ui.forwardButton.click(); equal(ui.actual.querySelector('p').textContent, 'C');
  ui.backButton.click(); ui.apply('D'); assert(ui.forwardButton.disabled);
  ui.backButton.click(); ui.forwardButton.click(); equal(ui.actual.querySelector('p').textContent, 'D');
});
test('H-03 과거에서 같은 트리·소스만 변경하면 미래 유지', () => {
  const ui = playground(); ui.apply('B'); ui.apply('C'); ui.backButton.click();
  const source = '<div class="cart"><h2>장바구니</h2><!--메모--><p>B</p></div>';
  ui.edit(source); ui.patchButton.click(); assert(!ui.forwardButton.disabled);
  ui.forwardButton.click(); ui.backButton.click(); equal(ui.editor.value, source);
});
test('H-04 무효 초안에서 뒤로가면 오류 해제·저장 소스 복원', () => {
  const ui = playground(); ui.apply('B'); ui.edit('<p>잘못된 초안');
  ui.backButton.click(); assert(!ui.error.textContent && !ui.patchButton.disabled);
  equal(ui.actual.querySelector('p').textContent, 'A'); equal(ui.preview.querySelector('p').textContent, 'A');
  assert(!ui.editor.value.includes('초안'));
});
test('D-06 외부 DOM 변조의 복구 성공 후 이력 미확정·다시 Patch 가능', () => {
  const ui = playground(); ui.actual.querySelector('h2').textContent = '변조';
  ui.edit('<div class="cart"><h2>장바구니</h2><p>B</p></div>'); ui.patchButton.click();
  equal(ui.actual.querySelector('h2').textContent, '장바구니'); equal(ui.actual.querySelector('p').textContent, 'A');
  assert(ui.backButton.disabled && ui.error.textContent); ui.patchButton.click();
  equal(ui.actual.querySelector('p').textContent, 'B'); assert(!ui.backButton.disabled);
});
test('D-06 Patch 중 예외는 이전 화면 복구, 이력 확정 안 함', () => {
  const ui = playground(), root = ui.actual.firstChild;
  const nativeSet = root.setAttribute;
  root.setAttribute = () => { throw new Error('forced patch failure'); };
  ui.edit('<div class="changed"><h2>장바구니</h2><p>B</p></div>');
  ui.patchButton.click();
  equal(ui.actual.firstChild.className, 'cart'); equal(ui.actual.querySelector('p').textContent, 'A');
  assert(ui.backButton.disabled && ui.error.textContent);
  root.setAttribute = nativeSet;
});
test('H-05 이력 이동 중 미리보기 반영 실패는 인덱스·실제 화면·초안 복원', () => {
  const ui = playground(); ui.apply('B'); ui.edit('<p>미적용 초안</p>');
  const nativeReplace = ui.preview.replaceChildren.bind(ui.preview); let once = true;
  ui.preview.replaceChildren = (...nodes) => { if (once) { once = false; throw new Error('forced preview failure'); } nativeReplace(...nodes); };
  ui.backButton.click();
  equal(ui.actual.querySelector('p').textContent, 'B'); equal(ui.editor.value, '<p>미적용 초안</p>');
  assert(ui.forwardButton.disabled && !ui.backButton.disabled && ui.error.textContent);
});
test('D-06 복구도 실패하면 Patch·뒤로·앞으로를 모두 차단', () => {
  const ui = playground(); ui.apply('B'); ui.apply('C'); ui.backButton.click();
  ui.actual.querySelector('h2').textContent = '변조';
  ui.actual.replaceChildren = () => { throw new Error('forced recovery failure'); };
  ui.apply('D');
  assert(ui.patchButton.disabled && ui.backButton.disabled && ui.forwardButton.disabled);
  assert(ui.error.textContent.includes('복구에 실패'));
});

tests.push(...phase2DomTests, ...componentTests, ...cartTests);
const results = [];
for (const { name, run } of tests) {
  const row = document.createElement('li');
  try { await run(); row.className = 'pass'; row.textContent = `PASS ${name}`; results.push({ name, pass: true }); }
  catch (error) { row.className = 'fail'; row.textContent = `FAIL ${name}: ${error.message}`; results.push({ name, pass: false, error: error.stack }); }
  document.querySelector('#results').append(row);
  fixture.replaceChildren();
}
const failed = results.filter(result => !result.pass).length;
document.querySelector('#summary').textContent = `${results.length}개 중 ${results.length - failed} 통과 · ${failed} 실패`;
document.querySelector('#summary').dataset.failed = String(failed);
window.testResults = results;
