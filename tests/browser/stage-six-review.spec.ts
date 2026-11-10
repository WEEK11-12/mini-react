import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import * as cases from '../support/stage-six-review-cases';

let bundle: string;
test.beforeAll(async () => {
  const result = await build({ configFile: false, logLevel: 'silent', build: { write: false, lib: {
    entry: fileURLToPath(new URL('../support/stage-six-review-cases.ts', import.meta.url)), formats: ['iife'], name: 'StageSixReview',
  } } });
  const output = Array.isArray(result) ? result[0] : result;
  if (!('output' in output)) throw new Error('Product bundle missing');
  const chunk = output.output.find(asset => asset.type === 'chunk');
  if (!chunk || chunk.type !== 'chunk') throw new Error('Product chunk missing');
  bundle = chunk.code;
});

const expectations: [keyof typeof cases, Record<string, unknown>][] = [
  ['runLifetimeCase', { failed: true, failureState: 3, stable: true, sameDOM: true, initializes: 2, staleUpdaterCalls: 0, freshSetter: true, text: '3' }],
  ['runChildCase', { rejected: true, outsideRejected: true, slots: 3, text: '34' }],
  ['runQueueCase', { renders: ['A:0', 'B:0', 'B:1', 'C:1', 'C:3', 'C:3'], during: ['committing', 0, 'A:0', 2], updaterInputs: [0, 1], text: 'C:3', state: 3, phase: 'idle', sameDOM: true }],
  ['runMountQueueCase', { phaseDuringAppend: 'committing', renders: [0, 2, 6], text: '6', state: 6 }],
  ['runFaultCase', { failed: true, phase: 'faulted', text: '0', state: 0, ignoredCalls: 0, clicks: 0, updateRejected: true, recoveryPhases: ['recovering', 'unmounting'], freshSetter: true, freshText: '0' }],
];
for (const [name, expected] of expectations) {
  test(`stage 06 browser boundary: ${name}`, async ({ page, browser }, info) => {
    await page.setContent('<main></main>');
    await page.addScriptTag({ content: bundle });
    const observed = await page.evaluate(name => {
      const review = (window as unknown as { StageSixReview: typeof cases }).StageSixReview;
      return (review[name] as () => Record<string, unknown>)();
    }, name);
    await info.attach('observation', { body: JSON.stringify({ browser: browser.version(), observed }), contentType: 'application/json' });
    expect(observed).toEqual(expected);
  });
}
for (const kind of ['state', 'props'] as const) {
  for (const limit of [50, 51]) {
    test(`stage 06 browser limit: ${kind} ${limit}`, async ({ page, browser }, info) => {
      await page.setContent('<main></main>');
      await page.addScriptTag({ content: bundle });
      const observed = await page.evaluate(({ kind, limit }) => (window as unknown as { StageSixReview: typeof cases }).StageSixReview.runLimitCase(kind, limit), { kind, limit });
      await info.attach('observation', { body: JSON.stringify({ browser: browser.version(), observed }), contentType: 'application/json' });
      expect.soft(observed.caught).toBe(limit === 50 ? null : 'Too many consecutive updates');
      expect.soft(observed.updateRenders).toBe(50);
      expect.soft(observed.text).toBe('50');
      expect.soft(observed.retryText).toBe('99');
    });
  }
}

test('[STA-01 STA-02 STA-03 COMP-03 TECH-05 TECH-06] native click and input synchronously patch real product and preserve siblings', async ({ page, browser }, info) => {
  const result = await build({ configFile: false, logLevel: 'silent', build: { write: false, lib: {
    entry: fileURLToPath(new URL('../support/stage-six-review-entry.ts', import.meta.url)), formats: ['iife'], name: 'StageSixProduct',
  } } });
  const output = Array.isArray(result) ? result[0] : result;
  if (!('output' in output)) throw new Error('Product bundle missing');
  const chunk = output.output.find(asset => asset.type === 'chunk');
  if (!chunk || chunk.type !== 'chunk') throw new Error('Product chunk missing');
  await page.setContent('<main></main>');
  await page.addScriptTag({ content: chunk.code });
  await page.evaluate(() => {
    const { FunctionComponent, h, useState } = (window as unknown as { StageSixProduct: typeof import('../support/stage-six-review-entry') }).StageSixProduct;
    const root = new FunctionComponent(() => {
      const [count, setCount] = useState(0);
      const [label, setLabel] = useState('a');
      return [h('button', { events: { click: () => setCount(previous => previous + 1) } }, count), h('input', { domProps: { value: label }, events: { input: (event: Event) => setLabel((event.target as HTMLInputElement).value) } }), h('span', null, label), h('p', null, 'stable')];
    });
    root.mount(document.querySelector('main')!, {});
    Object.assign(window, { reviewRoot: root, reviewRefs: Array.from(document.querySelector('main')!.children) });
  });
  await page.getByRole('button').click();
  await expect(page.getByRole('button')).toHaveText('1');
  await page.getByRole('textbox').fill('updated');
  await expect(page.locator('span')).toHaveText('updated');
  const observed = await page.evaluate(() => {
    const state = window as unknown as { reviewRoot: { hooks: { value: unknown }[]; phase: string }; reviewRefs: Element[] };
    return { state: state.reviewRoot.hooks.map(slot => slot.value), phase: state.reviewRoot.phase, sameDOM: Array.from(document.querySelector('main')!.children).every((node, index) => node === state.reviewRefs[index]) };
  });
  await info.attach('observation', { body: JSON.stringify({ browser: browser.version(), observed }), contentType: 'application/json' });
  expect(observed).toEqual({ state: [1, 'updated'], phase: 'idle', sameDOM: true });
});
