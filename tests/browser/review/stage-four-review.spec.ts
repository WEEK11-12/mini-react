import { expect, test, type Page } from '@playwright/test';

const ui = (page: Page) => ({
  actual: page.getByTestId('actual-region'), preview: page.getByTestId('preview-region'),
  editor: page.getByTestId('html-editor'), patch: page.getByTestId('patch-button'),
  back: page.getByTestId('back-button'), forward: page.getByTestId('forward-button'),
  status: page.getByTestId('status'),
});
const html = (name: string) => `<p title="${name}">${name}</p><label for="field">toggle</label><input id="field" type="checkbox"><textarea>${name}</textarea>`;
async function apply(page: Page, source: string) {
  await ui(page).editor.fill(source);
  await expect(ui(page).patch).toBeEnabled();
  await ui(page).patch.click();
}
async function past(page: Page) {
  await apply(page, html('B'));
  await apply(page, html('C'));
  await ui(page).back.click();
  await expect(ui(page).status).toContainText('2 / 3');
}

test.beforeEach(async ({ page }) => {
  expect((await page.goto('/'))?.ok()).toBe(true);
  await expect(ui(page).status).toContainText('준비');
});
test.afterEach(async ({ page }) => {
  await page.evaluate(() => (window as unknown as { reviewRestore?: () => void }).reviewRestore?.());
});

async function injectAttributeFailure(page: Page, region: 'actual' | 'preview', value: string, recoveryFailure = false) {
  await page.evaluate(({ region, value, recoveryFailure }) => {
    const host = window as unknown as { reviewRestore?: () => void; reviewTrace: string[] };
    host.reviewTrace = [];
    const setAttribute = Element.prototype.setAttribute;
    const replaceChildren = Element.prototype.replaceChildren;
    let fired = false;
    Element.prototype.setAttribute = function (name, next) {
      setAttribute.call(this, name, next);
      if (!fired && name === 'title' && next === value && this.closest(`[data-testid="${region}-region"]`)) {
        fired = true;
        host.reviewTrace.push(`partial-write:${this.getAttribute('title')}`);
        throw new Error('review: one-shot partial attribute failure');
      }
    };
    Element.prototype.replaceChildren = function (...nodes) {
      replaceChildren.apply(this, nodes);
      if (fired && recoveryFailure && this.getAttribute('data-testid') === 'actual-region') {
        host.reviewTrace.push('recovery-cleared-actual');
        throw new Error('review: recovery failure');
      }
    };
    host.reviewRestore = () => {
      Element.prototype.setAttribute = setAttribute;
      Element.prototype.replaceChildren = replaceChildren;
    };
  }, { region, value, recoveryFailure });
}

for (const operation of ['patch', 'forward'] as const) {
  for (const region of (operation === 'patch' ? ['actual'] : ['actual', 'preview']) as ('actual' | 'preview')[]) {
    test(`[VIEW-03, HIST-01, HIST-03] ${operation}/${region} 부분 쓰기 실패는 두 영역·scope·cursor·forward를 복구한다`, async ({ page }, info) => {
      const view = ui(page);
      await past(page);
      if (operation === 'patch') await view.editor.fill(html('E'));
      const editor = await view.editor.inputValue();
      const ids = [await view.actual.locator('input').getAttribute('id'), await view.preview.locator('input').getAttribute('id')];
      await injectAttributeFailure(page, region, operation === 'patch' ? 'E' : 'C');
      await (operation === 'patch' ? view.patch : view.forward).click();
      const trace = await page.evaluate(() => (window as unknown as { reviewTrace: string[] }).reviewTrace);
      await info.attach('partial-write-evidence', { body: JSON.stringify(trace), contentType: 'application/json' });
      expect(trace).toEqual([`partial-write:${operation === 'patch' ? 'E' : 'C'}`]);
      await expect(view.status).toContainText('2 / 3');
      await expect(view.status).toContainText('오류');
      await expect(view.actual.locator('p')).toHaveText('B');
      await expect(view.preview.locator('p')).toHaveText(operation === 'patch' ? 'E' : 'B');
      await expect(view.editor).toHaveValue(editor);
      await expect(view.patch).toBeEnabled();
      await expect(view.forward).toBeEnabled();
      for (const [index, container] of [view.actual, view.preview].entries()) {
        expect(await container.locator('input').getAttribute('id')).toBe(ids[index]);
        expect(await container.evaluate((node) => (node.querySelector('label') as HTMLLabelElement).control === node.querySelector('input'))).toBe(true);
      }
      await view.preview.locator('label').click();
      await expect(view.preview.locator('input')).toBeChecked();
      await expect(view.actual.locator('input')).not.toBeChecked();
      await view.actual.locator('label').click();
      await expect(view.actual.locator('input')).not.toBeChecked();
      await view.forward.click();
      await expect(view.actual.locator('p')).toHaveText('C');
      await expect(view.preview.locator('input')).not.toBeChecked();
      await expect(view.status).toContainText('3 / 3');
    });
  }
}

