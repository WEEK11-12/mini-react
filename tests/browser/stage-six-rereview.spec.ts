import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import type * as original from '../support/stage-six-review-cases';
import type * as adjacent from '../support/stage-six-rereview-cases';

let originalBundle: string;
let adjacentBundle: string;
async function bundle(entry: string, name: string): Promise<string> {
  const result = await build({ configFile: false, logLevel: 'silent', build: { write: false, lib: {
    entry: fileURLToPath(new URL(entry, import.meta.url)), formats: ['iife'], name,
  } } });
  const output = Array.isArray(result) ? result[0] : result;
  if (!('output' in output)) throw new Error('Product bundle missing');
  const chunk = output.output.find(asset => asset.type === 'chunk');
  if (!chunk || chunk.type !== 'chunk') throw new Error('Product chunk missing');
  return chunk.code;
}
test.beforeAll(async () => {
  originalBundle = await bundle('../support/stage-six-review-cases.ts', 'OriginalCases');
  adjacentBundle = await bundle('../support/stage-six-rereview-cases.ts', 'AdjacentCases');
});

for (const kind of ['state', 'props'] as const) {
  for (const limit of [50, 51, Number.POSITIVE_INFINITY]) {
    test(`rereview F1 original boundary: ${kind} ${limit}`, async ({ page, browser }, info) => {
      await page.setContent('<main></main>');
      await page.addScriptTag({ content: originalBundle });
      const observed = await page.evaluate(({ kind, limit }) => (window as unknown as { OriginalCases: typeof original }).OriginalCases.runLimitCase(kind, limit), { kind, limit });
      await info.attach('observation', { body: JSON.stringify({ browser: browser.version(), observed }), contentType: 'application/json' });
      expect(observed).toEqual({ kind, limit, commits: 50, caught: limit === 50 ? null : 'Too many consecutive updates', text: '50', phase: 'idle', updateRenders: 50, state: kind === 'state' ? 50 : 0, retryText: '99' });
    });
  }
  for (const limit of [50, 51]) {
    test(`rereview F1 adjacent mount budget: ${kind} ${limit}`, async ({ page, browser }, info) => {
      await page.setContent('<main></main>');
      await page.addScriptTag({ content: adjacentBundle });
      const observed = await page.evaluate(({ kind, limit }) => (window as unknown as { AdjacentCases: typeof adjacent }).AdjacentCases.runMountBudgetCase(kind, limit), { kind, limit });
      await info.attach('observation', { body: JSON.stringify({ browser: browser.version(), observed }), contentType: 'application/json' });
      expect(observed).toEqual({ kind, limit, initialPhase: 'committing', caught: limit === 50 ? null : 'Too many consecutive updates', phase: 'idle', text: '50', updateRenders: 50, updateCommits: 50, state: kind === 'state' ? 50 : 0, retryText: '99' });
    });
  }
}
test('rereview F1 adjacent FIFO and omitted Props still resolve after successful commit', async ({ page, browser }, info) => {
  await page.setContent('<main></main>');
  await page.addScriptTag({ content: originalBundle });
  const observed = await page.evaluate(() => (window as unknown as { OriginalCases: typeof original }).OriginalCases.runQueueCase());
  await info.attach('observation', { body: JSON.stringify({ browser: browser.version(), observed }), contentType: 'application/json' });
  expect(observed).toEqual({ renders: ['A:0', 'B:0', 'B:1', 'C:1', 'C:3', 'C:3'], during: ['committing', 0, 'A:0', 2], updaterInputs: [0, 1], text: 'C:3', state: 3, phase: 'idle', sameDOM: true });
});
