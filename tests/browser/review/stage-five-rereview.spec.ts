import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import type { CaseName, runCase } from '../../support/stage-five-rereview-cases';
let bundle: string;
test.beforeAll(async () => {
  const result = await build({ configFile: false, logLevel: 'silent', build: { write: false, lib: {
    entry: fileURLToPath(new URL('../../support/stage-five-rereview-cases.ts', import.meta.url)), formats: ['iife'], name: 'RereviewCases',
  } } });
  const output = Array.isArray(result) ? result[0] : result;
  if (!('output' in output)) throw new Error('Product bundle missing');
  const chunk = output.output.find(asset => asset.type === 'chunk');
  if (!chunk || chunk.type !== 'chunk') throw new Error('Product chunk missing');
  bundle = chunk.code;
});
const cases: [CaseName, Record<string, unknown>][] = [
  ['release-before-removal', { baseline: 4, callsDuringRemoval: 4, callsAfterRemoval: 4, phaseDuringRemoval: 'unmounting', phase: 'unmounted', count: 0, removals: ['change', 'click', 'click', 'input'], scopeReleased: true }],
  ['removal-after-write', { attempts: 1, caughtOriginal: true, failurePhase: 'faulted', retained: true, connectedCount: 0, calls: 1, removals: 1, updateRejected: true, mountRejected: true, released: true, freshId: true, restartedCalls: 2 }],
  ['repeated-removal-failure', { attempts: 2, caughtOriginal: true, failurePhase: 'faulted', retained: true, connectedCount: 1, calls: 1, removals: 1, updateRejected: true, mountRejected: true, released: true, freshId: true, restartedCalls: 2 }],
  ['successful-recovery-error', { applied: true, applicationPreserved: true, failurePhase: 'faulted', retained: true, callsAtFailure: 1, text: 'old', released: true, restarted: true }],
  ['update-clear-failure', { applied: true, recoveryAttempted: true, applicationPreserved: true, recoveryPreserved: true, failurePhase: 'faulted', retained: true, callsAtFailure: 1, text: 'old', released: true, restarted: true }],
  ['mount-clear-failure', { applied: true, recoveryAttempted: true, applicationPreserved: true, recoveryPreserved: true, failurePhase: 'faulted', retained: true, callsAtFailure: 0, text: 'new', released: true, restarted: true }],
];
for (const [name, expected] of cases) {
  test(`[rereview] F1/F2 direct adjacent boundary: ${name}`, async ({ page, browser }, info) => {
    await page.setContent('<main></main>'); await page.addScriptTag({ content: bundle });
    const result = await page.evaluate(name => (window as unknown as { RereviewCases: { runCase: typeof runCase } }).RereviewCases.runCase(name), name);
    await info.attach('rereview-observation', { body: JSON.stringify({ name, browser: browser.version(), result }), contentType: 'application/json' });
    expect(result).toEqual(expected);
  });
}