test('[VIEW-03, HIST-01] 실제 반영 성공 뒤 미리보기 검증 실패도 이력을 확정하지 않는다', async ({ page }) => {
  const view = ui(page);
  await past(page);
  await view.editor.fill(html('E'));
  await page.evaluate(() => {
    const host = window as unknown as { reviewRestore?: () => void; reviewTrace: string[] };
    host.reviewTrace = [];
    const setAttribute = Element.prototype.setAttribute;
    const createAttribute = document.createAttribute;
    let armed = false;
    let fired = false;
    Element.prototype.setAttribute = function (name, value) {
      setAttribute.call(this, name, value);
      if (name === 'title' && value === 'E' && this.closest('[data-testid="actual-region"]')) {
        armed = true;
        host.reviewTrace.push('actual-wrote:E');
      }
    };
    document.createAttribute = function (name) {
      if (armed && !fired) {
        fired = true;
        host.reviewTrace.push('preview-preflight-failed');
        throw new Error('review: second container failure');
      }
      return createAttribute.call(this, name);
    };
    host.reviewRestore = () => {
      Element.prototype.setAttribute = setAttribute;
      document.createAttribute = createAttribute;
    };
  });
  await view.patch.click();
  expect(await page.evaluate(() => (window as unknown as { reviewTrace: string[] }).reviewTrace)).toEqual(['actual-wrote:E', 'preview-preflight-failed']);
  await expect(view.actual.locator('p')).toHaveText('B');
  await expect(view.preview.locator('p')).toHaveText('E');
  await expect(view.editor).toHaveValue(html('E'));
  await expect(view.status).toContainText('2 / 3');
  await expect(view.status).toContainText('오류');
  await expect(view.forward).toBeEnabled();
  await view.forward.click();
  await expect(view.actual.locator('p')).toHaveText('C');
});

test('[EDIT-01] HTML 편집 중 미리보기 부분 실패는 마지막 유효 미리보기와 편집 원문을 보존하고 재편집할 수 있다', async ({ page }) => {
  const view = ui(page);
  await past(page);
  await injectAttributeFailure(page, 'preview', 'E');
  await view.editor.fill(html('E'));
  expect(await page.evaluate(() => (window as unknown as { reviewTrace: string[] }).reviewTrace)).toEqual(['partial-write:E']);
  await expect(view.actual.locator('p')).toHaveText('B');
  await expect(view.preview.locator('p')).toHaveText('B');
  await expect(view.editor).toHaveValue(html('E'));
  await expect(view.patch).toBeDisabled();
  await expect(view.forward).toBeEnabled();
  expect(await view.preview.evaluate((node) => (node as HTMLElement).inert)).toBe(true);
  await apply(page, html('recovered'));
  await expect(view.actual.locator('p')).toHaveText('recovered');
  expect(await view.preview.evaluate((node) => (node as HTMLElement).inert)).toBe(false);
});

