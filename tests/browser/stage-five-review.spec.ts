import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { fileURLToPath } from 'node:url';
type Library = typeof import('../support/stage-five-entry');
let bundle: string;
test.beforeAll(async () => {
  const result = await build({ configFile: false, logLevel: 'silent', build: { write: false, lib: {
    entry: fileURLToPath(new URL('../support/stage-five-entry.ts', import.meta.url)), formats: ['iife'], name: 'StageFiveLibrary',
  } } });
  const output = Array.isArray(result) ? result[0] : result;
  if (!('output' in output)) throw new Error('Product bundle missing');
  const chunk = output.output.find(asset => asset.type === 'chunk');
  if (!chunk || chunk.type !== 'chunk') throw new Error('Product chunk missing');
  bundle = chunk.code;
});
test.beforeEach(async ({ page }) => {
  await page.setContent('<div id="host"></div><div id="other"></div>');
  await page.addScriptTag({ content: bundle });
});
test.afterEach(async ({ browser }, info) => { await info.attach('browser-version', { body: browser.version(), contentType: 'text/plain' }); });

test('[COMP-01 COMP-02 TECH-03 TECH-04 PATCH-03] native click calls Props update through a child and retains DOM identity', async ({ page }) => {
  await page.evaluate(() => {
    const { h, FunctionComponent } = (window as unknown as { StageFiveLibrary: Library }).StageFiveLibrary;
    const host = document.querySelector('#host')!;
    const ChildComponent = (props: Parameters<typeof h>[1]): ReturnType<typeof h> => h('button', { events: { click: props!.onClick } }, String(props!.label));
    const root = new FunctionComponent(({ label }: { label: string }) => h('section', null, h(ChildComponent, { label, onClick: () => root.update({ label: 'updated' }) }), h('span', null, 'stable')));
    root.mount(host, { label: 'initial' });
    const state = window as unknown as { reviewRoot: typeof root; reviewRefs: Node[] };
    state.reviewRoot = root; state.reviewRefs = [host.firstChild!, host.querySelector('button')!, host.querySelector('button')!.firstChild!, host.querySelector('span')!];
  });
  await page.getByRole('button', { name: 'initial' }).click();
  await expect(page.getByRole('button')).toHaveText('updated');
  const result = await page.evaluate(() => {
    const host = document.querySelector('#host')!; const state = window as unknown as { reviewRoot: InstanceType<Library['FunctionComponent']>; reviewRefs: Node[] };
    const after = [host.firstChild!, host.querySelector('button')!, host.querySelector('button')!.firstChild!, host.querySelector('span')!];
    const result = { count: after.length, identity: after.map((node, index) => node === state.reviewRefs[index]), hooks: state.reviewRoot.hooks.length, phase: state.reviewRoot.phase };
    state.reviewRoot.unmount(); return result;
  });
  expect(result).toEqual({ count: 4, identity: [true, true, true, true], hooks: 0, phase: 'idle' });
});

test('[COMP-02 PATCH-03] keyed child reorder and deletion keep all survivors and detach removed listeners', async ({ page }) => {
  const result = await page.evaluate(() => {
    const { h, FunctionComponent } = (window as unknown as { StageFiveLibrary: Library }).StageFiveLibrary;
    const host = document.querySelector('#host')!; const seen: string[] = []; const reserved: boolean[] = [];
    const ChildComponent = (props: NonNullable<Parameters<typeof h>[1]>): ReturnType<typeof h> => { reserved.push(Object.hasOwn(props, 'key')); return h('button', { events: { click: props.onClick } }, String(props.label)); };
    const root = new FunctionComponent(({ order, suffix }: { order: string[]; suffix: string }) => order.map(key => h(ChildComponent, { key, label: key + suffix, onClick: () => seen.push(key + suffix) })));
    root.mount(host, { order: ['a', 'b', 'c'], suffix: '0' }); const refs = Array.from(host.children);
    refs[0].dispatchEvent(new Event('click')); root.update({ order: ['c', 'n', 'a'], suffix: '1' });
    refs.forEach(node => node.dispatchEvent(new Event('click')));
    const result = { order: Array.from(host.children, node => node.textContent), count: host.children.length, identity: [host.children[0] === refs[2], host.children[2] === refs[0]], seen, reserved };
    root.unmount(); return result;
  });
  expect(result).toEqual({ order: ['c1', 'n1', 'a1'], count: 3, identity: [true, true], seen: ['a0', 'a1', 'c1'], reserved: [false, false, false, false, false, false] });
});

