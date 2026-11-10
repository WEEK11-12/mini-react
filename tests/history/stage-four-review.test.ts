import { describe, expect, it } from 'vitest';
import { parseHTML, serializeHTML } from '../../src/playground/html-editor';
import { HistoryStore } from '../../src/playground/history';
import { diff } from '../../src/core/diff';
import { validateRoot, type VElement, type VRoot } from '../../src/core/vdom';
import { startPlayground } from '../../src/playground/controller';
import { createDOMScope, releaseDOMScope } from '../../src/core/dom-bindings';

const parse = (html: string) => parseHTML(html, document);
const same = (a: VRoot, b: VRoot) => expect(diff(a, b).hasChanges).toBe(false);

describe('4단계 검증 에이전트: HTML 의미상 왕복', () => {
  it.each([
    ['empty', ''],
    ['text and CR', 'leading &amp; &lt; &gt; &quot; &#13; tail<br>next'],
    ['input empty', '<input value="">'],
    ['input escapes', '<input value="&lt;&amp;&quot; &#9;🔑">'],
    ['checkbox false', '<input type="checkbox" value="&lt;&amp;&quot;&#13;&#10;">'],
    ['checkbox true disabled', '<input type="checkbox" checked disabled value="">'],
    ['textarea empty', '<textarea></textarea>'],
    ['textarea leading LF', '<textarea>\n\nleading\n</textarea>'],
    ['textarea escapes', '<textarea>&lt;/textarea&gt;&lt;script&gt;not code&lt;/script&gt;&amp;&quot;</textarea>'],
    ['forms disabled', '<textarea disabled>value</textarea><button disabled>go</button>'],
    ['logical IDs and ARIA', '<label for="field">label</label><input id="field"><span id="hint">hint</span><p aria-labelledby="field hint" aria-controls="field" aria-errormessage="hint">text</p>'],
    ['key and attributes', '<p data-key=" &quot;&amp;&#13;&#10;🔑 " title="&lt;&amp;&quot;&#13;&#10;" data-note="&amp;amp;">text</p>'],
  ])('%s: serialize→parse is stable across repeated round trips', (_name, html) => {
    const original = parse(html);
    let tree = original;
    for (let index = 0; index < 3; index += 1) {
      tree = parse(serializeHTML(tree));
      same(original, tree);
    }
  });

  it('현재 폼 값은 attrs/defaultValue가 아닌 domProps에서 직렬화한다', () => {
    const tree = parse('<input value="before"><input type="checkbox"><textarea>before</textarea>');
    const children = tree.children as VElement[];
    const next: VRoot = { ...tree, children: children.map((node, index) => ({ ...node,
      domProps: { ...node.domProps, value: index === 2 ? '\n\n<&"\n' : '<&"', ...(index === 1 ? { checked: true } : {}) },
    })) };
    const html = serializeHTML(next);
    expect(html).not.toContain('before');
    same(next, parse(html));
    expect(parse(html).children).toHaveLength(3);
  });
});

describe('4단계 검증 에이전트: History 경계', () => {
  it('재귀 동결·독립 attrs/domProps/children 및 무변경 참조 보존', () => {
    const original = parse('<p id="p" data-key="p">A</p><input value="A">');
    const history = new HistoryStore(original);
    const current = history.current();
    const node = current.children[0] as VElement;
    for (const object of [current, current.children, node, node.attrs, node.domProps, node.events, node.children, node.children[0]]) {
      expect(Object.isFrozen(object)).toBe(true);
    }
    expect(node.attrs).not.toBe((original.children[0] as VElement).attrs);
    history.push(parse('<p id="p" data-key="p">B</p><input value="B">'));
    const future = history.current();
    history.commitMove(-1);
    history.push(parse(serializeHTML(current)));
    expect(history.current()).toBe(current);
    expect(history.peek(1)).toBe(future);
    expect(history.position()).toBe(1);
    expect(history.count()).toBe(2);
  });

  it('실패한 push는 과거 위치의 현재·forward·count를 보존한다', () => {
    const history = new HistoryStore(parse('<p>A</p>'));
    history.push(parse('<p>B</p>'));
    const future = history.current();
    history.commitMove(-1);
    const before = history.current();
    const invalid = { kind: 'root', children: [{ kind: 'element', tag: 'script', attrs: {}, domProps: {}, events: {}, children: [] }] };
    expect(() => history.push(invalid as VRoot)).toThrow();
    expect(history.current()).toBe(before);
    expect(history.peek(1)).toBe(future);
    expect(history.position()).toBe(1);
    expect(history.count()).toBe(2);
  });

  it('검증을 통과한 own 비열거 attrs와 폼 프로퍼티도 snapshot에서 보존한다', () => {
    const tree = parse('<input>');
    const input = tree.children[0] as VElement;
    Object.defineProperty(input.attrs, 'title', { value: 'saved title', enumerable: false });
    Object.defineProperty(input.domProps, 'value', { value: 'saved value', enumerable: false, configurable: true });
    validateRoot(tree, 'html');
    const history = new HistoryStore(tree);
    expect.soft(diff(history.current(), tree).hasChanges).toBe(false);
    expect.soft((history.current().children[0] as VElement).attrs.title).toBe('saved title');
    expect.soft((history.current().children[0] as VElement).domProps.value).toBe('saved value');
  });

  it('검증을 통과한 own 비열거 attrs도 HTML 직렬화에서 보존한다', () => {
    const tree = parse('<p>text</p>');
    Object.defineProperty((tree.children[0] as VElement).attrs, 'title', { value: 'saved title', enumerable: false });
    validateRoot(tree, 'html');
    const restored = parse(serializeHTML(tree));
    expect.soft((restored.children[0] as VElement).attrs.title).toBe('saved title');
    expect.soft(diff(tree, restored).hasChanges).toBe(false);
  });
});

describe('4단계 검증 에이전트: 컨트롤러 종료', () => {
  it('종료는 두 컨테이너·컨트롤러 리스너·scope를 해제한다', () => {
    const actual = document.createElement('div');
    const preview = document.createElement('div');
    const editor = document.createElement('textarea');
    const patch = document.createElement('button');
    const back = document.createElement('button');
    const forward = document.createElement('button');
    const status = document.createElement('output');
    actual.innerHTML = '<label for="field">label</label><input id="field">';
    document.body.append(actual, preview, editor, patch, back, forward, status);
    const stop = startPlayground({ actual, preview, editor, patch, back, forward, status });
    try {
      expect(actual.children.length).toBe(2);
      stop();
      expect(actual.childNodes.length).toBe(0);
      expect(preview.childNodes.length).toBe(0);
      expect(editor.disabled).toBe(true);
      editor.value = '<p>must not render</p>';
      editor.dispatchEvent(new Event('input'));
      patch.dispatchEvent(new Event('click'));
      expect(actual.childNodes.length).toBe(0);
      expect(preview.childNodes.length).toBe(0);
      for (const container of [actual, preview]) {
        const scope = createDOMScope(container);
        releaseDOMScope(scope);
      }
    } finally { actual.remove(); preview.remove(); editor.remove(); patch.remove(); back.remove(); forward.remove(); status.remove(); }
  });
});
