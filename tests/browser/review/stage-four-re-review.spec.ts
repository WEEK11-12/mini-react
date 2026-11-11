import { expect, test, type Page, type TestInfo } from '@playwright/test';
const baseURL = process.env.MINI_REACT_BASE_URL ?? 'http://127.0.0.1:5173';
const ui = (page: Page) => ({
  actual: page.getByTestId('actual-region'), preview: page.getByTestId('preview-region'),
  editor: page.getByTestId('html-editor'), patch: page.getByTestId('patch-button'),
  back: page.getByTestId('back-button'), forward: page.getByTestId('forward-button'), status: page.getByTestId('status'),
});
const html = (text: string) => `<p data-key="p">${text}</p><label for="field">toggle</label><input id="field" data-key="input" type="checkbox"><textarea data-key="area">${text}</textarea>`;
async function apply(page: Page, source: string) {
  await ui(page).editor.fill(source);
  await ui(page).patch.click();
}
async function leaveAndReturn(page: Page, suffix: string, info: TestInfo) {
  await page.goto(`${baseURL}/?departure=${suffix}`);
  await page.evaluate(() => history.back());
  await expect(page).toHaveURL(`${baseURL}/`);
  const value = await page.evaluate(() => ({
    persisted: (window as unknown as { reReviewPersisted?: boolean }).reReviewPersisted,
    status: document.querySelector('[data-testid="status"]')!.textContent,
    editorDisabled: (document.querySelector('[data-testid="html-editor"]') as HTMLTextAreaElement).disabled,
    actual: document.querySelector('[data-testid="actual-region"]')!.textContent,
  }));
  await info.attach(`BFCache-${suffix}`, { body: JSON.stringify(value), contentType: 'application/json' });
  expect(value.persisted).toBe(true);
  expect(value.editorDisabled).toBe(false);
  expect(value.status).not.toContain('종료');
}
async function instrumentRemovals(page: Page) {
  await page.evaluate(() => {
    const host = window as unknown as { reReviewRemoved: string[] };
    host.reReviewRemoved = [];
    const original = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.removeEventListener = function (...args) {
      if (this instanceof HTMLElement) {
        const id = this.getAttribute('data-testid');
        if (id && ['actual-region', 'preview-region', 'html-editor', 'patch-button', 'back-button', 'forward-button'].includes(id)) {
          host.reReviewRemoved.push(`${id}:${args[0]}`);
        }
      }
      return original.apply(this, args);
    };
  });
}
const expectedRemovals = ['actual-region:change', 'actual-region:input', 'back-button:click', 'forward-button:click', 'html-editor:input', 'patch-button:click', 'preview-region:change', 'preview-region:input'];

test('F1 직접 경계: 실제 BFCache 두 번 왕복 후 DOM·scope·미적용 편집·History·폼 조작을 유지한다', async ({ playwright }, info) => {
  test.setTimeout(30000);
  const browser = await playwright.chromium.launch({ channel: 'chrome', headless: true, ignoreDefaultArgs: ['--disable-back-forward-cache'] });
  const context = await browser.newContext();
  try {
    await context.addInitScript(() => {
      window.addEventListener('pageshow', event => { (window as unknown as { reReviewPersisted: boolean }).reReviewPersisted = event.persisted; });
    });
    const page = await context.newPage();
    await page.goto(`${baseURL}/`);
    await expect(ui(page).status).toContainText('준비');
    await apply(page, html('B'));
    await apply(page, html('C'));
    await ui(page).back.click();
    await ui(page).editor.fill(html('draft'));
    const source = await ui(page).editor.inputValue();
    await page.evaluate(() => {
      (window as unknown as { reReviewNodes: Element[] }).reReviewNodes = [...document.querySelectorAll('[data-testid="actual-region"] *, [data-testid="preview-region"] *')];
    });
    await leaveAndReturn(page, 'first', info);
    expect(await page.evaluate(() => {
      const refs = (window as unknown as { reReviewNodes: Element[] }).reReviewNodes;
      const current = [...document.querySelectorAll('[data-testid="actual-region"] *, [data-testid="preview-region"] *')];
      return refs.length === current.length && refs.every((node, index) => node === current[index]);
    })).toBe(true);
    await expect(ui(page).editor).toHaveValue(source);
    await expect(ui(page).actual.locator('p')).toHaveText('B');
    await expect(ui(page).preview.locator('p')).toHaveText('draft');
    await expect(ui(page).status).toContainText('2 / 3');
    for (const region of [ui(page).actual, ui(page).preview]) {
      expect(await region.evaluate(node => (node.querySelector('label') as HTMLLabelElement).control === node.querySelector('input'))).toBe(true);
    }
    await ui(page).preview.locator('label').click();
    await expect(ui(page).preview.locator('input')).toBeChecked();
    await expect(ui(page).actual.locator('input')).not.toBeChecked();
    await ui(page).forward.click();
    await expect(ui(page).actual.locator('p')).toHaveText('C');
    await expect(ui(page).preview.locator('input')).not.toBeChecked();
    await leaveAndReturn(page, 'second', info);
    await ui(page).back.click();
    await ui(page).patch.click();
    await expect(ui(page).status).toContainText('변경 없음');
    await expect(ui(page).forward).toBeEnabled();
    await ui(page).forward.click();
    await expect(ui(page).actual.locator('p')).toHaveText('C');
    await apply(page, html('after restore'));
    await expect(ui(page).actual.locator('p')).toHaveText('after restore');
    await info.attach('browser', { body: browser.version(), contentType: 'text/plain' });
  } finally { await context.close(); await browser.close(); }
});

