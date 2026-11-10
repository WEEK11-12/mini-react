import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
type Library = typeof import('../support/stage-three-entry');
let bundle: string;
test.beforeAll(async () => {
  const result = await build({ configFile: false, logLevel: 'silent', build: { write: false, lib: {
    entry: fileURLToPath(new URL('../support/stage-three-entry.ts', import.meta.url)), formats: ['iife'], name: 'StageThreeLibrary',
  } } });
  const output = Array.isArray(result) ? result[0] : result;
  if (!('output' in output)) throw new Error('Missing product bundle');
  const chunk = output.output.find((asset) => asset.type === 'chunk');
  if (!chunk || chunk.type !== 'chunk') throw new Error('Missing chunk'); bundle = chunk.code;
  if (process.env.MINI_REACT_RE_REVIEW_DIR) await writeFile(join(process.env.MINI_REACT_RE_REVIEW_DIR, 'mini-react-stage-three-re-review-bundle.js'), bundle);
});
test.beforeEach(async ({ page }) => { await page.setContent('<div id="host"></div>'); await page.addScriptTag({ content: bundle }); });

test('[F1] Chromium createAttribute의 NUL 선제 거부와 ownerDocument 전체 next 검사', async ({ page, browser }, testInfo) => {
  const result = await page.evaluate(() => {
    const lib = (window as unknown as { StageThreeLibrary: Library }).StageThreeLibrary;
    const owner = document.implementation.createHTMLDocument('owner'); const host = owner.createElement('div'); owner.body.append(host);
    const scope = lib.createDOMScope(host);
    const el = (tag: string, children: object[] = [], extra: object = {}) => ({ kind: 'element' as const, tag, children, attrs: {}, domProps: {}, events: {}, ...extra });
    const txt = (value: string) => ({ kind: 'text', value });
    const root = (...children: object[]) => ({ kind: 'root', children }) as Parameters<Library['diff']>[0];
    let oldCalls = 0; let nextCalls = 0;
    const previous = root(el('button', [txt('old')], { events: { click: () => { oldCalls += 1; } } }), el('section', [el('p')]));
    lib.mountTree(host, previous, scope); const old = host.firstChild;
    const next = root(el('button', [txt('new')], { events: { click: () => { nextCalls += 1; } } }), el('span', [], { key: 'fresh' }), el('section', [el('p', [], { attrs: { 'data-\u0000': 'bad' } })]));
    let nativeError: string | null = null;
    try { owner.createAttribute('data-\u0000'); } catch (error) { nativeError = (error as DOMException).name; }
    const valid = owner.createAttribute('data-note');
    const names: string[] = []; let prepared = 0;
    const attribute = owner.createAttribute.bind(owner); const create = owner.createElement.bind(owner);
    owner.createAttribute = (name: string) => { names.push(name); return attribute(name); };
    owner.createElement = (tag: string, options?: ElementCreationOptions) => { prepared += 1; return create(tag, options); };
    const observer = new MutationObserver(() => undefined); observer.observe(host, { subtree: true, childList: true, attributes: true, characterData: true });
    let applyError: string | null = null;
    try { lib.applyPlan(host, lib.diff(previous, next), scope); } catch (error) { applyError = (error as DOMException).name; }
    const writes = observer.takeRecords().length; observer.disconnect();
    old!.dispatchEvent(new Event('click'));
    const result = { nativeError, applyError, names, prepared, writes, oldIdentity: host.firstChild === old, text: host.firstChild!.textContent,
      oldCalls, nextCalls, detachedAttr: valid.ownerElement === null, sameOwner: valid.ownerDocument === owner };
    owner.createAttribute = attribute; owner.createElement = create; host.replaceChildren(); lib.releaseDOMScope(scope); return result;
  });
  await testInfo.attach('f1-native-result', { body: JSON.stringify({ browser: browser.version(), ...result }, null, 2), contentType: 'application/json' });
  expect(result).toEqual({ nativeError: 'InvalidCharacterError', applyError: 'InvalidCharacterError', names: ['data-\u0000'], prepared: 0, writes: 0,
    oldIdentity: true, text: 'old', oldCalls: 1, nextCalls: 0, detachedAttr: true, sameOwner: true });
});

