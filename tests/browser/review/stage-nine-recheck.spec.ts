import { expect, test, type Page } from '@playwright/test';

const by = (page: Page, id: string) => page.getByTestId(id);
async function ready(page: Page) {
  await page.goto('/');
  await expect(by(page, 'quantity')).toHaveText('1');
}
async function failCart(page: Page) {
  await page.evaluate(() => {
    const text = document.querySelector('[data-testid="quantity"]')!.firstChild!;
    const original = Object.getOwnPropertyDescriptor(Node.prototype, 'nodeValue')!;
    Object.defineProperty(text, 'nodeValue', {
      configurable: true,
      get() { return original.get!.call(this); },
      set(value) {
        original.set!.call(this, value);
        delete (this as unknown as { nodeValue?: string }).nodeValue;
        throw new Error('recheck-cart-write');
      },
    });
  });
  await by(page, 'increase-quantity').click();
  await expect(by(page, 'component-demo')).toHaveJSProperty('inert', true);
}
async function failList(page: Page) {
  await page.evaluate(() => {
    const list = document.querySelector('[data-testid="keyed-list-demo"] ul')!;
    const original = list.insertBefore;
    list.insertBefore = function <T extends Node>(node: T, child: Node | null): T {
      original.call(this, node, child);
      delete (this as unknown as { insertBefore?: unknown }).insertBefore;
      throw new Error('recheck-list-move');
    };
  });
  await by(page, 'reverse-list').click();
  await expect(by(page, 'keyed-list-demo')).toHaveJSProperty('inert', true);
}
async function statusEvidence(page: Page, label: string) {
  const result = await page.evaluate(() => ({
    status: document.querySelector('[data-testid="component-status"]')!.textContent,
    cartInert: (document.querySelector('[data-testid="component-demo"]') as HTMLElement).inert,
    listInert: (document.querySelector('[data-testid="keyed-list-demo"]') as HTMLElement).inert,
    list: [...document.querySelectorAll('[data-testid="list-item"]')].map(node => node.textContent),
    quantity: document.querySelector('[data-testid="quantity"]')?.textContent,
    setups: document.querySelector('[data-testid="effect-setup-count"]')!.textContent,
    cleanups: document.querySelector('[data-testid="effect-cleanup-count"]')!.textContent,
  }));
  await test.info().attach(label, { body: JSON.stringify(result), contentType: 'application/json' });
  return result;
}

test('S09-R01 F1/F2: 목록만 faulted일 때 정상 Cart 갱신·제거는 목록 원인을 보존하며 재시작 뒤 해제한다', async ({ page }) => {
  await ready(page);
  await failList(page);
  const message = await by(page, 'component-status').textContent();
  expect(message).toMatch(/목록: .*recheck-list-move/);
  expect(message).not.toContain('장바구니:');
  await expect(by(page, 'component-demo')).toHaveJSProperty('inert', false);
  await by(page, 'increase-quantity').click();
  await by(page, 'memo-input').fill('healthy root');
  await expect(by(page, 'quantity')).toHaveText('2');
  await expect(by(page, 'component-status')).toHaveText(message!);
  await by(page, 'unmount-component').click();
  await expect(by(page, 'component-status')).toHaveText(message!);
  await expect(by(page, 'keyed-list-demo')).toHaveJSProperty('inert', true);
  await statusEvidence(page, 'list-only-fault-preserved');
  await by(page, 'restart-list').click();
  await expect(by(page, 'component-status')).toBeEmpty();
  await expect(by(page, 'keyed-list-demo')).toHaveJSProperty('inert', false);
  await expect(by(page, 'component-demo')).toHaveJSProperty('inert', false);
  await by(page, 'reverse-list').click();
  expect(await by(page, 'list-item').allTextContents()).toEqual(['c', 'b', 'a']);
});

test('S09-R02 F2: Cart 단독 오류를 목록 동작이 보존하고 두 루트 오류는 각각 보존·복구한다', async ({ page }) => {
  await ready(page);
  await failCart(page);
  const message = await by(page, 'component-status').textContent();
  expect(message).toMatch(/장바구니: .*recheck-cart-write/);
  expect(message).not.toContain('목록:');
  await by(page, 'prepend-list-item').click();
  await expect(by(page, 'keyed-list-demo')).toHaveJSProperty('inert', false);
  await expect(by(page, 'component-status')).toHaveText(message!);
  await statusEvidence(page, 'cart-only-fault-preserved');
  await failList(page);
  await expect(by(page, 'component-status')).toContainText(/장바구니: .*recheck-cart-write/);
  await expect(by(page, 'component-status')).toContainText(/목록: .*recheck-list-move/);
  await expect(by(page, 'remove-list-item')).toBeDisabled();
  await expect(by(page, 'component-status')).toContainText(/목록: .*recheck-list-move/);
  await statusEvidence(page, 'both-faults-preserved');
  await by(page, 'restart-component').click();
  await expect(by(page, 'component-status')).toContainText('recheck-list-move');
  await by(page, 'restart-list').click();
  await expect(by(page, 'component-status')).toBeEmpty();
  await expect(by(page, 'component-demo')).toHaveJSProperty('inert', false);
  await expect(by(page, 'keyed-list-demo')).toHaveJSProperty('inert', false);
  await expect(by(page, 'effect-cleanup-count')).toHaveText('1');
  await expect(by(page, 'effect-setup-count')).toHaveText('2');
});

