import { expect, test, type Locator, type Page } from '@playwright/test';

function ui(page: Page) {
  return {
    actual: page.getByTestId('actual-region'),
    preview: page.getByTestId('preview-region'),
    editor: page.getByTestId('html-editor'),
    patch: page.getByTestId('patch-button'),
    back: page.getByTestId('back-button'),
    forward: page.getByTestId('forward-button'),
    status: page.getByTestId('status'),
  };
}

async function edit(page: Page, html: string): Promise<void> {
  await ui(page).editor.fill(html);
}

async function apply(page: Page, html: string): Promise<void> {
  await edit(page, html);
  await expect(ui(page).patch).toBeEnabled();
  await ui(page).patch.click();
}

async function remember(locator: Locator, label: string): Promise<void> {
  await locator.evaluate((node, name) => {
    const host = window as unknown as { contractNodes?: Record<string, Element> };
    host.contractNodes ??= {};
    host.contractNodes[name] = node;
  }, label);
}

async function expectRemembered(locator: Locator, label: string): Promise<void> {
  expect(await locator.evaluate((node, name) => {
    const host = window as unknown as { contractNodes: Record<string, Element> };
    return node === host.contractNodes[name];
  }, label)).toBe(true);
}

test.beforeEach(async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.ok(), '실제 구현 앱을 실행해야 하며 테스트용 가짜 페이지로 대체하지 않는다').toBe(true);
});

test('[VIEW-01, VIEW-02, QA-02] 두 영역과 조작 버튼을 제공하고 초기 표시를 동기화한다', async ({ page }) => {
  const view = ui(page);
  await expect(view.actual).toBeVisible();
  await expect(view.preview).toBeVisible();
  await expect(view.actual).toHaveAccessibleName('실제 영역');
  await expect(view.preview).toHaveAccessibleName('테스트 영역');
  for (const button of [view.patch, view.back, view.forward]) await expect(button).toBeVisible();
  await expect(view.back).toBeDisabled();
  await expect(view.forward).toBeDisabled();
  expect(await view.actual.textContent()).toBe(await view.preview.textContent());
  await expect(view.editor).not.toHaveValue('');
});

test('[EDIT-01, EDIT-02, VIEW-03, HIST-02, HIST-03] 편집→B→C→뒤로→앞으로가 현재 기준을 사용한다', async ({ page }) => {
  const view = ui(page);
  const initial = await view.actual.textContent();
  await edit(page, '<p data-key="a">B</p>');
  await expect(view.preview).toHaveText('B');
  expect(await view.actual.textContent()).toBe(initial);
  await view.patch.click();
  await expect(view.actual).toHaveText('B');
  await apply(page, '<section title="next">C</section>');
  await view.back.click();
  await expect(view.actual).toHaveText('B');
  await expect(view.preview).toHaveText('B');
  await view.forward.click();
  await expect(view.actual.locator('section')).toHaveAttribute('title', 'next');
  await expect(view.preview).toHaveText('C');
});

test('[HIST-01, HIST-02] B에서 무변경 Patch를 반복해도 앞으로 C가 보존된다', async ({ page }) => {
  const view = ui(page);
  await apply(page, '<p>B</p>');
  await apply(page, '<p>C</p>');
  await view.back.click();
  for (let i = 0; i < 3; i += 1) {
    await view.patch.click();
    await expect(view.status).toContainText('변경 없음');
    await expect(view.forward).toBeEnabled();
  }
  await view.forward.click();
  await expect(view.actual).toHaveText('C');
  await view.back.click();
  await expect(view.actual).toHaveText('B');
});

test('[HIST-01, DIFF-03] 속성 순서가 다른 HTML을 같은 상태로 판정한다', async ({ page }) => {
  const view = ui(page);
  await apply(page, '<p class="same" title="same">B</p>');
  await apply(page, '<p>C</p>');
  await view.back.click();
  await apply(page, '<p title="same" class="same">B</p>');
  await expect(view.status).toContainText('변경 없음');
  await expect(view.forward).toBeEnabled();
});

