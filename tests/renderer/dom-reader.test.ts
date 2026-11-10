// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { projectModule } from '../support/project';
import { expectSameNodes } from '../support/observations';
import { element, host, parse, requireElement, root, text } from './fixtures';
import type { ReaderModule } from './fixtures';

afterEach(() => document.body.replaceChildren());

describe('readDOM', () => {
  it('[VDOM-01][VDOM-02] 중첩, 빈 요소, 공백과 인접 빈 텍스트까지 childNodes 순서대로 읽는다', async () => {
    const { readDOM } = await projectModule<ReaderModule>('core/dom-reader.ts');
    const container = host();
    container.append(document.createTextNode(' '), document.createTextNode(''));
    const paragraph = document.createElement('p');
    paragraph.setAttribute('class', 'lead');
    paragraph.append('앞', document.createElement('strong'), '뒤');
    container.append(paragraph, document.createTextNode('\n'));
    expect(readDOM(container)).toEqual(root(
      text(' '), text(''),
      element('p', [text('앞'), element('strong'), text('뒤')], { attrs: { class: 'lead' } }),
      text('\n'),
    ));
    expect(container.childNodes).toHaveLength(4);
  });

  it('[VDOM-01] 빈 Element와 분리된 DocumentFragment는 가상 root만 반환한다', async () => {
    const { readDOM } = await projectModule<ReaderModule>('core/dom-reader.ts');
    expect(readDOM(host())).toEqual(root());
    expect(readDOM(document.createDocumentFragment())).toEqual(root());
    expect(readDOM(parse('<p>A</p><span>B</span>'))).toEqual(root(
      element('p', [text('A')]), element('span', [text('B')]),
    ));
  });

  it.each([' 01 ', 'a"&\nb', '🔑', 'constructor', '__proto__'])(
    '[VDOM-02] data-key %j는 trim·변환 없이 읽고 attrs에 중복 저장하지 않는다',
    async (key) => {
      const { readDOM } = await projectModule<ReaderModule>('core/dom-reader.ts');
      const container = host();
      const node = document.createElement('p');
      node.setAttribute('data-key', key);
      node.setAttribute('data-note', 'ordinary');
      container.append(node);
      expect(readDOM(container)).toEqual(root(element('p', [], {
        key, attrs: { 'data-note': 'ordinary' },
      })));
    },
  );

  it('[VDOM-02][임시 OPEN-01] text input·checkbox·textarea는 초기 HTML보다 현재 프로퍼티를 읽는다', async () => {
    const { readDOM } = await projectModule<ReaderModule>('core/dom-reader.ts');
    const container = host();
    container.innerHTML = '<input value="initial"><input type="checkbox" value="old" checked><textarea>initial</textarea>';
    const input = requireElement(container, 'input', HTMLInputElement);
    const checkbox = requireElement(container, 'input[type=checkbox]', HTMLInputElement);
    const textarea = requireElement(container, 'textarea', HTMLTextAreaElement);
    input.value = 'typed';
    checkbox.value = 'current';
    checkbox.checked = false;
    textarea.value = '현재\n<&>';
    expect(readDOM(container)).toEqual(root(
      element('input', [], { attrs: { type: 'text' }, domProps: { value: 'typed', disabled: false } }),
      element('input', [], { attrs: { type: 'checkbox' }, domProps: { value: 'current', checked: false, disabled: false } }),
      element('textarea', [], { domProps: { value: '현재\n<&>', disabled: false } }),
    ));
    expect(input.getAttribute('value')).toBe('initial');
    expect(checkbox.hasAttribute('checked')).toBe(true);
    expect(textarea.textContent).toBe('initial');
  });

  it('[VDOM-02][임시 OPEN-01] 폼 기본값과 boolean 존재 여부를 정규화하고 events는 비운다', async () => {
    const { readDOM } = await projectModule<ReaderModule>('core/dom-reader.ts');
    const container = host();
    container.innerHTML = '<input><input type="checkbox"><textarea></textarea><button disabled="false">Go</button>';
    container.firstElementChild?.addEventListener('input', () => undefined);
    expect(readDOM(container)).toEqual(root(
      element('input', [], { attrs: { type: 'text' }, domProps: { value: '', disabled: false } }),
      element('input', [], { attrs: { type: 'checkbox' }, domProps: { value: 'on', checked: false, disabled: false } }),
      element('textarea', [], { domProps: { value: '', disabled: false } }),
      element('button', [text('Go')], { attrs: { type: 'button' }, domProps: { disabled: true } }),
    ));
  });

  it.each([
    '<!--comment-->', '<svg></svg>', '<custom-node></custom-node>', '<script>0</script>',
    '<iframe></iframe>', '<a href="/">link</a>', '<p style="color:red">x</p>',
    '<p onclick="alert(1)">x</p>', '<input type="radio">', '<input type="number">',
    '<button type="submit">x</button>', '<p key="a"></p>', '<p aria-roledescription="x"></p>',
    '<p data-key=""></p>', '<p data-key="a"></p><p data-key="a"></p>',
  ])('[VDOM-02][QA-03][임시 OPEN-01][임시 OPEN-09] 미지원·잘못된 DOM %s를 조용히 제거하지 않고 거부한다', async (html) => {
    const { readDOM } = await projectModule<ReaderModule>('core/dom-reader.ts');
    const container = parse(html);
    const before = Array.from(container.childNodes);
    const snapshot = before.map((node) => node.cloneNode(true));
    expect(() => readDOM(container)).toThrow();
    expectSameNodes(container.childNodes, before);
    before.forEach((node, index) => expect(node.isEqualNode(snapshot[index])).toBe(true));
  });
});
