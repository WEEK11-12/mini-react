import { expect, test, type Page } from '@playwright/test';
import { assertPrepend } from '../support/prepend-observation';

async function count(page: Page, name: string): Promise<number> {
  const value = (await page.getByTestId(name).innerText()).trim();
  expect(value, `${name} 계측 값은 숫자여야 한다`).toMatch(/^\d+$/);
  return Number(value);
}

test.beforeEach(async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.ok()).toBe(true);
});

test('[VIEW-04, COMP-03, STA-03, MEMO-02, QA-02] 수량 갱신은 합계를 계산하고 메모 갱신은 계산을 재사용한다', async ({ page }) => {
  const demo = page.getByTestId('component-demo');
  const quantity = await demo.getByTestId('quantity').innerText();
  const total = await demo.getByTestId('total').innerText();
  const computations = await count(page, 'memo-count');
  await demo.getByTestId('increase-quantity').click();
  await expect(demo.getByTestId('quantity')).not.toHaveText(quantity);
  await expect(demo.getByTestId('total')).not.toHaveText(total);
  expect(await count(page, 'memo-count')).toBe(computations + 1);
  await demo.getByTestId('memo-input').fill('수량과 무관한 메모');
  await expect(demo.getByTestId('memo-output')).toHaveText('수량과 무관한 메모');
  expect(await count(page, 'memo-count')).toBe(computations + 1);
});

test('[VIEW-04, EFF-02, EFF-03, EFF-04][임시 OPEN-08·11] 상품 변경은 구독을 교체하고 제거·재시작은 새 수명으로 시작한다', async ({ page }) => {
  const demo = page.getByTestId('component-demo');
  const initialQuantity = await demo.getByTestId('quantity').innerText();
  const setups = await count(page, 'effect-setup-count');
  const cleanups = await count(page, 'effect-cleanup-count');
  await demo.getByTestId('change-product').click();
  expect(await count(page, 'effect-setup-count')).toBe(setups + 1);
  expect(await count(page, 'effect-cleanup-count')).toBe(cleanups + 1);
  await demo.getByTestId('increase-quantity').click();
  await page.getByTestId('unmount-component').click();
  await expect(demo).toBeEmpty();
  expect(await count(page, 'effect-cleanup-count')).toBe(cleanups + 2);
  await page.getByTestId('restart-component').click();
  await expect(demo.getByTestId('quantity')).toHaveText(initialQuantity);
  expect(await count(page, 'effect-setup-count')).toBe(setups + 2);
});

test('[PATCH-03, COMP-03, QA-04] keyed 목록 역순과 앞 삽입은 기존 노드 참조를 유지한다', async ({ page }) => {
  const demo = page.getByTestId('keyed-list-demo');
  const initial = await demo.locator('[data-key]').evaluateAll((elements) => {
    const host = window as unknown as { listNodes?: Map<string, Element> };
    host.listNodes = new Map(elements.map((node) => [node.getAttribute('data-key')!, node]));
    return [...host.listNodes.keys()];
  });
  expect(initial.length).toBeGreaterThanOrEqual(3);
  await page.getByTestId('reverse-list').click();
  const before = await demo.locator('[data-key]').evaluateAll((elements) => {
    const host = window as unknown as {
      listNodes: Map<string, Element>;
      prependNodes?: Map<string, Element>;
    };
    const keys = elements.map((node) => node.getAttribute('data-key')!);
    const sameNodes = keys.map((key, index) => elements[index] === host.listNodes.get(key));
    host.prependNodes = new Map(keys.map((key, index) => [key, elements[index]]));
    return { keys, sameNodes };
  });
  expect(before.keys).toEqual([...initial].reverse());
  expect(before.sameNodes).toHaveLength(initial.length);
  before.sameNodes.forEach((same) => expect(same).toBe(true));

  await page.getByTestId('prepend-list-item').click();
  const after = await demo.locator('[data-key]').evaluateAll((elements, beforeKeys) => {
    const host = window as unknown as { prependNodes: Map<string, Element> };
    return {
      afterKeys: elements.map((node) => node.getAttribute('data-key')!),
      sameNodes: beforeKeys.map((key) =>
        elements.find((node) => node.getAttribute('data-key') === key) === host.prependNodes.get(key),
      ),
    };
  }, before.keys);
  // Checks count +1, new first key, exact old tail order, and every old node's identity.
  // The same assertion is exercised with no-op/deletion/clone DOM counterexamples in harness/.
  assertPrepend({ beforeKeys: before.keys, ...after });
});

test('[HIST-03, STA-02] Phase 1 이력 이동은 Phase 2 루트 State를 되돌리지 않는다', async ({ page }) => {
  const demo = page.getByTestId('component-demo');
  await page.getByTestId('html-editor').fill('<p>history-only</p>');
  await page.getByTestId('patch-button').click();
  await demo.getByTestId('increase-quantity').click();
  const quantity = await demo.getByTestId('quantity').innerText();
  await page.getByTestId('back-button').click();
  await expect(demo.getByTestId('quantity')).toHaveText(quantity);
  await page.getByTestId('forward-button').click();
  await expect(demo.getByTestId('quantity')).toHaveText(quantity);
});