test('[COMP-01 COMP-02] multiple roots, validation rollback, no-op writes and rendering-time misuse guards', async ({ page }) => {
  const result = await page.evaluate(() => {
    const { h, FunctionComponent } = (window as unknown as { StageFiveLibrary: Library }).StageFiveLibrary;
    const host = document.querySelector('#host')!;
    const root = new FunctionComponent(({ bad }: { bad: boolean }): ReturnType<typeof h> => bad ? h('p', { key: '' }, 'bad') : [null, h('p', null, 'a'), [' ', 0], false]);
    root.mount(host, { bad: false }); const refs = Array.from(host.childNodes);
    const observer = new MutationObserver(() => undefined); observer.observe(host, { childList: true, subtree: true, attributes: true, characterData: true });
    let rejected = false; try { root.update({ bad: true }); } catch { rejected = true; }
    root.update(); const writes = observer.takeRecords().length; observer.disconnect();
    const result = { rejected, writes, text: host.textContent, count: host.childNodes.length, identity: Array.from(host.childNodes, (node, index) => node === refs[index]), phase: root.phase };
    root.unmount(); return result;
  });
  expect(result).toEqual({ rejected: true, writes: 0, text: 'a 0', count: 3, identity: [true, true, true], phase: 'idle' });
});

test('[COMP-01] native label targets stay within the owning component scope and remount gets a fresh scope', async ({ page }) => {
  await page.evaluate(() => {
    const { h, FunctionComponent } = (window as unknown as { StageFiveLibrary: Library }).StageFiveLibrary;
    const view = (): ReturnType<typeof h> => [h('label', { attrs: { for: 'field' } }, 'toggle'), h('input', { attrs: { id: 'field', type: 'checkbox' } })];
    const a = new FunctionComponent(view); const b = new FunctionComponent(view);
    a.mount(document.querySelector('#host')!, {}); b.mount(document.querySelector('#other')!, {});
    (window as unknown as { roots: [typeof a, typeof b] }).roots = [a, b];
  });
  await page.locator('#host label').click();
  await expect(page.locator('#host input')).toBeChecked(); await expect(page.locator('#other input')).not.toBeChecked();
  const result = await page.evaluate(() => {
    const host = document.querySelector('#host')!; const other = document.querySelector('#other')!;
    const roots = (window as unknown as { roots: [InstanceType<Library['FunctionComponent']>, InstanceType<Library['FunctionComponent']>] }).roots;
    const oldId = host.querySelector('input')!.id; const otherInput = other.querySelector('input')!;
    roots[0].unmount(); roots[0].mount(host, {});
    const result = { fresh: host.querySelector('input')!.id !== oldId, otherIdentity: other.querySelector('input') === otherInput, different: host.querySelector('input')!.id !== otherInput.id, controls: [host.querySelector('label')!.control === host.querySelector('input'), other.querySelector('label')!.control === otherInput] };
    roots.forEach(root => root.unmount()); return result;
  });
  expect(result).toEqual({ fresh: true, otherIdentity: true, different: true, controls: [true, true] });
});

test('[PATCH-02] partial write restores inert display with original scope, disables old/prepared listeners and requires explicit remount', async ({ page }, info) => {
  const result = await page.evaluate(() => {
    const { h, FunctionComponent } = (window as unknown as { StageFiveLibrary: Library }).StageFiveLibrary;
    const host = document.querySelector('#host')!; let clicks = 0; const prepared: Element[] = [];
    const root = new FunctionComponent(({ value }: { value: string }) => [h('button', { attrs: { id: 'logical', title: value }, events: { click: () => { clicks += 1; } } }, value), ...(value === 'old' ? [] : [h('p', { events: { click: () => { clicks += 1; } } }, 'prepared')])]);
    root.mount(host, { value: 'old' }); const previous = host.querySelector('button')!; const id = previous.id;
    previous.dispatchEvent(new Event('click'));
    const native = Element.prototype.setAttribute; const create = document.createElement.bind(document); let partial = false; let rejectedDuringCommit = false; let caught: string | null = null;
    document.createElement = ((tag: string, options?: ElementCreationOptions) => { const node = create(tag, options); if (tag === 'p') prepared.push(node); return node; }) as typeof document.createElement;
    Element.prototype.setAttribute = function (name, value) { native.call(this, name, value); if (this === previous && name === 'title' && value === 'new') { partial = true; try { root.unmount(); } catch { rejectedDuringCommit = true; } throw new Error('apply failure'); } };
    try { root.update({ value: 'new' }); } catch (error) { caught = String(error); } finally { Element.prototype.setAttribute = native; document.createElement = create; }
    [previous, host.querySelector('button')!, ...prepared].forEach(node => node.dispatchEvent(new Event('click')));
    let updateRejected = false; let mountRejected = false;
    try { root.update(); } catch { updateRejected = true; } try { root.mount(host, { value: 'new' }); } catch { mountRejected = true; }
    const result = { caught, partial, rejectedDuringCommit, phase: root.phase, text: host.textContent, clicks, preparedCount: prepared.length, sameId: host.querySelector('button')!.id === id, updateRejected, mountRejected, remounted: false };
    root.unmount(); root.mount(host, { value: 'old' }); host.querySelector('button')!.dispatchEvent(new Event('click')); result.remounted = root.phase === 'idle' && clicks === 2;
    root.unmount(); return result;
  });
  await info.attach('partial-write-result', { body: JSON.stringify(result), contentType: 'application/json' });
  expect(result).toEqual({ caught: 'Error: apply failure', partial: true, rejectedDuringCommit: true, phase: 'faulted', text: 'old', clicks: 1, preparedCount: 1, sameId: true, updateRejected: true, mountRejected: true, remounted: true });
});

