import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML, serializeHTML } from '../src/html-input.js';
import { element, text } from './fixtures.js';

// FR-01/02/06, V-02~05: 원본 문법을 검사해 브라우저 자동 보정과 실행을 막는다.
const valid = [
  ['중첩 구조와 모든 허용 태그', '<div><h2>장바구니</h2><p><strong>상품</strong> <span>1개</span></p><ul><li>사과</li></ul></div>',
    element('div', [element('h2', [text('장바구니')]), element('p', [element('strong', [text('상품')]), text(' '), element('span', [text('1개')])]), element('ul', [element('li', [text('사과')])])])],
  ['빈 요소', '<p></p>', element('p')],
  ['양 종류 따옴표와 속성 안의 >', '<p class="cart" title=\'a > b\' data-key="0" data-sku-id="apple">사과</p>', element('p', [text('사과')], { class: 'cart', title: 'a > b', 'data-key': '0', 'data-sku-id': 'apple' })],
  ['문자 참조는 한 번만 해석', '<p title="&quot;&apos;">&amp;lt; &lt; &gt; &quot; &apos;</p>', element('p', [text('&lt; < > " \u0027')], { title: '"\u0027' })],
  ['이스케이프한 태그는 텍스트', '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>', element('p', [text('<script>alert(1)</script>')])],
  ['줄바꿈 들여쓰기 제거', '<div>\n  <p>사과</p>\r\n  <span>배</span>\n</div>', element('div', [element('p', [text('사과')]), element('span', [text('배')])])],
  ['문자 포함 공백과 같은 줄 공백 보존', '<div>\n 사과 \n<strong>배</strong>   </div>', element('div', [text('\n 사과 \n'), element('strong', [text('배')]), text('   ')])],
  ['루트 바깥 주석과 공백 무시', ' \n<!-- before --><p>사과</p><!-- after -->\t', element('p', [text('사과')])],
  ['주석 양옆 텍스트 경계 보존', '<p>사과<!-- 메모 -->배</p>', element('p', [text('사과'), text('배')])],
  ['부모가 다르면 같은 key 허용', '<div><ul><li data-key="a"></li></ul><ul><li data-key="a"></li></ul></div>', element('div', [element('ul', [element('li', [], { 'data-key': 'a' })]), element('ul', [element('li', [], { 'data-key': 'a' })])])],
];

for (const [name, source, expected] of valid) {
  test(`[V-02~05] ${name}`, () => assert.deepEqual(parseHTML(source), expected));
}

const invalid = [
  '', ' \n<!-- only comment -->', '<p></p><p></p>', 'outside<p></p>', '<p></p>outside',
  '<p>', '</p>', '<p><strong>x</p></strong>', '<p></span>', '<p></p></p>',
  '<P></P>', '<script>alert(1)</script>', '<p/>', '<p />', '<!DOCTYPE html><p></p>', '<?xml?><p></p>',
  '<p class=x></p>', '<p class></p>', '<p class="x"class="y"></p>', '<p class="x"title="y"></p>',
  '<p class="x" class="y"></p>', '<p onclick="alert(1)"></p>', '<p CLASS="x"></p>', '<p data-="x"></p>', '<p data-1="x"></p>',
  '<p title="unfinished></p>', '<p title="a < b"></p>', '<p title="x" / ></p>', '<p></p x>',
  '<p>&nbsp;</p>', '<p>&#65;</p>', '<p>&#x41;</p>', '<p>A & B</p>', '<p>&amp</p>', '<p title="&unknown;"></p>',
  '<p>a < b</p>', '<!-- unfinished', '<p><!-- unfinished</p>', null, 42,
];

for (const [index, source] of invalid.entries()) {
  test(`[V-03/05] 미지원·잘못된 입력 ${index + 1}: ${String(source)}`, () => {
    assert.throws(() => parseHTML(source), { code: 'ERR_INVALID_HTML' });
  });
}

test('[V-05] 형제 중복 key는 구체적인 오류', () => {
  assert.throws(() => parseHTML('<ul><li data-key="a"></li><li data-key="a"></li></ul>'), { code: 'ERR_DUPLICATE_KEY' });
});

test('[V-05] 빈 key는 VNode 검증에서 거절', () => {
  assert.throws(() => parseHTML('<p data-key=""></p>'), { code: 'ERR_INVALID_VNODE' });
});

test('[V-01/04] 직렬화는 문자 참조와 NBSP를 손실 없이 보존', () => {
  const tree = element('p', [text('사과\u00a0배 & < > " \u0027 &lt;')], { title: '& < > " \u0027\u00a0' });
  const source = serializeHTML(tree);
  assert.ok(!source.includes('&nbsp;'));
  assert.ok(source.includes('&amp;lt;'));
  assert.deepEqual(parseHTML(source), tree);
});

test('[V-04] 인접 텍스트 사이에 무해한 주석으로 경계 보존', () => {
  const tree = element('p', [text('사과'), text('배'), element('span', [text('귤')]), text(' '), text('복숭아')]);
  const source = serializeHTML(tree);
  assert.equal(source, '<p>사과<!-- -->배<span>귤</span> <!-- -->복숭아</p>');
  assert.deepEqual(parseHTML(source), tree);
});

test('[V-01] 빈 요소와 중첩된 속성을 직렬화', () => {
  const tree = element('div', [element('ul', [element('li', [], { 'data-key': '0' })]), element('p')]);
  assert.ok(serializeHTML(tree).includes('<li data-key="0"></li>'));
  assert.deepEqual(parseHTML(serializeHTML(tree)), tree);
});

for (const [name, tree] of [
  ['미지원 태그', element('script')],
  ['미지원 속성', element('p', [], { onclick: 'alert(1)' })],
  ['Phase2 이벤트', { ...element('p'), events: { click() {} } }],
  ['Phase2 DOM 프로퍼티', { ...element('p'), domProps: { value: 'x' } }],
  ['빈 텍스트', element('p', [text('')])],
  ['들여쓰기 텍스트', element('p', [text('\n  ')])],
]) {
  test(`[V-03/04] 소스로 복원할 수 없는 트리 거절: ${name}`, () => {
    assert.throws(() => serializeHTML(tree), { code: 'ERR_INVALID_HTML' });
  });
}

test('[V-05] 직렬화도 구조·중복 key 검증', () => {
  assert.throws(() => serializeHTML(element('ul', [element('li', [], { 'data-key': 'a' }), element('li', [], { 'data-key': 'a' })])), { code: 'ERR_DUPLICATE_KEY' });
  assert.throws(() => serializeHTML(text('root')), { code: 'ERR_INVALID_VNODE' });
});
