import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import { cases } from '../../support/final-runtime-failure-cases';
import type * as FailureCases from '../../support/final-runtime-failure-cases';

let bundle: string;
test.beforeAll(async () => {
  const result = await build({ configFile: false, logLevel: 'silent', build: { write: false, lib: {
    entry: fileURLToPath(new URL('../../support/final-runtime-failure-cases.ts', import.meta.url)),
    formats: ['iife'], name: 'RuntimeFailureVerification',
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
for (const [index, item] of cases.entries()) {
  test(item.name, async ({ page }) => {
    const result = await page.evaluate(index => (
      window as unknown as { RuntimeFailureVerification: typeof FailureCases }
    ).RuntimeFailureVerification.runCase(index), index);
    expect(result).toEqual({ ok: true });
  });
}
