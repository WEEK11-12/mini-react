import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type Library = typeof import('../support/stage-three-entry');
let bundle: string;
test.beforeAll(async () => {
  const result = await build({ configFile: false, logLevel: 'silent', build: { write: false,
    lib: { entry: fileURLToPath(new URL('../support/stage-three-entry.ts', import.meta.url)), formats: ['iife'], name: 'StageThreeLibrary' },
  } });
  const outputs = Array.isArray(result) ? result : [result];
  if (outputs.length !== 1 || !('output' in outputs[0])) throw new Error('Missing bundle');
  const chunk = outputs[0].output.find((asset) => asset.type === 'chunk');
  if (!chunk || chunk.type !== 'chunk') throw new Error('Missing chunk');
  bundle = chunk.code;
  if (process.env.MINI_REACT_REVIEW_ARTIFACT_DIR) await writeFile(join(process.env.MINI_REACT_REVIEW_ARTIFACT_DIR, 'mini-react-stage-three-browser-bundle.js'), bundle);
});

test('[PATCH-02][PATCH-03] 실제 Chromium: native 폼→keep 보정·무변경 쓰기 없음·이동/교체·이벤트·두 ID scope', async ({ page, browser }, testInfo) => {
  await page.setContent('<div id="actual"></div><div id="preview"></div>');
  await page.addScriptTag({ content: bundle });
  await page.evaluate(() => {
    const lib = (window as unknown as { StageThreeLibrary: Library }).StageThreeLibrary;
    const parse = (html: string) => { const template = document.createElement('template'); template.innerHTML = html; return lib.readDOM(template.content); };
    const tree = parse('<section data-key="parent"><label for="field">Toggle</label><input id="field" data-key="check" type="checkbox"><input data-key="text" value="target"><textarea data-key="area">target\ntext</textarea><button data-key="btn">go</button><p data-key="a">A</p><p data-key="b">B</p></section>');
    let oldCalls = 0;
    const parent = tree.children[0];
    if (parent.kind !== 'element') throw new Error('fixture');
    const previous = { ...tree, children: [{ ...parent, children: parent.children.map((node) => node.kind === 'element' && node.key === 'btn' ? { ...node, events: { click: () => { oldCalls += 1; } } } : node) }] };
    const actual = document.querySelector('#actual')!; const preview = document.querySelector('#preview')!;
    const a = lib.createDOMScope(actual); const b = lib.createDOMScope(preview);
    lib.mountTree(actual, previous, a); lib.mountTree(preview, tree, b);
    (window as unknown as { review: object }).review = { lib, a, b, previous, parse, oldCalls: () => oldCalls };
  });
  await page.locator('#actual input[type=text]').fill('native');
  await page.locator('#actual textarea').fill('native textarea');
  await page.locator('#preview label').click();
  await expect(page.locator('#preview input[type=checkbox]')).toBeChecked();
  await expect(page.locator('#actual input[type=checkbox]')).not.toBeChecked();
  await page.locator('#actual label').click();
  await expect(page.locator('#actual input[type=checkbox]')).toBeChecked();
  const result = await page.evaluate(() => {
    const { lib, a, b, previous, parse, oldCalls } = (window as unknown as { review: {
      lib: Library; a: object; b: object; previous: Parameters<Library['diff']>[0];
      parse: (html: string) => Parameters<Library['diff']>[0]; oldCalls: () => number;
    } }).review;
    const actual = document.querySelector('#actual')!; const preview = document.querySelector('#preview')!;
    const parent = actual.firstElementChild!;
    const refs = new Map(Array.from(parent.children, (node) => [node.getAttribute('data-key'), node]));
    const keep = lib.diff(previous, previous);
    lib.applyPlan(actual, keep, a);
    const restored = [(refs.get('text') as HTMLInputElement).value, (refs.get('area') as HTMLTextAreaElement).value, (refs.get('check') as HTMLInputElement).checked];
    const observer = new MutationObserver(() => undefined);
    observer.observe(actual, { subtree: true, childList: true, attributes: true, characterData: true });
    let setterWrites = 0; let listenerWrites = 0; let moves = 0;
    const undo: (() => void)[] = [];
    for (const [prototype, names] of [[HTMLInputElement.prototype, ['value', 'checked', 'disabled', 'type']], [HTMLTextAreaElement.prototype, ['value', 'disabled']], [HTMLButtonElement.prototype, ['type', 'disabled']]] as const) {
      for (const name of names) {
        const descriptor = Object.getOwnPropertyDescriptor(prototype, name)!;
        Object.defineProperty(prototype, name, { ...descriptor, set(value: unknown) { setterWrites += 1; descriptor.set!.call(this, value); } });
        undo.push(() => Object.defineProperty(prototype, name, descriptor));
      }
    }
    const add = EventTarget.prototype.addEventListener; const remove = EventTarget.prototype.removeEventListener;
    const insert = Node.prototype.insertBefore;
    EventTarget.prototype.addEventListener = function (...args) { listenerWrites += 1; return add.apply(this, args); };
    EventTarget.prototype.removeEventListener = function (...args) { listenerWrites += 1; return remove.apply(this, args); };
    Node.prototype.insertBefore = function <T extends Node>(node: T, child: Node | null): T { moves += 1; return insert.call(this, node, child) as T; };
    try { lib.applyPlan(actual, keep, a); } finally {
      undo.forEach((restore) => restore()); EventTarget.prototype.addEventListener = add;
      EventTarget.prototype.removeEventListener = remove; Node.prototype.insertBefore = insert;
    }
    const noOp = { mutations: observer.takeRecords().length, setterWrites, listenerWrites, moves };
    observer.disconnect();
    let newCalls = 0;
    const nextPlain = parse('<section data-key="parent"><p data-key="b">updated</p><span data-key="a">replaced</span><button data-key="btn">new</button><input data-key="text" value="after"><textarea data-key="area">after</textarea><label for="renamed">Toggle</label><input id="renamed" data-key="check" type="checkbox" checked><p data-key="new">created</p></section>');
    const nextParent = nextPlain.children[0]; if (nextParent.kind !== 'element') throw new Error('fixture');
    const next = { ...nextPlain, children: [{ ...nextParent, children: nextParent.children.map((node) => node.kind === 'element' && node.key === 'btn' ? { ...node, events: { click: () => { newCalls += 1; } } } : node) }] };
    lib.applyPlan(actual, lib.diff(previous, next), a);
    const button = refs.get('btn')!; button.dispatchEvent(new Event('click'));
    const identity = actual.firstElementChild === parent && actual.querySelector('[data-key=b]') === refs.get('b')
      && actual.querySelector('[data-key=a]') !== refs.get('a') && actual.querySelector('button') === button
      && actual.querySelector('[data-key=text]') === refs.get('text');
    const scopeIsolation = actual.querySelector('label')!.control === actual.querySelector('#' + actual.querySelector('input[type=checkbox]')!.id)
      && preview.querySelector('label')!.control === preview.querySelector('input[type=checkbox]')
      && actual.querySelector('input[type=checkbox]')!.id !== preview.querySelector('input[type=checkbox]')!.id;
    const order = Array.from(parent.children, (node) => node.getAttribute('data-key'));
    const logicalMatch = JSON.stringify(lib.readDOM(actual, a)) === JSON.stringify(next);
    lib.applyPlan(actual, lib.diff(next, nextPlain), a); button.dispatchEvent(new Event('click'));
    lib.applyPlan(actual, lib.diff(nextPlain, { kind: 'root', children: [] }), a); button.dispatchEvent(new Event('click'));
    const result = { restored, noOp, identity, scopeIsolation, order, logicalMatch, oldCalls: oldCalls(), newCalls, detached: !button.isConnected };
    preview.replaceChildren(); lib.releaseDOMScope(a); lib.releaseDOMScope(b);
    return result;
  });
  await testInfo.attach('actual-source-result', { body: JSON.stringify({ browser: browser.version(), ...result }, null, 2), contentType: 'application/json' });
  expect(result).toEqual({ restored: ['target', 'target\ntext', false], noOp: { mutations: 0, setterWrites: 0, listenerWrites: 0, moves: 0 }, identity: true, scopeIsolation: true,
    order: ['b', 'a', 'btn', 'text', 'area', null, 'check', 'new'], logicalMatch: true, oldCalls: 0, newCalls: 1, detached: true });
});

