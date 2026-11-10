import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { fileURLToPath } from 'node:url';

type Library = typeof import('../support/stage-one-entry');
let bundle: string;

test.beforeAll(async () => {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      lib: {
        entry: fileURLToPath(new URL('../support/stage-one-entry.ts', import.meta.url)),
        formats: ['iife'], name: 'StageOneLibrary',
      },
    },
  });
  const outputs = Array.isArray(result) ? result : [result];
  if (outputs.length !== 1 || !('output' in outputs[0])) throw new Error('Expected a single browser bundle');
  const chunk = outputs[0].output.find((asset) => asset.type === 'chunk');
  if (!chunk || chunk.type !== 'chunk') throw new Error('Missing library bundle');
  bundle = chunk.code;
});

test('[VDOM-02, PATCH-01][임시 OPEN-01] 실제 Chromium에서 초기 렌더링한 두 scope의 label 클릭을 격리한다', async ({ page }) => {
  // Only native fixture hosts; all conversion and rendering comes from the real src/ bundle.
  await page.setContent('<div id="actual"></div><div id="preview"></div>');
  await page.addScriptTag({ content: bundle });
  const initial = await page.evaluate(() => {
    const library = (window as unknown as { StageOneLibrary: Library }).StageOneLibrary;
    const actual = document.querySelector('#actual')!;
    const preview = document.querySelector('#preview')!;
    const template = document.createElement('template');
    template.innerHTML = '<label for="agree">동의</label><input id="agree" type="checkbox" data-key="stable">';
    const tree = library.readDOM(template.content);
    const a = library.createDOMScope(actual);
    const b = library.createDOMScope(preview);
    library.mountTree(actual, tree, a);
    library.mountTree(preview, tree, b);
    (window as unknown as { stageOneFixture: { library: Library; a: object; b: object } }).stageOneFixture = { library, a, b };
    return {
      differentIds: actual.querySelector('input')!.id !== preview.querySelector('input')!.id,
      labelActual: actual.querySelector('label')!.control === actual.querySelector('input'),
      labelPreview: preview.querySelector('label')!.control === preview.querySelector('input'),
      sameLogicalTree: JSON.stringify(library.readDOM(actual, a)) === JSON.stringify(library.readDOM(preview, b)),
    };
  });
  expect(initial).toEqual({ differentIds: true, labelActual: true, labelPreview: true, sameLogicalTree: true });
  await page.locator('#preview label').click();
  await expect(page.locator('#preview input')).toBeChecked();
  await expect(page.locator('#actual input')).not.toBeChecked();
  const current = await page.evaluate(() => {
    const { library, a, b } = (window as unknown as { stageOneFixture: { library: Library; a: object; b: object } }).stageOneFixture;
    const actual = document.querySelector('#actual')!;
    const preview = document.querySelector('#preview')!;
    const result = { actual: library.readDOM(actual, a), preview: library.readDOM(preview, b) };
    actual.replaceChildren();
    preview.replaceChildren();
    library.releaseDOMScope(a);
    library.releaseDOMScope(b);
    return result;
  });
  expect(current.actual.children[1]).toMatchObject({ key: 'stable', attrs: { id: 'agree' }, domProps: { checked: false } });
  expect(current.preview.children[1]).toMatchObject({ key: 'stable', attrs: { id: 'agree' }, domProps: { checked: true } });
});