for (const scenario of ['reversed', 'duplicate', 'overlap', 'missing', 'extra'] as const) {
  test(`[F2] Chromium 중첩 remove ${scenario}: 순서·중복·전체 사전검증`, async ({ page }, testInfo) => {
    const result = await page.evaluate((scenario) => {
      const lib = (window as unknown as { StageThreeLibrary: Library }).StageThreeLibrary;
      const host = document.querySelector('#host')!; const scope = lib.createDOMScope(host);
      const el = (tag: string, children: object[] = [], extra: object = {}) => ({ kind: 'element' as const, tag, children, attrs: {}, domProps: {}, events: {}, ...extra });
      const txt = (value: string) => ({ kind: 'text', value });
      const root = (...children: object[]) => ({ kind: 'root', children }) as Parameters<Library['diff']>[0];
      const key = (key: string) => el('p', [txt(key)], { key });
      let oldCalls = 0; let newCalls = 0;
      const previous = root(el('button', [txt('old')], { events: { click: () => { oldCalls += 1; } } }), el('section', [el('article', ['a', 'b', 'c', 'd'].map(key), { key: 'inside' }), key('drop-a'), key('drop-b')], { key: 'parent' }), key('outer-a'), key('outer-b'));
      const next = root(el('button', [txt('new')], { events: { click: () => { newCalls += 1; } } }), el('section', [el('article', [key('c')], { key: 'inside' })], { key: 'parent' }));
      lib.mountTree(host, previous, scope);
      const button = host.firstChild!; const parent = host.querySelector('section'); const inside = host.querySelector('article'); const c = host.querySelector('[data-key=c]');
      type Children = ReturnType<Library['diff']>['children'];
      function change(children: Children): Children {
        const replacements = { reversed: [3, 1, 0], duplicate: [0, 0, 3], overlap: [0, 1, 2], missing: [0, 1], extra: [0, 1, 3, 99] };
        return { remove: children.remove.length === 3 ? replacements[scenario] : [...children.remove].reverse(),
          ordered: children.ordered.map((item) => item.op === 'reuse' && item.patch.op === 'element' ? { ...item, patch: { ...item.patch, children: change(item.patch.children) } } : item) };
      }
      const plan = lib.diff(previous, next); const candidate = { ...plan, children: change(plan.children) };
      function freeze(input: unknown): void { if (input && typeof input === 'object') { Object.values(input).forEach(freeze); Object.freeze(input); } }
      freeze(candidate);
      const observer = new MutationObserver(() => undefined); observer.observe(host, { subtree: true, attributes: true, childList: true, characterData: true });
      let error: string | null = null;
      try { lib.applyPlan(host, candidate, scope); } catch (caught) { error = String(caught); }
      const records = observer.takeRecords(); observer.disconnect(); button.dispatchEvent(new Event('click'));
      const result = { error, writes: records.length, text: button.textContent, oldCalls, newCalls, count: host.childNodes.length,
        identity: host.querySelector('section') === parent && host.querySelector('article') === inside && host.querySelector('[data-key=c]') === c,
        order: Array.from(host.querySelector('article')!.children, (node) => node.getAttribute('data-key')), rootRemove: candidate.children.remove };
      host.replaceChildren(); lib.releaseDOMScope(scope); return result;
    }, scenario);
    await testInfo.attach('nested-remove-result', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
    if (scenario === 'reversed') expect(result).toMatchObject({ error: null, text: 'new', oldCalls: 0, newCalls: 1, count: 2, identity: true, order: ['c'], rootRemove: [3, 2] });
    else expect(result).toMatchObject({ error: 'Error: Invalid PatchPlan', writes: 0, text: 'old', oldCalls: 1, newCalls: 0, count: 4, identity: true, order: ['a', 'b', 'c', 'd'] });
  });
}

for (const scenario of ['omitted', 'explicit-to-omitted', 'no-op', 'actual-type-drift'] as const) {
  test(`[F3] Chromium button ${scenario}: 부분쓰기와 기본 type 보정`, async ({ page }, testInfo) => {
    const result = await page.evaluate((scenario) => {
      const lib = (window as unknown as { StageThreeLibrary: Library }).StageThreeLibrary;
      const host = document.querySelector('#host')!; const scope = lib.createDOMScope(host);
      const tree = (value: string, explicit = false): Parameters<Library['diff']>[0] => ({ kind: 'root', children: [{ kind: 'element', tag: 'button', attrs: explicit ? { type: 'button' } : {}, domProps: {}, events: {}, children: [{ kind: 'text', value }] }] });
      const previous = tree('old', scenario === 'explicit-to-omitted'); const next = scenario === 'no-op' ? previous : tree('new');
      lib.mountTree(host, previous, scope); const button = host.querySelector('button')!;
      if (scenario === 'actual-type-drift') button.type = 'submit';
      const descriptor = Object.getOwnPropertyDescriptor(HTMLButtonElement.prototype, 'type')!; let setters = 0;
      Object.defineProperty(button, 'type', { ...descriptor, set(value: string) { setters += 1; descriptor.set!.call(this, value); } });
      const observer = new MutationObserver(() => undefined); observer.observe(host, { subtree: true, attributes: true, childList: true, characterData: true });
      lib.applyPlan(host, lib.diff(previous, next), scope);
      const records = observer.takeRecords(); observer.disconnect();
      const result = { type: button.type, text: button.textContent, identity: host.firstChild === button, setters,
        typeWrites: records.filter((record) => record.type === 'attributes' && record.attributeName === 'type').length, writes: records.length };
      host.replaceChildren(); lib.releaseDOMScope(scope); return result;
    }, scenario);
    await testInfo.attach('button-write-result', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
    expect(result).toEqual({ type: 'button', text: scenario === 'no-op' ? 'old' : 'new', identity: true,
      setters: scenario === 'actual-type-drift' ? 1 : 0, typeWrites: scenario === 'actual-type-drift' ? 1 : 0,
      writes: scenario === 'no-op' ? 0 : scenario === 'actual-type-drift' ? 2 : 1 });
  });
}