test('[HIST-01][임시 OPEN-04] 과거 위치의 실변경만 선형 분기를 새로 만든다', async ({ page }) => {
  const view = ui(page);
  await apply(page, '<p>A</p>');
  await apply(page, '<p>B</p>');
  await apply(page, '<p>C</p>');
  await view.back.click();
  await apply(page, '<p>E</p>');
  await expect(view.forward).toBeDisabled();
  await view.back.click();
  await expect(view.actual).toHaveText('B');
  await view.forward.click();
  await expect(view.actual).toHaveText('E');
});

test('[HIST-02, HIST-03][임시 OPEN-12·14] 가능한 이동은 미적용 편집을 폐기하지만 경계 버튼은 편집을 보존한다', async ({ page }) => {
  const view = ui(page);
  await edit(page, '<p>경계의 미적용 편집</p>');
  await expect(view.back).toBeDisabled();
  await expect(view.editor).toHaveValue('<p>경계의 미적용 편집</p>');
  await apply(page, '<p>B</p>');
  await edit(page, '<p>폐기할 편집</p>');
  await view.back.click();
  await expect(view.editor).not.toHaveValue('<p>폐기할 편집</p>');
  expect(await view.actual.textContent()).toBe(await view.preview.textContent());
  await view.forward.click();
  await expect(view.actual).toHaveText('B');
});

for (const [label, html] of [
  ['script', '<script>window.alert("must not run")</script>'],
  ['이벤트 문자열', '<p onclick="alert(1)">bad</p>'],
  ['외부 URL', '<p title="safe"><iframe src="https://example.com"></iframe></p>'],
  ['style', '<p style="color:red">bad</p>'],
  ['중복 key', '<p data-key="a">1</p><p data-key="a">2</p>'],
  ['빈 key', '<p data-key="">bad</p>'],
  ['누락 ID 참조', '<label for="outside">bad</label>'],
  ['미지원 ARIA', '<p aria-braillelabel="bad">bad</p>'],
] as const) {
  test(`[EDIT-01, HIST-01][임시 OPEN-01·09] ${label} 입력은 마지막 유효 상태·이력·미리보기를 보존한다`, async ({ page }) => {
    const view = ui(page);
    let dialogs = 0;
    page.on('dialog', async (dialog) => { dialogs += 1; await dialog.dismiss(); });
    await apply(page, '<p>valid</p>');
    await apply(page, '<p>next</p>');
    await view.back.click();
    await edit(page, html);
    await expect(view.editor).toHaveValue(html);
    await expect(view.patch).toBeDisabled();
    await expect(view.status).not.toHaveText('');
    await expect(view.preview).toHaveText('valid');
    await expect(view.actual).toHaveText('valid');
    await expect(view.forward).toBeEnabled();
    expect(dialogs).toBe(0);
    await view.forward.click();
    await expect(view.actual).toHaveText('next');
  });
}

test('[PATCH-03, HIST-03, QA-04] keyed 재정렬과 이력 이동은 살아 있는 DOM 객체를 유지한다', async ({ page }) => {
  const view = ui(page);
  const before = '<ul><li data-key="a">A</li><li data-key="b">B</li><li data-key="c">C</li></ul>';
  const after = '<ul><li data-key="c">C!</li><li data-key="a">A</li><li data-key="b">B</li></ul>';
  await apply(page, before);
  for (const [name, region] of [['actual', view.actual], ['preview', view.preview]] as const) {
    for (const key of ['a', 'b', 'c']) await remember(region.locator(`[data-key="${key}"]`), `${name}-${key}`);
  }
  await apply(page, after);
  for (const button of [view.back, view.forward]) {
    await button.click();
    for (const [name, region] of [['actual', view.actual], ['preview', view.preview]] as const) {
      for (const key of ['a', 'b', 'c']) await expectRemembered(region.locator(`[data-key="${key}"]`), `${name}-${key}`);
    }
  }
  expect(await view.actual.locator('li').allTextContents()).toEqual(['C!', 'A', 'B']);
});

