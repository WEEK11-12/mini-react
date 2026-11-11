import { expect, test, type Page } from '@playwright/test';

const by = (page: Page, id: string) => page.getByTestId(id);
async function ready(page: Page) {
  await page.goto('/');
  await expect(by(page, 'quantity')).toHaveText('1');
  await expect(by(page, 'component-demo').locator('article')).toContainText('재고: 12');
}
async function evidence(page: Page, name: string) {
  const value = await page.evaluate(() => ({
    cart: document.querySelector('[data-testid="component-demo"]')!.textContent,
    list: document.querySelector('[data-testid="keyed-list-demo"]')!.textContent,
    cartInert: (document.querySelector('[data-testid="component-demo"]') as HTMLElement).inert,
    listInert: (document.querySelector('[data-testid="keyed-list-demo"]') as HTMLElement).inert,
    status: document.querySelector('[data-testid="component-status"]')!.textContent,
    phaseOneStatus: document.querySelector('[data-testid="status"]')!.textContent,
    setups: document.querySelector('[data-testid="effect-setup-count"]')!.textContent,
    cleanups: document.querySelector('[data-testid="effect-cleanup-count"]')!.textContent,
  }));
  await test.info().attach(name, { body: JSON.stringify(value), contentType: 'application/json' });
  return value;
}
async function faultCart(page: Page) {
  await page.evaluate(() => {
    const span = document.querySelector('[data-testid="quantity"]')!;
    const text = span.firstChild!;
    const descriptor = Object.getOwnPropertyDescriptor(Node.prototype, 'nodeValue')!;
    Object.defineProperty(text, 'nodeValue', {
      configurable: true,
      get() { return descriptor.get!.call(this); },
      set(value) {
        descriptor.set!.call(this, value);
        delete (this as unknown as { nodeValue?: string }).nodeValue;
        throw new Error('stage-nine-cart-write-failed');
      },
    });
  });
  await by(page, 'increase-quantity').click();
  await expect(by(page, 'component-status')).toContainText('stage-nine-cart-write-failed');
  await expect(by(page, 'component-demo')).toHaveJSProperty('inert', true);
  await expect(by(page, 'quantity')).toHaveText('1');
  await expect(by(page, 'effect-cleanup-count')).toHaveText('1');
}

test('S09-01 [VIEW-04 COMP-03 MEMO EFF] 정확한 합계·DOM 정체성·동일 deps 유지·새 구독 재고', async ({ page }) => {
  await ready(page);
  const refs = await by(page, 'component-demo').evaluateHandle(host => [...host.querySelectorAll('*')]);
  await expect(by(page, 'total')).toHaveText('1500');
  await expect(by(page, 'memo-count')).toHaveText('1');
  await by(page, 'increase-quantity').click();
  await expect(by(page, 'quantity')).toHaveText('2');
  await expect(by(page, 'total')).toHaveText('3000');
  await expect(by(page, 'memo-count')).toHaveText('2');
  await by(page, 'memo-input').fill('한글 메모 <&>');
  await expect(by(page, 'memo-output')).toHaveText('한글 메모 <&>');
  await expect(by(page, 'memo-count')).toHaveText('2');
  await expect(by(page, 'effect-setup-count')).toHaveText('1');
  await expect(by(page, 'effect-cleanup-count')).toHaveText('0');
  expect(await refs.evaluate(nodes => {
    const current = [...document.querySelector('[data-testid="component-demo"]')!.querySelectorAll('*')];
    return nodes.length === current.length && nodes.every((node, index) => node === current[index]);
  })).toBe(true);
  await by(page, 'change-product').click();
  await expect(by(page, 'component-demo').locator('h3')).toHaveText('배');
  await expect(by(page, 'component-demo').locator('article')).toContainText('재고: 8');
  await expect(by(page, 'total')).toHaveText('4000');
  await expect(by(page, 'memo-count')).toHaveText('3');
  await by(page, 'change-product').click();
  await expect(by(page, 'component-demo').locator('article')).toContainText('재고: 12');
  await expect(by(page, 'effect-setup-count')).toHaveText('3');
  await expect(by(page, 'effect-cleanup-count')).toHaveText('2');
  await evidence(page, 'normal');
});