test('[PATCH-01] initial native connection failure clears connected nodes/listeners and permits unmount then remount', async ({ page }) => {
  const result = await page.evaluate(() => {
    const { h, FunctionComponent, createDOMScope, releaseDOMScope } = (window as unknown as { StageFiveLibrary: Library }).StageFiveLibrary;
    const host = document.querySelector('#host')!; let clicks = 0; let connected: Node | null = null;
    const root = new FunctionComponent(() => h('button', { events: { click: () => { clicks += 1; } } }, 'mount'));
    const append = host.appendChild.bind(host); host.appendChild = <T extends Node>(child: T): T => { append(child); connected = host.firstChild; throw new Error('after append'); };
    let caught: string | null = null; try { root.mount(host, {}); } catch (error) { caught = String(error); } finally { host.appendChild = append; }
    const result = { caught, connected: connected !== null, phase: root.phase, count: host.childNodes.length, clicks: 0, scopeRetained: false, remounted: false };
    (connected as unknown as Node).dispatchEvent(new Event('click')); result.clicks = clicks;
    try { const scope = createDOMScope(host); releaseDOMScope(scope); } catch { result.scopeRetained = true; }
    root.unmount(); root.mount(host, {}); result.remounted = root.phase === 'idle'; root.unmount(); return result;
  });
  expect(result).toEqual({ caught: 'Error: after append', connected: true, phase: 'faulted', count: 0, clicks: 0, scopeRetained: true, remounted: true });
});

test('[F1 TECH-03] unmount DOM removal failure must stop native callbacks in faulted state', async ({ page }, info) => {
  const result = await page.evaluate(() => {
    const { h, FunctionComponent, createDOMScope, releaseDOMScope } = (window as unknown as { StageFiveLibrary: Library }).StageFiveLibrary;
    const host = document.querySelector('#host')!; let clicks = 0;
    const root = new FunctionComponent(() => h('button', { events: { click: () => { clicks += 1; } } }, 'alive'));
    root.mount(host, {}); const old = host.firstChild!; old.dispatchEvent(new Event('click')); const baseline = clicks;
    const native = host.replaceChildren.bind(host); host.replaceChildren = () => { throw new Error('remove failed'); };
    let error: string | null = null; try { root.unmount(); } catch (caught) { error = String(caught); } finally { host.replaceChildren = native; }
    old.dispatchEvent(new Event('click'));
    const result = { error, phase: root.phase, baseline, clicksAfterFailure: clicks, connected: host.firstChild === old, owned: false, removalRetry: false, freshMount: false };
    try { const scope = createDOMScope(host); releaseDOMScope(scope); } catch { result.owned = true; }
    root.unmount(); result.removalRetry = root.phase === 'unmounted'; root.mount(host, {}); result.freshMount = root.phase === 'idle'; root.unmount(); return result;
  });
  await info.attach('F1-removal-failure', { body: JSON.stringify(result), contentType: 'application/json' });
  expect(result).toMatchObject({ error: 'Error: remove failed', phase: 'faulted', baseline: 1, connected: true, owned: true, removalRetry: true, freshMount: true });
  expect(result.clicksAfterFailure, 'faulted must not run old handlers').toBe(1);
});

test('[F2 PATCH-02] application and reconstruction errors are both observable rather than losing the original cause', async ({ page }, info) => {
  const result = await page.evaluate(() => {
    const { h, FunctionComponent } = (window as unknown as { StageFiveLibrary: Library }).StageFiveLibrary;
    const host = document.querySelector('#host')!;
    const root = new FunctionComponent(({ value }: { value: string }) => h('button', { attrs: { title: value } }, value));
    root.mount(host, { value: 'old' }); const previous = host.firstChild!; const native = Element.prototype.setAttribute;
    const applyError = new Error('apply failed'); const recoveryError = new Error('reconstruction failed'); let partial = false; let recovery = false; let caught: unknown;
    Element.prototype.setAttribute = function (name, value) { native.call(this, name, value); if (this === previous && name === 'title' && value === 'new') { partial = true; throw applyError; } if (partial && this !== previous && name === 'title' && value === 'old') { recovery = true; throw recoveryError; } };
    try { root.update({ value: 'new' }); } catch (error) { caught = error; } finally { Element.prototype.setAttribute = native; }
    function errors(error: unknown): unknown[] { if (!error || typeof error !== 'object') return [error]; return [error, ...(error instanceof AggregateError ? Array.from(error.errors).flatMap(errors) : []), ...('cause' in error ? errors(error.cause) : [])]; }
    const chain = errors(caught); const result = { partial, recovery, phase: root.phase, received: String(caught), applicationReported: chain.includes(applyError), recoveryReported: chain.includes(recoveryError), removable: false };
    root.unmount(); result.removable = root.phase === 'unmounted'; return result;
  });
  await info.attach('F2-error-provenance', { body: JSON.stringify(result), contentType: 'application/json' });
  expect(result).toMatchObject({ partial: true, recovery: true, phase: 'faulted', removable: true, recoveryReported: true });
  expect(result.applicationReported, 'preserve original apply failure alongside failed display reconstruction').toBe(true);
});
