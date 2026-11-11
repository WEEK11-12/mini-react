import { describe, expect, it } from 'vitest';
import { HistoryStore } from '../../../src/playground/history';
import { parseHTML, serializeHTML } from '../../../src/playground/html-editor';
import { diff } from '../../../src/core/diff';
import { validateRoot, type VElement, type VRoot } from '../../../src/core/vdom';

const parse = (html: string) => parseHTML(html, document);

function hideData(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  for (const name of Object.getOwnPropertyNames(value)) {
    if (Array.isArray(value) && name === 'length') continue;
    const child: unknown = Reflect.get(value, name);
    Object.defineProperty(value, name, { enumerable: false });
    hideData(child);
  }
}
function freezeData(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  for (const name of Object.getOwnPropertyNames(value)) freezeData(Reflect.get(value, name));
  Object.freeze(value);
}
function assertFrozenIndependent(source: unknown, saved: unknown): void {
  if (!source || typeof source !== 'object') { expect(saved).toBe(source); return; }
  expect(saved).not.toBe(source);
  expect(Object.isFrozen(saved)).toBe(true);
  expect(Object.getOwnPropertyNames(saved).sort()).toEqual(Object.getOwnPropertyNames(source).sort());
  for (const name of Object.getOwnPropertyNames(source)) {
    assertFrozenIndependent(Reflect.get(source, name), Reflect.get(saved as object, name));
  }
}
const fixture = '<section data-key="parent"><label for="field">label</label><input id="field" data-key="check" type="checkbox" checked disabled value="&quot;&amp;&#13;&#10;"><textarea data-key="area">\n\n&lt;/textarea&gt;&amp;\n</textarea><p data-key=" &quot;&amp;&#13;🔑 " title="&lt;&amp;&quot;&#13;" data-value="&amp;amp;">text &amp; &#13;</p><br></section>';

describe('4단계 F2 제한 재검토: own 데이터 보존', () => {
  it.each(['constructor', 'push'] as const)('%s는 비열거 root·element·text 필드와 모든 중첩 데이터를 명시 복사한다', operation => {
    const source = parse(fixture);
    hideData(source);
    freezeData(source);
    expect(Object.keys(source)).toEqual([]);
    expect(Object.keys(source.children[0])).toEqual([]);
    validateRoot(source, 'html');
    const history = operation === 'constructor' ? new HistoryStore(source) : new HistoryStore(parse('<p>initial</p>'));
    if (operation === 'push') history.push(source);
    const saved = history.current();
    validateRoot(saved, 'html');
    expect(diff(source, saved).hasChanges).toBe(false);
    assertFrozenIndependent(source, saved);
    const parent = saved.children[0] as VElement;
    expect(parent.key).toBe('parent');
    expect((parent.children[3] as VElement).key).toBe(' "&\r🔑 ');
    const text = (parent.children[0] as VElement).children[0];
    expect(text.kind).toBe('text');
    if (text.kind === 'text') expect(text.value).toBe('label');
    expect(Object.keys(source)).toEqual([]);
  });

  it('비열거 스냅샷은 원본 필드·맵의 후속 변경과 독립이다', () => {
    const source = parse('<p data-key="p" title="before">before</p><input value="before">');
    hideData(source);
    const history = new HistoryStore(source);
    const saved = history.current();
    const paragraph = source.children[0] as VElement;
    const input = source.children[1] as VElement;
    Reflect.set(paragraph.attrs, 'title', 'after');
    Reflect.set(paragraph, 'key', 'after');
    Reflect.set(paragraph.children[0], 'value', 'after');
    Reflect.set(input.domProps, 'value', 'after');
    expect((saved.children[0] as VElement).attrs.title).toBe('before');
    expect((saved.children[0] as VElement).key).toBe('p');
    expect(((saved.children[0] as VElement).children[0] as { value: string }).value).toBe('before');
    expect((saved.children[1] as VElement).domProps.value).toBe('before');
  });

  it('비열거 동일 상태의 push는 현재 참조·cursor·forward를 유지하고 실변경만 분기한다', () => {
    const source = parse(fixture);
    const history = new HistoryStore(source);
    const before = history.current();
    history.push(parse('<p>future</p>'));
    const future = history.current();
    history.commitMove(-1);
    const hidden = parse(fixture);
    hideData(hidden);
    history.push(hidden);
    expect(history.current()).toBe(before);
    expect(history.peek(1)).toBe(future);
    expect([history.position(), history.count()]).toEqual([1, 2]);
    const changed = parse('<p data-key="changed">new branch</p>');
    hideData(changed);
    history.push(changed);
    expect(history.canForward()).toBe(false);
    expect(history.peek(-1)).toBe(before);
    expect([history.position(), history.count()]).toEqual([2, 2]);
    expect(diff(history.current(), changed).hasChanges).toBe(false);
  });

  it.each([false, true])('직렬화는 hidden=%s인 VNode 필드·attrs·폼·ID·key·이스케이프 의미를 보존한다', hidden => {
    const source = parse(fixture);
    if (hidden) hideData(source);
    freezeData(source);
    validateRoot(source, 'html');
    const html = serializeHTML(source);
    const restored = parse(html);
    expect(diff(source, restored).hasChanges).toBe(false);
    expect(html).toContain('title="&lt;&amp;&quot;&#13;"');
    expect(html).toContain('checked=""');
    expect(html).toContain('disabled=""');
    expect(html).toContain('for="field"');
    expect(html).toContain('id="field"');
    expect((restored.children[0] as VElement).children).toHaveLength(5);
  });

  it('null-prototype attrs·domProps의 비열거 값도 독립 복사하고 직렬화한다', () => {
    const source = parse('<input type="checkbox" checked value="&lt;&amp;&quot;" disabled>');
    const input = source.children[0] as VElement;
    Object.setPrototypeOf(input.attrs, null);
    Object.setPrototypeOf(input.domProps, null);
    hideData(source);
    const saved = new HistoryStore(source).current();
    expect(diff(source, saved).hasChanges).toBe(false);
    expect(diff(source, parse(serializeHTML(source))).hasChanges).toBe(false);
    expect((saved.children[0] as VElement).attrs).not.toBe(input.attrs);
    expect((saved.children[0] as VElement).domProps).not.toBe(input.domProps);
  });

  it('잘못된 비열거 attrs/domProps 및 symbol은 계속 거부하고 현재·forward를 보존한다', () => {
    const history = new HistoryStore(parse('<p>before</p>'));
    const before = history.current();
    history.push(parse('<p>future</p>'));
    const future = history.current();
    history.commitMove(-1);
    const cases: VRoot[] = [];
    for (const mode of ['attribute', 'property', 'symbol'] as const) {
      const source = parse('<input>');
      const input = source.children[0] as VElement;
      if (mode === 'attribute') Object.defineProperty(input.attrs, 'onclick', { value: 'bad', enumerable: false });
      if (mode === 'property') Object.defineProperty(input.domProps, 'checked', { value: true, enumerable: false });
      if (mode === 'symbol') Object.defineProperty(input.attrs, Symbol('unsupported'), { value: 'bad', enumerable: false });
      cases.push(source);
    }
    for (const source of cases) {
      expect(() => history.push(source)).toThrow();
      expect(() => serializeHTML(source)).toThrow();
      expect(history.current()).toBe(before);
      expect(history.peek(1)).toBe(future);
      expect([history.position(), history.count()]).toEqual([1, 2]);
    }
  });
});