test('[PATCH-03, QA-04] 텍스트 변경은 문단·형제 DOM을 유지하고 무변경에는 mutation이 없다', async ({ page }) => {
  const view = ui(page);
  await apply(page, '<p data-key="p">old</p><span>stable</span>');
  await remember(view.actual.locator('p'), 'paragraph');
  await remember(view.actual.locator('span'), 'sibling');
  await apply(page, '<p data-key="p">new</p><span>stable</span>');
  await expectRemembered(view.actual.locator('p'), 'paragraph');
  await expectRemembered(view.actual.locator('span'), 'sibling');
  await view.actual.evaluate((node) => {
    const host = window as unknown as { contractObserver?: MutationObserver; contractMutations?: number };
    host.contractMutations = 0;
    host.contractObserver = new MutationObserver((records) => { host.contractMutations! += records.length; });
    host.contractObserver.observe(node, { subtree: true, childList: true, attributes: true, characterData: true });
  });
  await view.patch.click();
  await expect(view.status).toContainText('변경 없음');
  expect(await page.evaluate(() => {
    const host = window as unknown as { contractObserver: MutationObserver; contractMutations: number };
    const count = host.contractMutations + host.contractObserver.takeRecords().length;
    host.contractObserver.disconnect();
    return count;
  })).toBe(0);
});

test('[VDOM-02, EDIT-01, HIST-03][임시 OPEN-01] label은 자기 scope input에 연결되고 미리보기 조작만 편집한다', async ({ page }) => {
  const view = ui(page);
  await apply(page, '<label for="agree">동의</label><input id="agree" type="checkbox">');
  const actualId = await view.actual.locator('input').getAttribute('id');
  const previewId = await view.preview.locator('input').getAttribute('id');
  expect(actualId).not.toBe(previewId);
  expect(actualId).not.toBe('agree');
  for (const region of [view.actual, view.preview]) {
    expect(await region.evaluate((node) => (node.querySelector('label') as HTMLLabelElement).control === node.querySelector('input'))).toBe(true);
  }
  await view.preview.locator('label').click();
  await expect(view.preview.locator('input')).toBeChecked();
  await expect(view.actual.locator('input')).not.toBeChecked();
  await expect(view.editor).toHaveValue(/checked/);
  const html = await view.editor.inputValue();
  expect(html).toContain('id="agree"');
  expect(html).not.toContain(actualId!);
  expect(html).not.toContain(previewId!);
  await view.patch.click();
  await expect(view.actual.locator('input')).toBeChecked();
  await view.back.click();
  await expect(view.actual.locator('input')).not.toBeChecked();
  await expect(view.preview.locator('input')).not.toBeChecked();
});

test('[EDIT-02, HIST-01][임시 OPEN-01] 실제 영역 label 기본 동작 대상은 자기 input이며 값은 적용 상태로 복원된다', async ({ page }) => {
  const view = ui(page);
  await apply(page, '<label for="agree">동의</label><input id="agree" type="checkbox">');
  expect(await view.actual.locator('label').evaluate((label) => (label as HTMLLabelElement).control === label.parentElement?.querySelector('input'))).toBe(true);
  await view.actual.locator('label').click();
  await expect(view.actual.locator('input')).not.toBeChecked();
  await expect(view.preview.locator('input')).not.toBeChecked();
});

test('[VDOM-02, EDIT-01, HIST-03][임시 OPEN-01] 폼 현재 값과 textarea 이스케이프를 이력 왕복한다', async ({ page }) => {
  const view = ui(page);
  await apply(page, '<input type="text" value="initial"><textarea>initial</textarea>');
  await view.preview.locator('input').fill('live <&"');
  await view.preview.locator('textarea').fill('</textarea><script>not code</script>');
  await view.patch.click();
  await expect(view.actual.locator('input')).toHaveValue('live <&"');
  await expect(view.actual.locator('textarea')).toHaveValue('</textarea><script>not code</script>');
  expect(await view.actual.locator('script').count()).toBe(0);
  await view.back.click();
  await expect(view.actual.locator('textarea')).toHaveValue('initial');
  await view.forward.click();
  await expect(view.preview.locator('textarea')).toHaveValue('</textarea><script>not code</script>');
});

