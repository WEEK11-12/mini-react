import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import type * as Cases from '../support/stage-seven-rereview-cases';
let bundle: string;
test.beforeAll(async () => {
  const result = await build({ configFile: false, logLevel: 'silent', build: { write: false, lib: {
    entry: fileURLToPath(new URL('../support/stage-seven-rereview-cases.ts', import.meta.url)), formats: ['iife'], name: 'RereviewCases',
  } } });
  const output = Array.isArray(result) ? result[0] : result;
  if (!('output' in output)) throw new Error('Product bundle missing');
  const chunk = output.output.find(asset => asset.type === 'chunk');
  if (!chunk || chunk.type !== 'chunk') throw new Error('Product chunk missing');
  bundle = chunk.code;
});
test.beforeEach(async ({ page }) => {
  await page.setContent('<main></main>');
  await page.addScriptTag({ content: bundle });
});
test.afterEach(async ({ browser }, info) => {
  await info.attach('browser-version', { body: browser.version(), contentType: 'text/plain' });
});
for (const trigger of ['props', 'setter'] as const) {
  for (const request of ['state', 'props'] as const) {
    test(`[F1 adjacent] ${trigger}/${request}: Effect errors do not permit update 51`, async ({ page }, info) => {
      const result = await page.evaluate(({ trigger, request }) => (window as unknown as { RereviewCases: typeof Cases }).RereviewCases.runErrorBudget(trigger, request, 51), { trigger, request });
      await info.attach('observation', { body: JSON.stringify(result), contentType: 'application/json' });
      expect(result).toEqual({ text: '50', phase: 'idle', updates: 50, effectFailures: 50, limited: true, retryText: '99' });
    });
  }
}
for (const failure of ['updater', 'render', 'patch'] as const) {
  test(`[F1 adjacent] ${failure}: fatal failures remain fatal after collected Effect errors`, async ({ page }, info) => {
    const result = await page.evaluate(failure => (window as unknown as { RereviewCases: typeof Cases }).RereviewCases.runFatalAfterEffect(failure), failure);
    await info.attach('observation', { body: JSON.stringify(result), contentType: 'application/json' });
    expect(result).toMatchObject({ phase: failure === 'patch' ? 'faulted' : 'idle', text: '1', state: 1, tailCalls: 0, setups: [0, 1], cleaned: [0], retryText: '5' });
    expect(result.errors).toContain('effect:original');
    expect(result.errors).toContain(`fatal:${failure}`);
  });
}
for (const kind of ['holes', 'snapshot', 'object-is', 'shape-rollback'] as const) {
  test(`[F2 adjacent] ${kind}: dependency loop direct boundary`, async ({ page }, info) => {
    const result = await page.evaluate(kind => (window as unknown as { RereviewCases: typeof Cases }).RereviewCases.runDepsBoundary(kind), kind);
    await info.attach('observation', { body: JSON.stringify(result), contentType: 'application/json' });
    const expected = {
      holes: { setups: ['undefined|undefined', 'undefined|x', 'undefined|undefined'], cleanups: ['undefined|undefined', 'undefined|x'], text: 'undefined|undefined', rejected: false, finalCleanups: ['undefined|undefined', 'undefined|x', 'undefined|undefined'] },
      snapshot: { setups: ['1|2', 'undefined|2', 'undefined|3'], cleanups: ['1|2', 'undefined|2'], text: 'undefined|3', rejected: false, finalCleanups: ['1|2', 'undefined|2', 'undefined|3'] },
      'object-is': { setups: ['NaN|0|[object Object]', 'NaN|-0|[object Object]', 'NaN|-0|[object Object]'], cleanups: ['NaN|0|[object Object]', 'NaN|-0|[object Object]'], text: 'NaN|-0|[object Object]', rejected: false, finalCleanups: ['NaN|0|[object Object]', 'NaN|-0|[object Object]', 'NaN|-0|[object Object]'] },
      'shape-rollback': { setups: ['1|2', '1|3'], cleanups: ['1|2'], text: '1|3', rejected: true, finalCleanups: ['1|2', '1|3'] },
    };
    expect(result).toEqual(expected[kind]);
  });
}