test('S09-02 [PATCH-03] keyed 삭제·빈 목록·재삽입에서 잔존 노드 정체성과 안정 key', async ({ page }) => {
  await ready(page);
  const refs = await by(page, 'keyed-list-demo').evaluateHandle(host => new Map([...host.querySelectorAll('[data-key]')].map(node => [node.getAttribute('data-key'), node])));
  await by(page, 'reverse-list').click();
  await by(page, 'remove-list-item').click();
  expect(await by(page, 'list-item').allTextContents()).toEqual(['b', 'a']);
  expect(await refs.evaluate(nodes => [...document.querySelectorAll('[data-testid="list-item"]')].every(node => nodes.get(node.getAttribute('data-key')) === node))).toBe(true);
  await by(page, 'prepend-list-item').click();
  expect(await by(page, 'list-item').allTextContents()).toEqual(['new-1', 'b', 'a']);
  for (let i = 0; i < 3; i++) await by(page, 'remove-list-item').click();
  await expect(by(page, 'list-item')).toHaveCount(0);
  await expect(by(page, 'remove-list-item')).toBeDisabled();
  await expect(by(page, 'reverse-list')).toBeDisabled();
  await by(page, 'prepend-list-item').click();
  await expect(by(page, 'list-item')).toHaveText('new-2');
  await expect(by(page, 'component-status')).toBeEmpty();
});

test('S09-03 [HIST-03 STA-02] 양방향 상태·History 독립성과 Phase 2 제거 후 Phase 1 편집', async ({ page }) => {
  await ready(page);
  const initial = await by(page, 'html-editor').inputValue();
  await by(page, 'html-editor').fill('<p data-key="p">B</p>');
  await by(page, 'patch-button').click();
  const status = await by(page, 'status').textContent();
  await by(page, 'increase-quantity').click();
  await by(page, 'memo-input').fill('유지');
  await by(page, 'change-product').click();
  await by(page, 'reverse-list').click();
  await expect(by(page, 'status')).toHaveText(status!);
  await by(page, 'back-button').click();
  await expect(by(page, 'html-editor')).toHaveValue(initial);
  await expect(by(page, 'quantity')).toHaveText('2');
  await expect(by(page, 'total')).toHaveText('4000');
  await expect(by(page, 'memo-input')).toHaveValue('유지');
  expect(await by(page, 'list-item').allTextContents()).toEqual(['c', 'b', 'a']);
  await by(page, 'forward-button').click();
  await expect(by(page, 'actual-region').locator('p')).toHaveText('B');
  await by(page, 'unmount-component').click();
  await by(page, 'html-editor').fill('<p>C</p>');
  await by(page, 'patch-button').click();
  await expect(by(page, 'actual-region').locator('p')).toHaveText('C');
  await by(page, 'restart-component').click();
  await expect(by(page, 'quantity')).toHaveText('1');
  await expect(by(page, 'memo-input')).toHaveValue('');
  await expect(by(page, 'total')).toHaveText('1500');
});

test('S09-04 [VIEW-04] Cart 부분 쓰기 실패는 정리·inert 후 다시 시작으로 복구한다', async ({ page }) => {
  await ready(page);
  await faultCart(page);
  await evidence(page, 'cart-faulted');
  await by(page, 'restart-component').click();
  await expect(by(page, 'component-demo')).toHaveJSProperty('inert', false);
  await expect(by(page, 'effect-setup-count')).toHaveText('2');
  await expect(by(page, 'effect-cleanup-count')).toHaveText('1');
  await by(page, 'increase-quantity').click();
  await expect(by(page, 'quantity')).toHaveText('2');
});

test('S09-05 [VIEW-04] keyed 목록 부분 이동 실패 뒤 제공된 다시 시작으로 목록도 복구할 수 있다', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const list = document.querySelector('[data-testid="keyed-list-demo"] ul')!;
    const original = list.insertBefore;
    list.insertBefore = function <T extends Node>(node: T, child: Node | null): T {
      original.call(this, node, child);
      delete (this as unknown as { insertBefore?: unknown }).insertBefore;
      throw new Error('stage-nine-list-move-failed');
    };
  });
  await by(page, 'reverse-list').click();
  await expect(by(page, 'component-status')).toContainText('stage-nine-list-move-failed');
  await expect(by(page, 'keyed-list-demo')).toHaveJSProperty('inert', true);
  await evidence(page, 'list-faulted-before-restart');
  await by(page, 'restart-list').click();
  await by(page, 'reverse-list').click();
  const result = await evidence(page, 'list-after-restart-and-reverse');
  expect.soft(result.listInert).toBe(false);
  expect.soft(await by(page, 'list-item').allTextContents()).toEqual(['c', 'b', 'a']);
});