test('[HIST-01, PATCH-02][임시 OPEN-01] 무변경 Patch도 실제 폼 값을 보정하며 forward를 유지한다', async ({ page }) => {
  const view = ui(page);
  await apply(page, '<input type="text" value="B">');
  await apply(page, '<input type="text" value="C">');
  await view.back.click();
  await view.actual.locator('input').evaluate((node) => { (node as HTMLInputElement).value = 'temporary drift'; });
  await view.patch.click();
  await expect(view.actual.locator('input')).toHaveValue('B');
  await expect(view.status).toContainText('변경 없음');
  await expect(view.forward).toBeEnabled();
  await view.forward.click();
  await expect(view.actual.locator('input')).toHaveValue('C');
});

test('[EDIT-01, PATCH-01][임시 OPEN-01·02] 브라우저가 보정할 수 있는 HTML과 빈 루트·복수 루트를 처리한다', async ({ page }) => {
  const view = ui(page);
  await apply(page, '<p>브라우저가 닫는 문단');
  await expect(view.actual.locator('p')).toHaveText('브라우저가 닫는 문단');
  await apply(page, '');
  await expect(view.actual).toBeEmpty();
  await expect(view.preview).toBeEmpty();
  await apply(page, '<p>A</p><span>B</span>');
  expect(await view.actual.locator(':scope > *').count()).toBe(2);
  await expect(view.actual).toHaveText('AB');
});

test('[DIFF-03, PATCH-03, HIST-01] 같은 화면이어도 key 변경은 다른 노드와 새 이력이다', async ({ page }) => {
  const view = ui(page);
  await apply(page, '<p data-key="a">same</p>');
  await remember(view.actual.locator('p'), 'old-key');
  await apply(page, '<p data-key="b">same</p>');
  expect(await view.actual.locator('p').evaluate((node) => {
    const host = window as unknown as { contractNodes: Record<string, Element> };
    return host.contractNodes['old-key'] === node;
  })).toBe(false);
  await view.back.click();
  await expect(view.actual.locator('p')).toHaveAttribute('data-key', 'a');
});

test('[VDOM-02, HIST-01][임시 OPEN-01] 특수문자 key와 논리 ID는 HTML 직렬화·이력 왕복에서 보존된다', async ({ page }) => {
  const view = ui(page);
  const key = ' 01 "&\n🔑 ';
  await apply(page, '<p data-key=" 01 &quot;&amp;&#10;🔑 " id="logical-note">keyed</p>');
  await expect(view.actual.locator('p')).toHaveAttribute('data-key', key);
  await expect(view.preview.locator('p')).toHaveAttribute('data-key', key);
  expect(await view.editor.evaluate((input) => {
    const template = document.createElement('template');
    template.innerHTML = (input as HTMLTextAreaElement).value;
    return { key: template.content.querySelector('p')?.getAttribute('data-key'), id: template.content.querySelector('p')?.id };
  })).toEqual({ key, id: 'logical-note' });
  await apply(page, '<p>other</p>');
  await view.back.click();
  await expect(view.actual.locator('p')).toHaveAttribute('data-key', key);
  await expect(view.preview.locator('p')).toHaveAttribute('data-key', key);
});

test('[VIEW-03, HIST-01][임시 OPEN-09] 부분 DOM 반영 오류는 forward 이력을 확정하지 않고 복구 후 편집을 재개한다', async ({ page }) => {
  const view = ui(page);
  await apply(page, '<p title="B">B</p>');
  await apply(page, '<p title="C">C</p>');
  await view.back.click();
  await edit(page, '<p title="__FAIL__">E</p>');
  await page.evaluate(() => {
    const original = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (name: string, value: string): void {
      original.call(this, name, value);
      if (name === 'title' && value === '__FAIL__' && this.closest('[data-testid="actual-region"]')) {
        Element.prototype.setAttribute = original;
        throw new Error('contract: injected partial DOM apply failure');
      }
    };
  });
  await view.patch.click();
  await expect(view.actual).toHaveText('B');
  await expect(view.actual.locator('p')).toHaveAttribute('title', 'B');
  await expect(view.forward).toBeEnabled();
  await expect(view.status).not.toContainText('변경 없음');
  await apply(page, '<p>recovered</p>');
  await expect(view.actual).toHaveText('recovered');
});
