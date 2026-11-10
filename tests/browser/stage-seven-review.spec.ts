import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import type * as Cases from '../support/stage-seven-review-cases';

type WindowState = { ReviewCases: typeof Cases; lifecycle: {
  root: InstanceType<typeof Cases.FunctionComponent>;
  events: string[];
  signals: string[];
  stale: (next: string) => void;
  refs: Element[];
} };
let bundle: string;
test.beforeAll(async () => {
  const result = await build({ configFile: false, logLevel: 'silent', build: { write: false, lib: {
    entry: fileURLToPath(new URL('../support/stage-seven-review-cases.ts', import.meta.url)), formats: ['iife'], name: 'ReviewCases',
  } } });
  const output = Array.isArray(result) ? result[0] : result;
  if (!('output' in output)) throw new Error('Product bundle missing');
  const chunk = output.output.find(asset => asset.type === 'chunk');
  if (!chunk || chunk.type !== 'chunk') throw new Error('Product chunk missing');
  bundle = chunk.code;
});
test.beforeEach(async ({ page }) => {
  await page.setContent('<main></main><button id="remove">remove root</button><button id="restart">restart root</button>');
  await page.addScriptTag({ content: bundle });
});
test.afterEach(async ({ browser }, info) => {
  await info.attach('browser-version', { body: browser.version(), contentType: 'text/plain' });
});
for (const trigger of ['mount', 'props', 'setter'] as const) {
  for (const failure of ['setup', 'cleanup'] as const) {
    if (trigger === 'mount' && failure === 'cleanup') continue;
    test(`[EFF-01 STA-03] accepted FIFO after ${trigger} ${failure} failure`, async ({ page }, info) => {
      const result = await page.evaluate(({ trigger, failure }) => (window as unknown as WindowState).ReviewCases.runErrorQueueCase(trigger, failure), { trigger, failure });
      await info.attach('observation', { body: JSON.stringify(result), contentType: 'application/json' });
      expect(result.errors).toContain(`owned-${failure}-failure`);
      expect(result.phase).toBe('idle');
      expect(result.text).toBe(`queued:${trigger === 'setter' ? 11 : 10}`);
    });
  }
}
test('[EFF-02] sparse deps must compare every index', async ({ page }, info) => {
  const result = await page.evaluate(() => (window as unknown as WindowState).ReviewCases.runSparseCase());
  await info.attach('observation', { body: JSON.stringify(result), contentType: 'application/json' });
  expect(result).toEqual({
    afterHole: { setups: [1, 'undefined'], cleanups: [1], text: 'undefined' },
    afterExplicitUndefined: { setups: [1, 'undefined'], cleanups: [1] },
    finalCleanups: [1, 'undefined'],
  });
});
for (const failure of ['partial', 'reconstruction', 'removal', 'initial'] as const) {
  test(`[EFF-04] native ${failure} failure terminates Effect ownership until explicit remount`, async ({ page }, info) => {
    const result = await page.evaluate(failure => (window as unknown as WindowState).ReviewCases.runRecoveryCase(failure), failure);
    await info.attach('observation', { body: JSON.stringify(result), contentType: 'application/json' });
    expect(result).toMatchObject({ injected: true, phase: 'faulted', ignored: 0, updateRejected: true, mountRejected: true, scopeRetained: true, removalDidNotDuplicate: true, freshLifetime: true });
    expect(result.errors).toContain(`native-${failure === 'reconstruction' ? 'partial' : failure}-failure`);
    if (failure === 'partial' || failure === 'reconstruction') {
      expect(result.cleanedOldNode).toBe(true);
      expect(result.events).toEqual(['setup:first:0', 'setup:second:0', 'cleanup:first:recovering', 'reentry-rejected:recovering', 'cleanup:second:recovering']);
      expect(result.errors).toContain('cleanup-owned-failure');
    }
    expect(result.effectCalls).toBe(failure === 'initial' ? 0 : 1);
    expect(result.vdomCalls).toBe(failure === 'initial' ? 0 : 1);
  });
}
test('[EFF-01 EFF-02 EFF-03 EFF-04 PATCH-03] native input, keyed move, subscription replacement, unmount and stale async callback after remount', async ({ page }, info) => {
  await page.evaluate(() => {
    const { FunctionComponent, h, useEffect, useState } = (window as unknown as WindowState).ReviewCases;
    const container = document.querySelector('main')!;
    const events: string[] = [];
    const signals: string[] = [];
    let stale!: (next: string) => void;
    const root = new FunctionComponent(() => {
      const [value, setter] = useState('first');
      const [reverse, setReverse] = useState(false);
      stale = setter;
      useEffect(() => {
        events.push(`setup:${value}:${container.querySelector('input')!.value}`);
        const listener = () => { signals.push(value); };
        window.addEventListener('review-signal', listener);
        try { root.unmount(); } catch { events.push('setup-removal-rejected'); }
        return () => {
          window.removeEventListener('review-signal', listener);
          events.push(`cleanup:${value}:${root.phase}`);
        };
      }, [value]);
      useEffect(() => {
        const node = container.querySelector('span')!;
        events.push(`once:${node.isConnected}`);
        return () => { events.push(`once-cleanup:${node === container.querySelector('span')}:${node.isConnected}`); };
      }, []);
      return h('section', null,
        h('input', { domProps: { value }, events: { input: (event: Event) => setter((event.target as HTMLInputElement).value) } }),
        h('button', { events: { click: () => setReverse(previous => !previous) } }, 'reverse'),
        h('span', null, 'stable'),
        h('ul', null, ...(reverse ? ['b', 'a'] : ['a', 'b']).map(key => h('li', { key }, key))),
      );
    });
    root.mount(container, {});
    const refs = [container.querySelector('input')!, container.querySelector('span')!, ...container.querySelectorAll('li')];
    const state = (window as unknown as WindowState);
    state.lifecycle = { root, events, signals, stale, refs };
    document.querySelector('#remove')!.addEventListener('click', () => root.unmount());
    document.querySelector('#restart')!.addEventListener('click', () => root.mount(container, {}));
    window.dispatchEvent(new Event('review-signal'));
  });
  await page.locator('main input').fill('second');
  await page.getByRole('button', { name: 'reverse', exact: true }).click();
  const beforeRemoval = await page.evaluate(() => {
    const { lifecycle: state } = window as unknown as WindowState;
    window.dispatchEvent(new Event('review-signal'));
    const container = document.querySelector('main')!;
    return { events: state.events.slice(), signals: state.signals.slice(), identity: [container.querySelector('input') === state.refs[0], container.querySelector('span') === state.refs[1], container.querySelectorAll('li')[0] === state.refs[3], container.querySelectorAll('li')[1] === state.refs[2]] };
  });
  expect(beforeRemoval).toEqual({ events: ['setup:first:first', 'setup-removal-rejected', 'once:true', 'cleanup:first:effects', 'setup:second:second', 'setup-removal-rejected'], signals: ['first', 'second'], identity: [true, true, true, true] });
  await page.getByRole('button', { name: 'remove root', exact: true }).click();
  await expect(page.locator('main')).toBeEmpty();
  await page.evaluate(() => { window.dispatchEvent(new Event('review-signal')); });
  await page.getByRole('button', { name: 'restart root', exact: true }).click();
  await page.evaluate(async () => {
    const { lifecycle: state } = window as unknown as WindowState;
    await new Promise<void>(resolve => setTimeout(() => { state.stale('stale'); resolve(); }, 0));
    window.dispatchEvent(new Event('review-signal'));
  });
  await expect(page.locator('main input')).toHaveValue('first');
  const final = await page.evaluate(() => {
    const state = (window as unknown as WindowState).lifecycle;
    return { signals: state.signals, events: state.events, phase: state.root.phase, fresh: document.querySelector('main input') !== state.refs[0] };
  });
  await info.attach('native-lifetime', { body: JSON.stringify({ beforeRemoval, final }), contentType: 'application/json' });
  expect(final.signals).toEqual(['first', 'second', 'first']);
  expect(final.events).toContain('cleanup:second:unmounting');
  expect(final.events).toContain('once-cleanup:true:true');
  expect(final.phase).toBe('idle');
  expect(final.fresh).toBe(true);
  await page.getByRole('button', { name: 'remove root', exact: true }).click();
});
