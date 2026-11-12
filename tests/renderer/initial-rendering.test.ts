import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { projectModule } from '../support/project';
import { element, freeze, host, root, text } from './fixtures';
import type { BindingsModule, DOMScope, PatchModule, ReaderModule, VDOMModule } from './fixtures';

let reader: ReaderModule;
let bindings: BindingsModule;
let renderer: Pick<PatchModule, 'mountTree'>;
let validator: VDOMModule;
const scopes: { container: Element; scope: DOMScope }[] = [];

beforeEach(async () => {
  [reader, bindings, renderer, validator] = await Promise.all([
    projectModule<ReaderModule>('core/dom-reader.ts'),
    projectModule<BindingsModule>('core/dom-bindings.ts'),
    projectModule<Pick<PatchModule, 'mountTree'>>('core/patch.ts'),
    projectModule<VDOMModule>('core/vdom.ts'),
  ]);
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const { container, scope } of scopes.splice(0)) {
    container.replaceChildren();
    bindings.releaseDOMScope(scope);
  }
});

function scopedHost(): { container: HTMLDivElement; scope: DOMScope } {
  const container = host();
  const scope = bindings.createDOMScope(container);
  scopes.push({ container, scope });
  return { container, scope };
}

describe('1단계: Diff/Patch 갱신에 의존하지 않는 초기 렌더링', () => {
  it('[VDOM-01, VDOM-02, PATCH-01][임시 OPEN-01] 빈 텍스트·다중 루트·현재 폼 값·key·ID 참조를 두 scope로 왕복한다', () => {
    const tree = freeze(root(text(''), element('label', [text('동의')], { attrs: { for: 'field' } }),
      element('input', [], { key: ' 01 "&\n🔑 ', attrs: { type: 'checkbox', id: 'field' }, domProps: { value: 'on', checked: true, disabled: false } }),
      element('textarea', [], { domProps: { value: '</textarea><script>text</script>', disabled: false } }),
      element('p', [text(' \n')], { attrs: { 'aria-labelledby': 'field', class: 'sample' } }),
    ));
    const first = scopedHost();
    const second = scopedHost();
    for (const { container, scope } of [first, second]) {
      renderer.mountTree(container, tree, scope);
      expect(reader.readDOM(container, scope)).toEqual(tree);
      expect(container.firstChild).toBeInstanceOf(Text);
      expect(container.querySelector('script')).toBeNull();
      expect(container.querySelector('label')!.control).toBe(container.querySelector('input'));
      expect(container.querySelector('input')!.getAttribute('data-key')).toBe(' 01 "&\n🔑 ');
    }
    expect(first.container.querySelector('input')!.id).not.toBe(second.container.querySelector('input')!.id);
  });

  it('[VDOM-02, PATCH-01][임시 OPEN-01] 모든 지원 ID 참조와 일반 문자열을 구별하고 목록 공백만 정규화한다', () => {
    const template = document.createElement('template');
    template.innerHTML = '<input id="field" type="text"><p id="help">help</p><label for="field">label</label>'
      + '<section aria-activedescendant="field" aria-errormessage="help" aria-labelledby=" field\t help "'
      + ' aria-describedby="help field" aria-controls="field" aria-owns="help" aria-flowto="field help"'
      + ' aria-label="field help" title="field help" data-id-like="field"></section>';
    const tree = reader.readDOM(template.content);
    const entry = scopedHost();
    renderer.mountTree(entry.container, tree, entry.scope);
    const fieldId = entry.container.querySelector('input')!.id;
    const helpId = entry.container.querySelector('p')!.id;
    const section = entry.container.querySelector('section')!;
    const expected = {
      'aria-activedescendant': fieldId, 'aria-errormessage': helpId,
      'aria-labelledby': `${fieldId} ${helpId}`, 'aria-describedby': `${helpId} ${fieldId}`,
      'aria-controls': fieldId, 'aria-owns': helpId, 'aria-flowto': `${fieldId} ${helpId}`,
    };
    for (const [name, value] of Object.entries(expected)) expect(section.getAttribute(name)).toBe(value);
    expect(section.getAttribute('aria-label')).toBe('field help');
    expect(section.getAttribute('data-id-like')).toBe('field');
    expect(section.getAttribute('title')).toBe('field help');
    expect(reader.readDOM(entry.container, entry.scope)).toEqual(tree);
  });

  it('[PATCH-01] 빈 VRoot는 호스트를 유지하고 자식 노드를 추가하지 않는다', () => {
    const entry = scopedHost();
    renderer.mountTree(entry.container, root(), entry.scope);
    expect(entry.container.childNodes).toHaveLength(0);
    expect(entry.container.isConnected).toBe(true);
  });

  it('[PATCH-01][임시 OPEN-09] 전체 검증 실패와 비어 있지 않은 호스트는 기존 DOM을 변경하지 않는다', () => {
    const entry = scopedHost();
    const invalid = root(element('p', [], { key: 'same' }), element('p', [], { key: 'same' }));
    const observer = new MutationObserver(() => undefined);
    observer.observe(entry.container, { subtree: true, childList: true, attributes: true });
    try {
      expect(() => renderer.mountTree(entry.container, invalid, entry.scope)).toThrow();
      expect(observer.takeRecords()).toEqual([]);
      const original = document.createElement('span');
      entry.container.append(original);
      expect(() => renderer.mountTree(entry.container, root(element('p')), entry.scope)).toThrow();
      expect(entry.container.firstChild).toBe(original);
    } finally {
      observer.disconnect();
    }
  });

  it('[PATCH-01][임시 OPEN-01·09] 준비 중 예외는 앞서 연결한 이벤트를 회수하고 같은 scope로 재시도할 수 있다', () => {
    const entry = scopedHost();
    const listener = vi.fn();
    const nativeCreate = document.createElement.bind(document);
    let button: HTMLButtonElement | undefined;
    const create = vi.spyOn(document, 'createElement').mockImplementation((tag, options) => {
      const node = nativeCreate(tag, options);
      if (node instanceof HTMLButtonElement) button = node;
      return node;
    });
    const nativeSet = Element.prototype.setAttribute;
    const set = vi.spyOn(Element.prototype, 'setAttribute').mockImplementation(function (this: Element, name: string, value: string): void {
      if (name === 'title' && value === 'fail') throw new Error('injected preparation failure');
      nativeSet.call(this, name, value);
    });
    try {
      expect(() => renderer.mountTree(entry.container, root(
        element('button', [], { attrs: { type: 'button' }, domProps: { disabled: false }, events: { click: listener } }),
        element('p', [], { attrs: { title: 'fail' } }),
      ), entry.scope)).toThrow('injected preparation failure');
      expect(button).toBeDefined();
      button!.dispatchEvent(new Event('click'));
      expect(listener).not.toHaveBeenCalled();
      expect(entry.container.childNodes).toHaveLength(0);
    } finally {
      create.mockRestore();
      set.mockRestore();
    }
    renderer.mountTree(entry.container, root(element('p', [text('retry')])), entry.scope);
    expect(entry.container.textContent).toBe('retry');
  });

  it('[VDOM-02, PATCH-01][임시 OPEN-01] scope 소유권과 중첩·중복 등록, 해제 후 재사용을 검사한다', () => {
    const entry = scopedHost();
    const other = host();
    const child = document.createElement('div');
    entry.container.append(child);
    expect(() => bindings.createDOMScope(entry.container)).toThrow();
    expect(() => bindings.createDOMScope(child)).toThrow();
    expect(() => reader.readDOM(other, entry.scope)).toThrow();
    expect(() => renderer.mountTree(other, root(), entry.scope)).toThrow();
    entry.container.replaceChildren();
    bindings.releaseDOMScope(entry.scope);
    scopes.pop();
    expect(() => reader.readDOM(entry.container, entry.scope)).toThrow();
    expect(() => renderer.mountTree(entry.container, root(), entry.scope)).toThrow();
    const replacement = bindings.createDOMScope(entry.container);
    scopes.push({ container: entry.container, scope: replacement });
    renderer.mountTree(entry.container, root(), replacement);
  });

  it.each(['foreign', 'unissued'] as const)('[VDOM-02][임시 OPEN-01·09] 참조 없는 id의 %s 값은 역변환하지 않는다', (source) => {
    const first = scopedHost();
    const second = scopedHost();
    for (const entry of [first, second]) renderer.mountTree(entry.container, root(element('p', [], { attrs: { id: 'logical' } })), entry.scope);
    const node = first.container.querySelector('p')!;
    node.id = source === 'foreign' ? second.container.querySelector('p')!.id : `${node.id}-unissued`;
    expect(() => reader.readDOM(first.container, first.scope)).toThrow();
  });

  it('[VDOM-02][임시 OPEN-01·09] 관리 DOM을 scope 없이 읽거나 살아 있는 DOM의 scope를 해제하지 않는다', () => {
    const entry = scopedHost();
    renderer.mountTree(entry.container, root(element('p', [], { attrs: { id: 'logical' } })), entry.scope);
    expect(() => reader.readDOM(entry.container)).toThrow();
    expect(() => bindings.releaseDOMScope(entry.scope)).toThrow();
    expect(reader.readDOM(entry.container, entry.scope).children).toHaveLength(1);
  });

  it.each<Record<string, string>>([
    { 'data-KEY': 'same' }, { 'data-Key': '' }, { 'data-X': 'first', 'data-x': 'second' },
  ])('[VDOM-02, PATCH-01][임시 OPEN-01·09] 정규화 VRoot의 ASCII 대문자 속성명은 변경 없이 거부한다 %#', (attrs) => {
    const entry = scopedHost();
    const tree = freeze(root(element('p', [], { attrs })));
    const before = JSON.stringify(tree);
    expect(() => validator.validateRoot(tree, 'html')).toThrow();
    expect(() => renderer.mountTree(entry.container, tree, entry.scope)).toThrow();
    expect(entry.container.childNodes).toHaveLength(0);
    expect(JSON.stringify(tree)).toBe(before);
  });

  it.each([
    ['input', 'a\nb'], ['input', 'a\rb'], ['input', 'a\r\nb'],
    ['textarea', 'a\rb'], ['textarea', 'a\r\nb'],
  ])('[VDOM-02, PATCH-01][임시 OPEN-01·09] %s의 비정규 줄바꿈 value를 DOM 반영 전에 거부한다 %#', (tag, value) => {
    const entry = scopedHost();
    const tree = freeze(root(element(tag, [], {
      attrs: tag === 'input' ? { type: 'text' } : {}, domProps: { value, disabled: false },
    })));
    expect(() => validator.validateRoot(tree, 'component')).toThrow();
    expect(() => renderer.mountTree(entry.container, tree, entry.scope)).toThrow();
    expect(entry.container.childNodes).toHaveLength(0);
    expect(tree.children[0]).toMatchObject({ domProps: { value } });
  });

  it('[VDOM-02, PATCH-01][임시 OPEN-01] textarea LF와 text input의 탭은 손실 없이 허용한다', () => {
    const entry = scopedHost();
    const tree = freeze(root(
      element('input', [], { attrs: { type: 'text' }, domProps: { value: 'a\tb', disabled: false } }),
      element('textarea', [], { domProps: { value: '한글\nsecond\n', disabled: false } }),
    ));
    renderer.mountTree(entry.container, tree, entry.scope);
    expect(reader.readDOM(entry.container, entry.scope)).toEqual(tree);
  });

  it('[VDOM-02, PATCH-01][임시 OPEN-01·09] 비열거 own 이벤트도 html 모드에서 거부하고 component에서는 검증한 함수만 바인딩한다', () => {
    const entry = scopedHost();
    const handler = vi.fn();
    const events = {};
    Object.defineProperty(events, 'click', { value: handler });
    const tree = root(element('button', [], { attrs: { type: 'button' }, domProps: { disabled: false }, events }));
    expect(Object.keys(events)).toEqual([]);
    expect(() => validator.validateRoot(tree, 'html')).toThrow();
    expect(() => validator.validateRoot(tree, 'component')).not.toThrow();
    renderer.mountTree(entry.container, tree, entry.scope);
    entry.container.querySelector('button')!.dispatchEvent(new Event('click'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('[VDOM-02][임시 OPEN-01·09] 비열거 미지원 이벤트 이름도 검증을 우회하지 못한다', () => {
    const events = {};
    Object.defineProperty(events, 'blur', { value: () => undefined });
    expect(() => validator.validateRoot(root(element('p', [], { events })), 'component')).toThrow();
  });

  it.each([
    ['input', 'TEXT', 'text'], ['input', 'CHECKBOX', 'checkbox'], ['input', 'ChEcKbOx', 'checkbox'],
    ['button', 'BUTTON', 'button'],
  ])('[VDOM-02][임시 OPEN-01] HTML %s type=%s는 지원 type %s로 ASCII 정규화한다', (tag, type, expected) => {
    const template = document.createElement('template');
    const control = document.createElement(tag);
    control.setAttribute('type', type);
    if (expected === 'checkbox') control.setAttribute('checked', '');
    template.content.append(control);
    const tree = reader.readDOM(template.content);
    expect(tree.children[0]).toMatchObject({ attrs: { type: expected } });
    if (expected === 'checkbox') expect(tree.children[0]).toMatchObject({ domProps: { checked: true } });
    const entry = scopedHost();
    renderer.mountTree(entry.container, tree, entry.scope);
    expect(reader.readDOM(entry.container, entry.scope)).toEqual(tree);
  });

  it.each(['RADIO', 'unknown', 'checKbox'])(
    '[VDOM-02][임시 OPEN-01·09] native text fallback으로 미지원 원본 type=%s를 허용하지 않는다',
    (type) => {
      const template = document.createElement('template');
      const input = document.createElement('input');
      input.setAttribute('type', type);
      template.content.append(input);
      expect(() => reader.readDOM(template.content)).toThrow();
    },
  );

  it.each<{ tag: string; type?: string; name: PropertyKey; value: unknown }>([
    { tag: 'input', type: 'text', name: 'value', value: 'a\nb' },
    { tag: 'input', type: 'text', name: 'value', value: 123 },
    { tag: 'input', type: 'checkbox', name: 'checked', value: 'false' },
    { tag: 'input', type: 'text', name: 'disabled', value: 'false' },
    { tag: 'textarea', name: 'value', value: 'a\rb' },
    { tag: 'input', type: 'text', name: 'unknown', value: true },
    { tag: 'input', type: 'text', name: Symbol('value'), value: 'text' },
  ])('[VDOM-02, PATCH-01][임시 OPEN-01·09] 비열거 domProps도 타입·이름·줄바꿈 검증을 우회하지 못한다 %#', ({ tag, type, name, value }) => {
    const entry = scopedHost();
    const domProps = { disabled: false };
    Object.defineProperty(domProps, name, { value, enumerable: false, configurable: true });
    const tree = root(element(tag, [], { attrs: type ? { type } : {}, domProps }));
    const observer = new MutationObserver(() => undefined);
    observer.observe(entry.container, { childList: true, subtree: true, attributes: true });
    try {
      expect.soft(() => validator.validateRoot(tree, 'component')).toThrow();
      expect.soft(() => renderer.mountTree(entry.container, tree, entry.scope)).toThrow();
      expect(entry.container.childNodes).toHaveLength(0);
      expect(observer.takeRecords()).toEqual([]);
    } finally {
      observer.disconnect();
    }
  });

  it('[VDOM-02, PATCH-01][임시 OPEN-01] 정상 비열거 attrs·domProps는 검증한 값 그대로 반영한다', () => {
    const entry = scopedHost();
    const attrs = {};
    Object.defineProperties(attrs, { type: { value: 'checkbox' }, 'data-x': { value: 'preserved' } });
    const domProps = {};
    Object.defineProperties(domProps, { value: { value: 'on' }, checked: { value: true }, disabled: { value: false } });
    const tree = freeze(root(element('input', [], { attrs, domProps })));
    validator.validateRoot(tree, 'component');
    renderer.mountTree(entry.container, tree, entry.scope);
    expect(reader.readDOM(entry.container, entry.scope)).toEqual(root(element('input', [], {
      attrs: { type: 'checkbox', 'data-x': 'preserved' }, domProps: { value: 'on', checked: true, disabled: false },
    })));
  });

  it.each([
    root(element('br', [text('invalid')])),
    { kind: 'root', children: [{ kind: 'text', value: 1 }] },
    root(element('p', [], { attrs: { title: 1 as unknown as string } })),
  ])('[VDOM-01, PATCH-01][임시 OPEN-01·09] 잘못된 자료형·void children을 적용 전에 거부한다 %#', (tree) => {
    expect(() => validator.validateRoot(tree, 'html')).toThrow();
  });
});