for (const root of ['cart', 'list'] as const) {
  test(`S09-R03-${root} F1: 재시작 mount 부분 실패 중에는 inert를 유지하고 후속 성공 때만 해제한다`, async ({ page }) => {
    await ready(page);
    if (root === 'cart') await failCart(page);
    else await failList(page);
    await page.evaluate(root => {
      const selector = root === 'cart' ? 'component-demo' : 'keyed-list-demo';
      const host = document.querySelector(`[data-testid="${selector}"]`)!;
      const original = host.appendChild;
      host.appendChild = function <T extends Node>(node: T): T {
        original.call(this, node);
        delete (this as unknown as { appendChild?: unknown }).appendChild;
        throw new Error(`recheck-${root}-mount-write`);
      };
    }, root);
    await by(page, root === 'cart' ? 'restart-component' : 'restart-list').click();
    const region = by(page, root === 'cart' ? 'component-demo' : 'keyed-list-demo');
    await expect(region).toHaveJSProperty('inert', true);
    await expect(by(page, 'component-status')).toContainText(`recheck-${root}-mount-write`);
    await expect(by(page, 'component-status')).toContainText('초기화·시작');
    await statusEvidence(page, `${root}-restart-mount-failed`);
    await by(page, root === 'cart' ? 'restart-component' : 'restart-list').click();
    await expect(region).toHaveJSProperty('inert', false);
    await expect(by(page, 'component-status')).toBeEmpty();
    await statusEvidence(page, `${root}-restart-mount-succeeded`);
  });
}

const shutdownCases = [
  { name: 'Cart 오류만', cart: true, list: false, phaseOne: false },
  { name: '목록 오류만', cart: false, list: true, phaseOne: false },
  { name: '두 루트 오류', cart: true, list: true, phaseOne: false },
  { name: '두 루트와 Phase 1 오류', cart: true, list: true, phaseOne: true },
  { name: 'Phase 1 오류만', cart: false, list: false, phaseOne: true },
];
for (const scenario of shutdownCases) {
  test(`S09-R04 F3: ${scenario.name}에서도 독립 종료를 모두 시도하고 원본 오류를 집계한다`, async ({ page }, info) => {
    await ready(page);
    const result = await page.evaluate(scenario => {
      const cart = document.querySelector('[data-testid="component-demo"]') as HTMLElement;
      const list = document.querySelector('[data-testid="keyed-list-demo"]') as HTMLElement;
      const actual = document.querySelector('[data-testid="actual-region"]') as HTMLElement;
      const sources = { cart: new Error('recheck-stop-cart'), list: new Error('recheck-stop-list'), phaseOne: new Error('recheck-stop-phase-one') };
      const attempts: string[] = [];
      const entries = [{ name: 'cart', host: cart, fail: scenario.cart }, { name: 'list', host: list, fail: scenario.list }, { name: 'phaseOne', host: actual, fail: scenario.phaseOne }] as const;
      for (const entry of entries) {
        const original = entry.host.replaceChildren;
        entry.host.replaceChildren = function (...nodes: (Node | string)[]) {
          attempts.push(entry.name);
          if (entry.fail) throw sources[entry.name];
          original.apply(this, nodes);
        };
      }
      let captured: unknown;
      const capture = (event: ErrorEvent) => { captured = event.error; event.preventDefault(); };
      window.addEventListener('error', capture);
      try { window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })); }
      finally {
        window.removeEventListener('error', capture);
        for (const { host } of entries) delete (host as unknown as { replaceChildren?: unknown }).replaceChildren;
      }
      const leaves: unknown[] = [];
      const describe = (error: unknown): unknown => {
        if (error instanceof AggregateError) return { name: error.name, message: error.message, errors: error.errors.map(describe) };
        leaves.push(error);
        return { name: error instanceof Error ? error.name : typeof error, message: error instanceof Error ? error.message : String(error) };
      };
      const tree = describe(captured);
      const expectedLeaves = entries.filter(entry => entry.fail).map(entry => sources[entry.name]);
      const outer = captured instanceof AggregateError ? captured : undefined;
      const demo = outer?.errors.find(error => error instanceof AggregateError && error.message === 'Component demo removal failed') as AggregateError | undefined;
      return {
        attempts, tree,
        leafCount: leaves.length,
        leavesAreOriginal: leaves.length === expectedLeaves.length && leaves.every((error, index) => error === expectedLeaves[index]),
        outerCount: outer?.errors.length,
        demoCount: demo?.errors.length,
        cartNodes: cart.childNodes.length, listNodes: list.childNodes.length, actualNodes: actual.childNodes.length,
        previewNodes: document.querySelector('[data-testid="preview-region"]')!.childNodes.length,
        cleanupCount: document.querySelector('[data-testid="effect-cleanup-count"]')!.textContent,
        phaseOneStatus: document.querySelector('[data-testid="status"]')!.textContent,
        editorDisabled: (document.querySelector('[data-testid="html-editor"]') as HTMLTextAreaElement).disabled,
      };
    }, scenario);
    await info.attach('shutdown-aggregation', { body: JSON.stringify(result), contentType: 'application/json' });
    expect(result.attempts).toEqual(['cart', 'list', 'phaseOne']);
    expect(result.leavesAreOriginal).toBe(true);
    expect(result.leafCount).toBe(Number(scenario.cart) + Number(scenario.list) + Number(scenario.phaseOne));
    expect(result.outerCount).toBe(Number(scenario.cart || scenario.list) + Number(scenario.phaseOne));
    if (scenario.cart || scenario.list) expect(result.demoCount).toBe(Number(scenario.cart) + Number(scenario.list));
    else expect(result.demoCount).toBeUndefined();
    expect(result.cleanupCount).toBe('1');
    if (!scenario.cart) expect(result.cartNodes).toBe(0);
    if (!scenario.list) expect(result.listNodes).toBe(0);
    if (!scenario.phaseOne) {
      expect(result.actualNodes).toBe(0);
      expect(result.previewNodes).toBe(0);
      expect(result.editorDisabled).toBe(true);
      expect(result.phaseOneStatus).toContain('종료');
    }
  });
}
