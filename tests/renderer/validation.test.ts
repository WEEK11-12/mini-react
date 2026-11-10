// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { projectModule } from '../support/project';
import { element, freeze, keyed, root, text } from './fixtures';
import type { VDOMModule, VRoot } from './fixtures';

describe('validateRoot', () => {
  it.each([undefined, ' ', '01', '1', 'a\nb', '"&', '🔑', '__proto__'])(
    '[VDOM-02][DIFF-01] 유효 key %j와 서로 다른 부모의 같은 key를 허용한다',
    async (key) => {
      const { validateRoot } = await projectModule<VDOMModule>('core/vdom.ts');
      const tree = freeze(root(
        element('section', [element('p', [], { key })]),
        element('section', [element('p', [], { key })]),
      ));
      expect(() => validateRoot(tree, 'html')).not.toThrow();
      expect(() => validateRoot(tree, 'component')).not.toThrow();
    },
  );

  it.each([null, 0, 1, {}, [], '', '\u0000', 'a\u0000b', '\ud800', '\udfff'])(
    '[VDOM-02][DIFF-01][임시 OPEN-09] 잘못된 key %j를 정규화로 숨기지 않고 거부한다',
    async (key) => {
      const { validateRoot } = await projectModule<VDOMModule>('core/vdom.ts');
      const tree = freeze({ kind: 'root', children: [{ ...element('p'), key }] });
      expect(() => validateRoot(tree, 'component')).toThrow();
      expect(() => validateRoot(tree, 'html')).toThrow();
      expect(tree.children[0].key).toBe(key);
    },
  );

  it.each([
    root(keyed('a'), keyed('a')),
    root(element('section', [keyed('a'), text(' '), keyed('a')])),
    root(element('p', [], { attrs: { 'data-key': 'a' } })),
    root(element('p', [], { attrs: { key: 'a' } })),
    { kind: 'root', children: [{ ...text('x'), key: 'a' }] },
  ])('[VDOM-02][DIFF-01][임시 OPEN-09] 중복 key·예약 속성 중복·텍스트 key를 거부한다 %#', async (tree) => {
    const { validateRoot } = await projectModule<VDOMModule>('core/vdom.ts');
    freeze(tree);
    expect(() => validateRoot(tree, 'component')).toThrow();
  });

  it('[VDOM-02][임시 OPEN-01] 숫자처럼 보이는 key와 공백 key는 정확한 문자열로 구별한다', async () => {
    const { validateRoot } = await projectModule<VDOMModule>('core/vdom.ts');
    expect(() => validateRoot(freeze(root(keyed('1'), keyed('01'), keyed(' 1'), keyed(' '))), 'html')).not.toThrow();
  });

  const invalidIds: readonly [string, VRoot][] = [
    ['duplicate', root(element('p', [], { attrs: { id: 'a' } }), element('span', [], { attrs: { id: 'a' } }))],
    ['empty', root(element('p', [], { attrs: { id: '' } }))],
    ['space', root(element('p', [], { attrs: { id: 'a b' } }))],
    ['tab', root(element('p', [], { attrs: { id: 'a\tb' } }))],
    ['newline', root(element('p', [], { attrs: { id: 'a\nb' } }))],
    ['missing for', root(element('label', [], { attrs: { for: 'outside' } }))],
    ['empty for', root(element('label', [], { attrs: { for: '' } }))],
    ['multiple for', root(element('label', [], { attrs: { for: 'a b' } }))],
    ['nonlabelable', root(element('label', [], { attrs: { for: 'a' } }), element('p', [], { attrs: { id: 'a' } }))],
    ['missing aria', root(element('p', [], { attrs: { 'aria-labelledby': 'outside' } }))],
    ['empty aria list', root(element('p', [], { attrs: { 'aria-controls': ' \t\n' } }))],
    ['multiple single aria', root(element('p', [], { attrs: { 'aria-activedescendant': 'a b' } }))],
    ['unsupported aria', root(element('p', [], { attrs: { 'aria-details': 'a' } }))],
  ];

  it.each(invalidIds)('[VDOM-02][PATCH-01][임시 OPEN-01][임시 OPEN-09] ID/참조 전체 검증: %s', async (_name, tree) => {
    const { validateRoot } = await projectModule<VDOMModule>('core/vdom.ts');
    const snapshot = JSON.stringify(tree);
    freeze(tree);
    expect(() => validateRoot(tree, 'html')).toThrow();
    expect(JSON.stringify(tree)).toBe(snapshot);
  });

  it.each([
    root(element('p', [], { attrs: { style: 'color:red' } })),
    root(element('script')),
    root(element('p', [], { domProps: { value: 'invalid' } })),
    root(element('textarea', [text('duplicate')], { domProps: { value: 'value', disabled: false } })),
    root(element('input', [], { attrs: { type: 'text', value: 'duplicate' }, domProps: { value: 'v', disabled: false } })),
    { kind: 'root', children: [{ ...element('p'), events: { blur: () => undefined } }] },
    { kind: 'root', children: [{ ...element('p'), domProps: { mystery: true } }] },
  ])('[VDOM-02][QA-03][임시 OPEN-01][임시 OPEN-09] host의 미지원 속성·프로퍼티·이벤트와 textarea 중복값을 거부한다 %#', async (tree) => {
    const { validateRoot } = await projectModule<VDOMModule>('core/vdom.ts');
    freeze(tree);
    expect(() => validateRoot(tree, 'component')).toThrow();
  });

  it('[VDOM-02][임시 OPEN-01] html 모드는 함수 이벤트를 거부하고 component 모드는 지원 이벤트를 허용한다', async () => {
    const { validateRoot } = await projectModule<VDOMModule>('core/vdom.ts');
    const tree = freeze(root(element('button', [text('go')], {
      attrs: { type: 'button' }, domProps: { disabled: false }, events: { click: () => undefined },
    })));
    expect(() => validateRoot(tree, 'component')).not.toThrow();
    expect(() => validateRoot(tree, 'html')).toThrow();
  });
});