test('S09-06 [VIEW-04] 다른 루트의 정상 조작이 미복구 Cart faulted 오류를 지우지 않는다', async ({ page }) => {
  await ready(page);
  await faultCart(page);
  await by(page, 'reverse-list').click();
  const result = await evidence(page, 'cart-still-faulted-after-list-action');
  expect(result.cartInert).toBe(true);
  expect(result.status).not.toBe('');
});

test('S09-07 [EFF-04] non-persisted pagehide가 두 Phase와 양쪽 루트 자원을 정리한다', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })));
  await expect(by(page, 'component-demo')).toBeEmpty();
  await expect(by(page, 'keyed-list-demo')).toBeEmpty();
  await expect(by(page, 'actual-region')).toBeEmpty();
  await expect(by(page, 'preview-region')).toBeEmpty();
  await expect(by(page, 'effect-cleanup-count')).toHaveText('1');
  await expect(by(page, 'status')).toContainText('종료');
});

test('S09-08 [EFF-04] Cart DOM 제거 오류가 나도 목록과 Phase 1 종료를 계속한다', async ({ page }) => {
  await ready(page);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluate(() => {
    const cart = document.querySelector('[data-testid="component-demo"]')!;
    cart.replaceChildren = () => { throw new Error('stage-nine-stop-removal-failed'); };
    try { window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })); }
    finally { delete (cart as unknown as { replaceChildren?: unknown }).replaceChildren; }
  });
  const result = await evidence(page, 'pagehide-cleanup-error');
  await test.info().attach('page-errors', { body: JSON.stringify(errors), contentType: 'application/json' });
  expect.soft(result.cleanups).toBe('1');
  expect.soft(result.list).toBe('');
  await expect.soft(by(page, 'actual-region')).toBeEmpty();
  await expect.soft(by(page, 'html-editor')).toBeDisabled();
});

test('S09-09 [VIEW-04 EFF] 실제 BFCache 왕복이 Cart State·구독·목록 DOM을 유지한다', async ({ playwright }, info) => {
  test.setTimeout(30000);
  const baseURL = process.env.MINI_REACT_NAVIGATION_BASE_URL ?? process.env.MINI_REACT_BASE_URL ?? 'http://127.0.0.1:5173';
  const browser = await playwright.chromium.launch({ channel: 'chrome', headless: true, ignoreDefaultArgs: ['--disable-back-forward-cache'] });
  const context = await browser.newContext();
  try {
    await context.addInitScript(() => window.addEventListener('pageshow', event => {
      (window as unknown as { stageNinePersisted: boolean }).stageNinePersisted = event.persisted;
    }));
    const page = await context.newPage();
    await page.goto(baseURL);
    await by(page, 'increase-quantity').click();
    await by(page, 'memo-input').fill('BFCache');
    await by(page, 'reverse-list').click();
    await by(page, 'keyed-list-demo').evaluate(host => {
      (window as unknown as { stageNineNodes: Element[] }).stageNineNodes = [...host.querySelectorAll('[data-key]')];
    });
    await page.goto(`${baseURL}/?stage-nine-departure=1`);
    await page.evaluate(() => history.back());
    await expect(page).toHaveURL(`${baseURL}/`);
    expect(await page.evaluate(() => (window as unknown as { stageNinePersisted: boolean }).stageNinePersisted)).toBe(true);
    await expect(by(page, 'quantity')).toHaveText('2');
    await expect(by(page, 'memo-input')).toHaveValue('BFCache');
    await expect(by(page, 'effect-setup-count')).toHaveText('1');
    await expect(by(page, 'effect-cleanup-count')).toHaveText('0');
    expect(await page.evaluate(() => {
      const nodes = (window as unknown as { stageNineNodes: Element[] }).stageNineNodes;
      const now = [...document.querySelectorAll('[data-testid="keyed-list-demo"] [data-key]')];
      return now.length === nodes.length && nodes.every((node, index) => node === now[index]);
    })).toBe(true);
    await by(page, 'change-product').click();
    await expect(by(page, 'component-demo').locator('article')).toContainText('재고: 8');
    await info.attach('browser-version', { body: browser.version(), contentType: 'text/plain' });
  } finally { await context.close(); await browser.close(); }
});