test('F1 직접 경계: 실제 persisted pagehide를 지난 뒤에도 non-persisted 종료 리스너가 남는다', async ({ playwright }, info) => {
  test.setTimeout(30000);
  const browser = await playwright.chromium.launch({ channel: 'chrome', headless: true, ignoreDefaultArgs: ['--disable-back-forward-cache'] });
  const context = await browser.newContext();
  try {
    await context.addInitScript(() => {
      window.addEventListener('pageshow', event => { (window as unknown as { reReviewPersisted: boolean }).reReviewPersisted = event.persisted; });
    });
    const page = await context.newPage();
    await page.goto(`${baseURL}/`);
    await expect(ui(page).status).toContainText('준비');
    await instrumentRemovals(page);
    await leaveAndReturn(page, 'before-stop', info);
    expect(await page.evaluate(() => (window as unknown as { reReviewRemoved: string[] }).reReviewRemoved)).toEqual([]);
    // Deterministically exercise the normal-termination branch on the restored document.
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })));
    await expect(ui(page).status).toContainText('종료');
    await expect(ui(page).actual).toBeEmpty();
    await expect(ui(page).preview).toBeEmpty();
    for (const control of [ui(page).editor, ui(page).patch, ui(page).back, ui(page).forward]) await expect(control).toBeDisabled();
    expect(await page.evaluate(() => (window as unknown as { reReviewRemoved: string[] }).reReviewRemoved.sort())).toEqual(expectedRemovals);
  } finally { await context.close(); await browser.close(); }
});

test('F1 정상 종료: 실제 non-persisted pagehide에서 두 영역과 컨트롤러 리스너를 해제한다', async ({ page }, info) => {
  await page.goto(`${baseURL}/`);
  await expect(ui(page).status).toContainText('준비');
  await instrumentRemovals(page);
  await page.evaluate(() => {
    window.addEventListener('pagehide', event => {
      sessionStorage.setItem('review-termination', JSON.stringify({
        persisted: event.persisted,
        status: document.querySelector('[data-testid="status"]')!.textContent,
        actualCount: document.querySelector('[data-testid="actual-region"]')!.childNodes.length,
        previewCount: document.querySelector('[data-testid="preview-region"]')!.childNodes.length,
        editorDisabled: (document.querySelector('[data-testid="html-editor"]') as HTMLTextAreaElement).disabled,
        removed: (window as unknown as { reReviewRemoved: string[] }).reReviewRemoved.sort(),
      }));
    });
  });
  await page.goto(`${baseURL}/?normal-termination=1`);
  const value = await page.evaluate(() => JSON.parse(sessionStorage.getItem('review-termination')!)) as {
    persisted: boolean; status: string; actualCount: number; previewCount: number; editorDisabled: boolean; removed: string[];
  };
  await info.attach('actual-native-termination', { body: JSON.stringify(value), contentType: 'application/json' });
  expect(value).toMatchObject({ persisted: false, actualCount: 0, previewCount: 0, editorDisabled: true, removed: expectedRemovals });
  expect(value.status).toContain('종료');
});
