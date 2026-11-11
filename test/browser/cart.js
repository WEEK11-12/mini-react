export const tests = [];
const test = (name, run) => tests.push({ name: `C-05 데모: ${name}`, run });
const assert = (condition, message = '데모 결과 불일치') => { if (!condition) throw new Error(message); };
const equal = (a, b) => assert(a === b, `expected ${b}, got ${a}`);
async function demo(run) {
  const frame = document.createElement('iframe'); frame.title = '장바구니 기능 테스트';
  frame.style.cssText = 'position:absolute;left:-10000px;width:1100px;height:800px';
  frame.src = '/phase2.html';
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('데모 로드 시간 초과')), 5000);
      frame.onload = () => { clearTimeout(timer); resolve(); };
      frame.onerror = () => { clearTimeout(timer); reject(new Error('데모 로드 실패')); };
      document.body.append(frame);
    });
    const doc = frame.contentDocument, win = frame.contentWindow;
    const get = selector => { const node = doc.querySelector(selector); assert(node, `요소 없음: ${selector}`); return node; };
    const input = (value, id = 'apple') => {
      const node = get(`#quantity-${id}`); node.focus(); node.value = value;
      node.dispatchEvent(new win.Event('input', { bubbles: true })); return node;
    };
    await run({ doc, get, input });
  } finally { frame.remove(); }
}
const total = get => get('[data-testid="total"]').textContent;
const memo = get => get('[data-testid="memo-count"]').textContent;
test('초기 mount와 증감 버튼이 State·합계·제목을 함께 변경', () => demo(({ doc, get }) => {
  equal(total(get), '5,000원'); equal(get('#effect-runs').value, '1');
  get('[aria-label="사과 수량 증가"]').click(); equal(total(get), '7,000원'); equal(get('#quantity-apple').value, '2');
  assert(doc.title.includes('3개'));
  get('[aria-label="사과 수량 감소"]').click(); equal(total(get), '5,000원'); equal(get('#effect-cleanups').value, '2');
}));
test('테마 변경은 Memo·Effect 횟수를 늘리지 않고 입력 노드도 유지', () => demo(({ get }) => {
  const beforeMemo = memo(get), beforeEffect = get('#effect-runs').value, input = get('#quantity-apple');
  get('[data-action="theme"]').click();
  assert(get('[data-testid="cart"]').classList.contains('dark'));
  equal(memo(get), beforeMemo); equal(get('#effect-runs').value, beforeEffect); equal(get('#quantity-apple'), input);
}));
test('빈 수량을 지우고 다른 숫자를 입력하거나 포커스를 떠나면 정리', () => demo(({ doc, get, input }) => {
  const node = input('3'); equal(total(get), '9,000원'); equal(doc.activeElement, node);
  const calculations = memo(get);
  input(''); equal(node.value, ''); equal(total(get), '9,000원'); equal(memo(get), calculations);
  equal(get('#runtime-status').textContent, ''); assert(get('#validation-status').textContent);
  input('5'); equal(node.value, '5'); equal(total(get), '13,000원');
  input(''); node.blur(); equal(node.value, '5'); equal(get('#validation-status').textContent, '');
  for (const invalid of ['x', '-1', '1.5', '100']) {
    input(invalid); equal(node.value, '5'); equal(total(get), '13,000원');
    assert(get('#validation-status').textContent); equal(get('#runtime-status').textContent, ''); equal(doc.activeElement, node);
  }
  input('4'); equal(total(get), '11,000원'); equal(get('#validation-status').textContent, '');
}));
test('입력 안내는 polite, 실행 오류는 alert 영역에 구분 표시', () => demo(({ get, input }) => {
  equal(get('#validation-status').getAttribute('role'), 'status');
  equal(get('#runtime-status').getAttribute('role'), 'alert');
  input('x'); assert(get('#validation-status').textContent);
  equal(get('#runtime-status').textContent, '');
  get('#cart-root h2').textContent = '외부 변조';
  get('[aria-label="사과 수량 증가"]').click();
  assert(get('#runtime-status').textContent.startsWith('화면 갱신 실패:'));
}));
test('Effect 오류는 이미 적용된 화면을 실패로 표시하지 않음', () => demo(({ doc, get }) => {
  Object.defineProperty(doc, 'title', { configurable: true, get: () => '테스트', set: () => { throw Error('제목 변경 실패'); } });
  get('[aria-label="사과 수량 증가"]').click();
  equal(total(get), '7,000원');
  assert(get('#runtime-status').textContent.startsWith('Effect 실행 중 오류:'));
}));
test('수량 경계·모든 상품 삭제·초기화가 작동', () => demo(({ get, input }) => {
  input('0'); assert(get('[aria-label="사과 수량 감소"]').disabled);
  input('99'); assert(get('[aria-label="사과 수량 증가"]').disabled);
  get('[aria-label="사과 삭제"]').click(); equal(total(get), '3,000원');
  get('[aria-label="배 삭제"]').click(); equal(total(get), '0원'); assert(get('[data-testid="empty-cart"]'));
  get('[data-action="reset"]').click(); equal(total(get), '5,000원'); equal(get('#quantity-apple').value, '1');
}));
test('unmount는 제목·이벤트 정리, 다시 시작은 새 State', () => demo(({ doc, get }) => {
  const oldButton = get('[aria-label="사과 수량 증가"]'); oldButton.click();
  get('#lifecycle-toggle').click(); equal(get('#cart-root').childNodes.length, 0);
  assert(doc.title.includes('Phase 2')); equal(get('#effect-cleanups').value, '2');
  oldButton.click(); equal(get('#cart-root').childNodes.length, 0);
  get('#lifecycle-toggle').click(); equal(total(get), '5,000원'); oldButton.click(); equal(total(get), '5,000원');
}));
test('DOM 변조 시 이전 State 복구·오류 표시 후 다시 갱신 가능', () => demo(({ get }) => {
  get('#cart-root h2').textContent = '외부 변조';
  get('[aria-label="사과 수량 증가"]').click();
  equal(total(get), '5,000원'); equal(get('#quantity-apple').value, '1'); assert(get('#runtime-status').textContent);
  get('[aria-label="사과 수량 증가"]').click(); equal(total(get), '7,000원'); equal(get('#runtime-status').textContent, '');
}));