test('[HIST-01] 무변경 폼 보정 실패는 성공으로 기록하지 않고 forward를 유지한다', async ({ page }) => {
  const view = ui(page);
  await apply(page, '<input value="B">');
  await apply(page, '<input value="C">');
  await view.back.click();
  await page.evaluate(() => {
    const host = window as unknown as { reviewRestore?: () => void; reviewTrace: string[] };
    const input = document.querySelector('[data-testid="actual-region"] input') as HTMLInputElement;
    input.value = 'drift';
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!;
    let fired = false;
    host.reviewTrace = [];
    Object.defineProperty(HTMLInputElement.prototype, 'value', { ...descriptor, set(value: string) {
      descriptor.set!.call(this, value);
      if (!fired && this === input) {
        fired = true;
        host.reviewTrace.push(`partial-value:${input.value}`);
        throw new Error('review: form restore failure');
      }
    } });
    host.reviewRestore = () => Object.defineProperty(HTMLInputElement.prototype, 'value', descriptor);
  });
  await view.patch.click();
  expect(await page.evaluate(() => (window as unknown as { reviewTrace: string[] }).reviewTrace)).toEqual(['partial-value:B']);
  await expect(view.status).toContainText('2 / 3');
  await expect(view.status).toContainText('오류');
  await expect(view.status).not.toContainText('변경 없음');
  await expect(view.actual.locator('input')).toHaveValue('B');
  await expect(view.forward).toBeEnabled();
  await view.patch.click();
  await expect(view.status).toContainText('변경 없음');
  await view.forward.click();
  await expect(view.actual.locator('input')).toHaveValue('C');
});

for (const operation of ['patch', 'forward'] as const) {
  test(`[VIEW-03, HIST-03] ${operation} 복구 실패 후 편집·Patch·양방향 이동을 중단한다`, async ({ page }, info) => {
    const view = ui(page);
    await past(page);
    if (operation === 'patch') await view.editor.fill(html('E'));
    await injectAttributeFailure(page, 'actual', operation === 'patch' ? 'E' : 'C', true);
    await (operation === 'patch' ? view.patch : view.forward).click();
    const trace = await page.evaluate(() => (window as unknown as { reviewTrace: string[] }).reviewTrace);
    await info.attach('failed-recovery-evidence', { body: JSON.stringify(trace), contentType: 'application/json' });
    expect(trace).toEqual([`partial-write:${operation === 'patch' ? 'E' : 'C'}`, 'recovery-cleared-actual']);
    await expect(view.status).toContainText('2 / 3');
    await expect(view.status).toContainText('복구 실패');
    await expect(view.status).toContainText('새로고침');
    for (const locator of [view.patch, view.back, view.forward, view.editor]) await expect(locator).toBeDisabled();
    expect(await view.preview.evaluate((node) => (node as HTMLElement).inert)).toBe(true);
    const before = await page.evaluate(() => ({
      actual: document.querySelector('[data-testid="actual-region"]')!.innerHTML,
      preview: document.querySelector('[data-testid="preview-region"]')!.innerHTML,
      status: document.querySelector('[data-testid="status"]')!.textContent,
    }));
    await page.evaluate(() => {
      const editor = document.querySelector('[data-testid="html-editor"]') as HTMLTextAreaElement;
      editor.value = '<p>must not apply</p>';
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      for (const id of ['patch-button', 'back-button', 'forward-button']) document.querySelector(`[data-testid="${id}"]`)!.dispatchEvent(new Event('click'));
      document.querySelector('[data-testid="preview-region"]')!.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(await page.evaluate(() => ({
      actual: document.querySelector('[data-testid="actual-region"]')!.innerHTML,
      preview: document.querySelector('[data-testid="preview-region"]')!.innerHTML,
      status: document.querySelector('[data-testid="status"]')!.textContent,
    }))).toEqual(before);
  });
}

test('[VDOM-02, EDIT-01, HIST-01] 실제 브라우저 HTML 직렬화/재입력·ARIA·현재 폼 값의 왕복', async ({ page }, info) => {
  const view = ui(page);
  await apply(page, '<label for="field">name</label><input id="field" value="initial"><span id="hint">hint</span><textarea aria-describedby="hint"></textarea><input type="checkbox" checked disabled value="&quot;&amp;">');
  await view.preview.locator('input[type=text]').fill('<&" 🔑');
  await view.preview.locator('textarea').fill('\n\n</textarea><script>text only</script>&"\n');
  await view.patch.click();
  const saved = await view.editor.inputValue();
  expect(saved).not.toMatch(/mini-react-\d+-\d+/);
  expect(saved).toContain('aria-describedby="hint"');
  await apply(page, '<p>elsewhere</p>');
  await view.back.click();
  await view.editor.fill(`${saved} `);
  await view.editor.fill(saved);
  await view.patch.click();
  await expect(view.status).toContainText('변경 없음');
  await expect(view.forward).toBeEnabled();
  for (const container of [view.actual, view.preview]) {
    await expect(container.locator('input[type=text]')).toHaveValue('<&" 🔑');
    await expect(container.locator('textarea')).toHaveValue('\n\n</textarea><script>text only</script>&"\n');
    await expect(container.locator('input[type=checkbox]')).toBeChecked();
    await expect(container.locator('input[type=checkbox]')).toBeDisabled();
    expect(await container.locator('script').count()).toBe(0);
    expect(await container.evaluate((node) => {
      const area = node.querySelector('textarea')!;
      const target = document.getElementById(area.getAttribute('aria-describedby')!);
      return target === node.querySelector('span');
    })).toBe(true);
  }
  await info.attach('logical-editor', { body: saved, contentType: 'text/plain' });
});

test('[EDIT-02] 실제 영역 input·textarea의 사용자 조작은 적용 값으로 복원한다', async ({ page }) => {
  const view = ui(page);
  await apply(page, '<input value="saved"><textarea>saved</textarea><input type="checkbox" checked>');
  const editor = await view.editor.inputValue();
  await view.actual.locator('input[type=text]').fill('not saved');
  await view.actual.locator('textarea').fill('not saved');
  await view.actual.locator('input[type=checkbox]').click();
  await expect(view.actual.locator('input[type=text]')).toHaveValue('saved');
  await expect(view.actual.locator('textarea')).toHaveValue('saved');
  await expect(view.actual.locator('input[type=checkbox]')).toBeChecked();
  await expect(view.editor).toHaveValue(editor);
  await expect(view.status).toContainText('2 / 2');
});

test('[QA-02] 좁은 화면에서 주요 입력·컨트롤이 표시되고 초기 JavaScript 오류가 없다', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const view = ui(page);
  await expect(view.status).toContainText('준비');
  await expect(view.actual).toBeVisible();
  await expect(view.preview).toBeVisible();
  await expect(view.editor).toBeVisible();
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('mobile.png'), fullPage: true });
});

