import test from 'node:test';
import assert from 'node:assert/strict';
import { element, text, validateVNode, sameTree } from '../src/vnode.js';

test('V-05: 자기 참조와 조상으로 돌아가는 VNode는 거부', () => {
  const direct = element('div');
  direct.children.push(direct);
  const ancestor = element('div', [element('p')]);
  ancestor.children[0].children.push(ancestor);
  for (const tree of [direct, ancestor]) {
    assert.throws(() => validateVNode(tree), { code: 'ERR_INVALID_VNODE' });
  }
});

test('V-05: 같은 무키 VNode의 여러 위치 사용은 순환이 아니다', () => {
  const child = element('span', [text('공유')]);
  const tree = element('div', [child, child]);
  assert.equal(validateVNode(tree), tree);
});

test('V-05: null 프로토타입 속성 맵도 허용', () => {
  const attrs = Object.assign(Object.create(null), { title: '사과' });
  const tree = element('p', [], attrs);
  assert.equal(validateVNode(tree), tree);
  assert.equal(sameTree(tree, element('p', [], { title: '사과' })), true);
});

for (const [name, tree] of [
  ['대문자 태그', element('DIV')],
  ['빈 태그', element('')],
  ['배열 속성 맵', element('p', [], [])],
  ['배열에 빈 자식 위치', element('p', new Array(1))],
  ['null 속성 맵', element('p', [], null)],
  ['함수가 아닌 이벤트', { ...element('p'), events: { click: 'handler' } }],
]) {
  test(`V-05: ${name} 거부`, () => {
    assert.throws(() => validateVNode(tree), { code: 'ERR_INVALID_VNODE' });
  });
}

test('V-05: events와 domProps 생략은 빈 맵과 동등', () => {
  const tree = { kind: 'element', tag: 'p', attrs: {}, children: [] };
  validateVNode(tree);
  assert.equal(sameTree(tree, element('p')), true);
});