for (const failure of ['creation', 'binding', 'invalid-plan'] as const) {
  test(`[PATCH-02] 실제 Chromium: ${failure} 실패 시 기존 DOM·이벤트 보존과 준비 바인딩 회수`, async ({ page }, testInfo) => {
    await page.setContent('<div id="host"></div>'); await page.addScriptTag({ content: bundle });
    const result = await page.evaluate((failure) => {
      const lib = (window as unknown as { StageThreeLibrary: Library }).StageThreeLibrary;
      const container = document.querySelector('#host')!;
      const scope = lib.createDOMScope(container);
      let oldCalls = 0; let newCalls = 0;
      const el = (tag: string, children: object[] = [], extra: object = {}) => ({ kind: 'element' as const, tag, children, attrs: {}, domProps: {}, events: {}, ...extra });
      const root = (...children: object[]) => ({ kind: 'root', children }) as Parameters<Library['diff']>[0];
      const previous = root(el('button', [], { events: { click: () => { oldCalls += 1; } } }));
      lib.mountTree(container, previous, scope);
      const old = container.firstChild!;
      const next = root(el('section', [el('button', [], { events: { click: () => { newCalls += 1; } } })]),
        el(failure === 'binding' ? 'input' : 'article', [], { events: { click: () => { newCalls += 1; }, input: () => { newCalls += 1; } } }));
      const plan = lib.diff(previous, next);
      const candidate = failure === 'invalid-plan' ? { ...plan, children: { ...plan.children, remove: [99] } } : plan;
      const prepared: Element[] = [];
      const create = document.createElement.bind(document);
      const add = Element.prototype.addEventListener;
      document.createElement = function (tag: string, options?: ElementCreationOptions) {
        if (failure === 'creation' && tag === 'article') throw new Error('creation failure');
        const node = create(tag, options); prepared.push(node); return node;
      };
      Element.prototype.addEventListener = function (...args: Parameters<Element['addEventListener']>) {
        if (failure === 'binding' && args[0] === 'input') throw new Error('binding failure');
        return add.apply(this, args);
      };
      const observer = new MutationObserver(() => undefined);
      observer.observe(container, { subtree: true, attributes: true, childList: true, characterData: true });
      let error: string | null = null;
      try { lib.applyPlan(container, candidate, scope); } catch (caught) { error = String(caught); }
      finally { document.createElement = create; Element.prototype.addEventListener = add; }
      const writes = observer.takeRecords().length; observer.disconnect();
      old.dispatchEvent(new Event('click'));
      prepared.forEach((node) => node.dispatchEvent(new Event('click')));
      const result = { rejected: error !== null, oldIdentity: container.firstChild === old, writes, oldCalls, newCalls, prepared: prepared.length };
      container.replaceChildren(); lib.releaseDOMScope(scope); return result;
    }, failure);
    await testInfo.attach('failure-resource-result', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
    expect(result).toMatchObject({ rejected: true, oldIdentity: true, writes: 0, oldCalls: 1, newCalls: 0 });
    if (failure === 'invalid-plan') expect(result.prepared).toBe(0);
    else expect(result.prepared).toBeGreaterThan(1);
  });
}

for (const scenario of ['invalid-attribute', 'equivalent-plan', 'button-type'] as const) {
  test(`[PATCH] 실제 Chromium 반례: ${scenario}`, async ({ page, browser }, testInfo) => {
    await page.setContent('<div id="host"></div>'); await page.addScriptTag({ content: bundle });
    const result = await page.evaluate((scenario) => {
      const lib = (window as unknown as { StageThreeLibrary: Library }).StageThreeLibrary;
      const host = document.querySelector('#host')!;
      const scope = lib.createDOMScope(host);
      const element = (tag: string, children: object[] = [], extra: object = {}) => ({ kind: 'element' as const, tag, children, attrs: {}, domProps: {}, events: {}, ...extra });
      const text = (value: string) => ({ kind: 'text' as const, value });
      const root = (...children: object[]) => ({ kind: 'root', children }) as Parameters<Library['diff']>[0];
      let previous; let next;
      if (scenario === 'invalid-attribute') {
        previous = root(element('p', [text('old')]), element('p'));
        next = root(element('p', [text('new')]), element('p', [], { attrs: { 'data-\u0000': 'bad' } }));
      } else if (scenario === 'equivalent-plan') {
        previous = root(...['a', 'b', 'c'].map((key) => element('p', [], { key })));
        next = root(element('p', [], { key: 'c' }));
      } else {
        previous = root(element('button', [text('old')])); next = root(element('button', [text('new')]));
      }
      lib.mountTree(host, previous, scope);
      const observer = new MutationObserver(() => undefined);
      observer.observe(host, { subtree: true, childList: true, attributes: true, characterData: true });
      let error: string | null = null;
      try {
        const plan = lib.diff(previous, next);
        const candidate = scenario === 'equivalent-plan' ? { ...plan, children: { ...plan.children, remove: [...plan.children.remove].reverse() } } : plan;
        lib.applyPlan(host, candidate, scope);
      } catch (caught) { error = String(caught); }
      const records = observer.takeRecords(); observer.disconnect();
      const result = { error, text: host.firstElementChild!.textContent, writes: records.length,
        typeWrites: records.filter((record) => record.type === 'attributes' && record.attributeName === 'type').length,
        key: host.firstElementChild!.getAttribute('data-key'), count: host.childNodes.length };
      host.replaceChildren(); lib.releaseDOMScope(scope); return result;
    }, scenario);
    await testInfo.attach('counterexample-result', { body: JSON.stringify({ browser: browser.version(), scenario, ...result }, null, 2), contentType: 'application/json' });
    if (scenario === 'invalid-attribute') {
      expect(result.error).not.toBeNull();
      expect({ text: result.text, writes: result.writes }).toEqual({ text: 'old', writes: 0 });
    } else if (scenario === 'equivalent-plan') {
      expect({ error: result.error, count: result.count, key: result.key }).toEqual({ error: null, count: 1, key: 'c' });
    } else expect({ error: result.error, text: result.text, typeWrites: result.typeWrites }).toEqual({ error: null, text: 'new', typeWrites: 0 });
  });
}