test('[VIEW-01, VIEW-02] 브라우저 탐색 후 돌아와도 앱이 사용 가능하다', async ({ playwright }, info) => {
  test.setTimeout(30000);
  const baseURL = process.env.MINI_REACT_NAVIGATION_BASE_URL ?? 'http://127.0.0.1:5173';
  const browser = await playwright.chromium.launch({ channel: 'chrome', headless: true,
    ignoreDefaultArgs: ['--disable-back-forward-cache'] });
  const context = await browser.newContext();
  try {
    await context.addInitScript(() => {
      window.addEventListener('pageshow', event => {
        (window as unknown as { reviewPersisted: boolean }).reviewPersisted = event.persisted;
      });
    });
    const page = await context.newPage();
    await page.goto(`${baseURL}/`);
    await expect(ui(page).status).toContainText('준비');
    await apply(page, '<p>saved before navigation</p>');
    await page.goto(`${baseURL}/?navigation=second`);
    // BFCache restoration emits pageshow, not a new load event.
    await page.evaluate(() => history.back());
    await expect(page).toHaveURL(`${baseURL}/`);
    const result = await page.evaluate(() => ({
      persisted: (window as unknown as { reviewPersisted: boolean }).reviewPersisted,
      status: document.querySelector('[data-testid="status"]')?.textContent,
      actual: document.querySelector('[data-testid="actual-region"]')?.textContent,
      editorDisabled: (document.querySelector('[data-testid="html-editor"]') as HTMLTextAreaElement)?.disabled,
    }));
    await info.attach('navigation-result', { body: JSON.stringify({ browser: browser.version(), ...result }), contentType: 'application/json' });
    expect(result.persisted, '실제 BFCache 복원을 관찰한다').toBe(true);
    expect.soft(result.editorDisabled).toBe(false);
    expect.soft(result.actual).not.toBe('');
    await expect.soft(ui(page).patch).toBeEnabled();
    await expect.soft(ui(page).actual).not.toBeEmpty();
  } finally { await context.close(); await browser.close(); }
});
