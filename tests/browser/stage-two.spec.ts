import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type Library = typeof import('../support/stage-two-entry');
let bundle: string;

test.beforeAll(async () => {
  const result = await build({
    configFile: false, logLevel: 'silent',
    build: { write: false, lib: {
      entry: fileURLToPath(new URL('../support/stage-two-entry.ts', import.meta.url)),
      formats: ['iife'], name: 'StageTwoLibrary',
    } },
  });
  const outputs = Array.isArray(result) ? result : [result];
  if (outputs.length !== 1 || !('output' in outputs[0])) throw new Error('Expected a single browser bundle');
  const chunk = outputs[0].output.find((asset) => asset.type === 'chunk');
  if (!chunk || chunk.type !== 'chunk') throw new Error('Missing real source browser bundle');
  bundle = chunk.code;
  const artifactDir = process.env.MINI_REACT_REVIEW_ARTIFACT_DIR;
  if (artifactDir) await writeFile(join(artifactDir, 'mini-react-stage-two-browser-bundle.js'), bundle);
});

test('[DIFF-01][DIFF-02][DIFF-03] 실제 Chromium의 폼 입력과 template 재정렬을 실제 src Diff로 비교하고 DOM을 건드리지 않는다', async ({ page }, testInfo) => {
  await page.setContent('<div id="actual"></div><div id="preview"></div>');
  await page.addScriptTag({ content: bundle });
  await page.evaluate(() => {
    const library = (window as unknown as { StageTwoLibrary: Library }).StageTwoLibrary;
    const actual = document.querySelector('#actual')!;
    const preview = document.querySelector('#preview')!;
    const template = document.createElement('template');
    template.innerHTML = '<section data-key="parent"><p data-key="a">A</p> <input data-key="field" type="text" value="old"><p data-key="b">B</p></section>';
    const previous = library.readDOM(template.content);
    const a = library.createDOMScope(actual);
    const b = library.createDOMScope(preview);
    library.mountTree(actual, previous, a);
    library.mountTree(preview, previous, b);
    (window as unknown as { stageTwoFixture: object }).stageTwoFixture = { previous, a, b };
  });
  await page.locator('#preview input').fill('native edit');
  const result = await page.evaluate(() => {
    const library = (window as unknown as { StageTwoLibrary: Library }).StageTwoLibrary;
    const { previous, a, b } = (window as unknown as { stageTwoFixture: {
      previous: Parameters<Library['diff']>[0]; a: object; b: object;
    } }).stageTwoFixture;
    const actual = document.querySelector('#actual')!;
    const preview = document.querySelector('#preview')!;
    const current = library.readDOM(preview, b);
    const template = document.createElement('template');
    template.innerHTML = '<section data-key="parent"><p data-key="b">B</p> <input data-key="field" type="text" value="native edit"><p data-key="a">changed</p></section>';
    const next = library.readDOM(template.content);
    const before = document.body.innerHTML;
    const nodes = [...actual.querySelectorAll('*'), ...preview.querySelectorAll('*')];
    const observer = new MutationObserver(() => undefined);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    const noChange = library.diff(previous, library.readDOM(actual, a));
    const form = library.diff(previous, current);
    const reorder = library.diff(previous, next);
    const placement = reorder.children.ordered[0];
    if (placement.op !== 'reuse' || placement.patch.op !== 'element') throw new Error('Missing nested plan');
    const nested = placement.patch.children;
    const result = {
      noChange: noChange.hasChanges,
      formChange: form.hasChanges,
      reorderChange: reorder.hasChanges,
      oldIndices: nested.ordered.map((item) => item.op === 'create' ? null : item.oldIndex),
      operations: nested.ordered.map((item) => item.op === 'reuse' ? item.patch.op : item.op),
      removed: nested.remove,
      exactInputs: reorder.previous === previous && reorder.next === next,
      mutations: observer.takeRecords().length,
      unchangedHTML: before === document.body.innerHTML,
      unchangedNodes: nodes.every((node, index) => node === [...actual.querySelectorAll('*'), ...preview.querySelectorAll('*')][index]),
      actualValue: actual.querySelector('input')!.value,
      previewValue: preview.querySelector('input')!.value,
    };
    observer.disconnect();
    actual.replaceChildren(); preview.replaceChildren();
    library.releaseDOMScope(a); library.releaseDOMScope(b);
    return result;
  });
  await testInfo.attach('actual-source-diff-result', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  expect(result).toEqual({
    noChange: false, formChange: true, reorderChange: true,
    oldIndices: [3, 1, 2, 0], operations: ['keep', 'keep', 'element', 'element'], removed: [],
    exactInputs: true, mutations: 0, unchangedHTML: true, unchangedNodes: true,
    actualValue: 'old', previewValue: 'native edit',
  });
});

test('[DIFF-01][DIFF-03] DOM 없는 실제 Chromium Worker에서도 실제 src Diff와 입력 검증이 실행된다', async ({ page }, testInfo) => {
  const result = await page.evaluate(async (code) => {
    const workerSource = `${code}\nself.onmessage = () => {
      try {
        const text = value => Object.freeze({kind:'text', value});
        const root = children => Object.freeze({kind:'root', children:Object.freeze(children)});
        const previous = root([text(' ')]);
        const next = root([text('new')]);
        const plan = StageTwoLibrary.diff(previous, next);
        let rejected = false;
        const invalid = root([null]);
        try { StageTwoLibrary.diff(invalid, invalid); } catch { rejected = true; }
        self.postMessage({ noDOM: typeof document === 'undefined', changed: plan.hasChanges,
          unchanged: StageTwoLibrary.diff(previous, previous).hasChanges,
          oldIndex: plan.children.ordered[0].oldIndex,
          op: plan.children.ordered[0].patch.op,
          inputReferences: plan.previous === previous && plan.next === next, rejected });
      } catch(error) { self.postMessage({error:String(error)}); }
    };`;
    const url = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
    const worker = new Worker(url);
    try {
      return await new Promise((resolve, reject) => {
        worker.onmessage = (event) => resolve(event.data);
        worker.onerror = (event) => reject(new Error(event.message));
        worker.postMessage(null);
      });
    } finally { worker.terminate(); URL.revokeObjectURL(url); }
  }, bundle);
  await testInfo.attach('actual-source-worker-result', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  expect(result).toEqual({ noDOM: true, changed: true, unchanged: false, oldIndex: 0, op: 'text', inputReferences: true, rejected: true });
});
