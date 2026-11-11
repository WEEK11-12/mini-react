import { expect, test } from '@playwright/test';
import { selectPhase } from '../support/phase-navigation';

test.beforeEach(async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.ok()).toBe(true);
  await selectPhase(page, 'two');
});

test('[VIEW-01, HIST-03] 편집·적용·이동 안내는 실제 결과와 편집 폐기를 구분한다', async ({ page }) => {
  await selectPhase(page, 'one');
  await expect(page.getByRole('heading', { name: 'DOM·컴포넌트 실험실' })).toBeVisible();
  await expect(page.getByTestId('status')).toContainText('적용 이력 1 / 1');
  await page.getByTestId('html-editor').fill('<h3>새 제목</h3>');
  await expect(page.getByTestId('status')).toContainText('미적용 편집');
  await expect(page.getByTestId('actual-region')).not.toContainText('새 제목');
  await page.getByTestId('patch-button').click();
  await expect(page.getByTestId('actual-region')).toHaveText('새 제목');
  await page.getByTestId('html-editor').fill('<h3>아직 미적용</h3>');
  await page.getByTestId('back-button').click();
  await expect(page.getByTestId('status')).toContainText('미적용 편집 폐기');
  await expect(page.getByTestId('html-editor')).not.toContainText('아직 미적용');
  await page.getByTestId('html-editor').fill('<script>금지</script>');
  await expect(page.getByTestId('status')).toContainText('마지막 유효 미리보기를 유지');
  await expect(page.getByTestId('patch-button')).toBeDisabled();
});

test('[VIEW-04, EFF-04] 장바구니 종료·초기화는 수명과 누적 계측만 바꾸고 목록은 보존한다', async ({ page }) => {
  await page.getByTestId('reverse-list').click();
  const order = await page.getByTestId('list-order').innerText();
  await page.getByTestId('memo-input').fill('폐기할 메모');
  await page.getByTestId('increase-quantity').click();
  const calculations = Number(await page.getByTestId('memo-count').innerText());
  await page.getByTestId('unmount-component').click();
  await expect(page.getByTestId('cart-state')).toHaveText('종료됨');
  await expect(page.getByTestId('cart-empty')).toBeVisible();
  await expect(page.getByTestId('unmount-component')).toBeDisabled();
  await expect(page.getByTestId('restart-component')).toBeFocused();
  await expect(page.getByTestId('list-order')).toHaveText(order);
  await page.getByTestId('restart-component').click();
  await expect(page.getByTestId('cart-state')).toHaveText('실행 중');
  await expect(page.getByTestId('quantity')).toHaveText('1');
  await expect(page.getByTestId('memo-input')).toHaveValue('');
  await expect(page.getByTestId('list-order')).toHaveText(order);
  expect(Number(await page.getByTestId('memo-count').innerText())).toBeGreaterThan(calculations);
});

test('[VIEW-04] 목록 오류는 전용 복구로 초기화하고 장바구니의 정상 조작으로 지워지지 않는다', async ({ page }) => {
  await page.evaluate(() => {
    const list = document.querySelector('[data-testid="keyed-list-demo"] ul')!;
    const original = list.insertBefore;
    list.insertBefore = function <T extends Node>(node: T, child: Node | null): T {
      original.call(this, node, child);
      delete (this as unknown as { insertBefore?: unknown }).insertBefore;
      throw new Error('ux-list-fault');
    };
  });
  await page.getByTestId('reverse-list').click();
  await expect(page.getByTestId('list-state')).toHaveText('오류로 중단됨');
  await expect(page.getByTestId('keyed-list-demo')).toHaveJSProperty('inert', true);
  await expect(page.getByTestId('restart-list')).toBeVisible();
  await expect(page.getByTestId('component-status')).toContainText('ux-list-fault');
  await page.getByTestId('increase-quantity').click();
  await expect(page.getByTestId('quantity')).toHaveText('2');
  await page.getByTestId('restart-component').click();
  await expect(page.getByTestId('list-state')).toHaveText('오류로 중단됨');
  await expect(page.getByTestId('component-status')).toContainText('ux-list-fault');
  await page.getByTestId('restart-list').click();
  await expect(page.getByTestId('list-state')).toHaveText('실행 중');
  await expect(page.getByTestId('prepend-list-item')).toBeFocused();
  await expect(page.getByTestId('list-order')).toHaveText('a → b → c');
  await expect(page.getByTestId('keyed-list-demo')).toHaveJSProperty('inert', false);
  for (let i = 0; i < 3; i += 1) await page.getByTestId('remove-list-item').click();
  await expect(page.getByTestId('list-empty')).toBeVisible();
  await expect(page.getByTestId('reverse-list')).toBeDisabled();
  await expect(page.getByTestId('remove-list-item')).toBeDisabled();
  await page.getByTestId('prepend-list-item').click();
  await expect(page.getByTestId('list-count')).toHaveText('1');
});

test('[VIEW-04, EFF-04] 장바구니 내부 조작의 fault는 포커스를 복구 버튼으로 옮기고 실패한 mount 동안 차단한다', async ({ page }) => {
  await page.evaluate(() => {
    const text = document.querySelector('[data-testid="quantity"]')!.firstChild!;
    const original = Object.getOwnPropertyDescriptor(Node.prototype, 'nodeValue')!;
    Object.defineProperty(text, 'nodeValue', {
      configurable: true,
      get() { return original.get!.call(this); },
      set(value) {
        original.set!.call(this, value);
        delete (this as unknown as { nodeValue?: string }).nodeValue;
        throw new Error('ux-cart-fault');
      },
    });
  });
  await page.getByTestId('increase-quantity').click();
  await expect(page.getByTestId('cart-state')).toHaveText('오류로 중단됨');
  await expect(page.getByTestId('restart-component')).toBeFocused();
  await expect(page.getByTestId('component-demo')).toHaveJSProperty('inert', true);
  await page.evaluate(() => {
    const host = document.querySelector('[data-testid="component-demo"]')!;
    const original = host.appendChild;
    host.appendChild = function <T extends Node>(node: T): T {
      original.call(this, node);
      delete (this as unknown as { appendChild?: unknown }).appendChild;
      throw new Error('ux-cart-restart');
    };
  });
  await page.getByTestId('restart-component').click();
  await expect(page.getByTestId('cart-state')).toHaveText('오류로 중단됨');
  await expect(page.getByTestId('cart-error')).toContainText('ux-cart-restart');
  await expect(page.getByTestId('component-demo')).toHaveJSProperty('inert', true);
  await page.getByTestId('restart-component').click();
  await expect(page.getByTestId('cart-state')).toHaveText('실행 중');
  await expect(page.getByTestId('component-demo')).toHaveJSProperty('inert', false);
});

test('[EFF-04] 정리 예외로 DOM 제거가 끝난 초기화는 새 mount를 건너뛰고 경고를 보존한다', async ({ page }) => {
  const setups = await page.getByTestId('effect-setup-count').innerText();
  await page.evaluate(() => {
    const count = document.querySelector('[data-testid="effect-cleanup-count"]')!;
    const original = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent')!;
    Object.defineProperty(count, 'textContent', {
      configurable: true,
      set(value) {
        original.set!.call(this, value);
        delete (this as unknown as { textContent?: string }).textContent;
        throw new Error('ux-cleanup-fault');
      },
    });
  });
  await page.getByTestId('restart-component').click();
  await expect(page.getByTestId('cart-state')).toHaveText('종료됨');
  await expect(page.getByTestId('component-demo')).toBeEmpty();
  await expect(page.getByTestId('cart-error')).toContainText('정리 오류');
  await expect(page.getByTestId('cart-error')).toContainText('새 시작 미실행');
  await expect(page.getByTestId('effect-setup-count')).toHaveText(setups);
  await page.getByTestId('restart-component').click();
  await expect(page.getByTestId('cart-state')).toHaveText('실행 중');
  await expect(page.getByTestId('cart-error')).toContainText('이전 자원 해제는 확인되지 않았습니다');
  await expect(page.getByTestId('effect-setup-count')).not.toHaveText(setups);
});

test('[EFF-04] DOM 제거 실패는 faulted와 inert를 유지하고 다음 명시적 초기화에서 재시도한다', async ({ page }) => {
  await page.evaluate(() => {
    const host = document.querySelector('[data-testid="component-demo"]')!;
    host.replaceChildren = function () {
      delete (this as unknown as { replaceChildren?: unknown }).replaceChildren;
      throw new Error('ux-remove-fault');
    };
  });
  await page.getByTestId('restart-component').click();
  await expect(page.getByTestId('cart-state')).toHaveText('오류로 중단됨');
  await expect(page.getByTestId('component-demo')).toHaveJSProperty('inert', true);
  await expect(page.getByTestId('cart-error')).toContainText('ux-remove-fault');
  await page.getByTestId('restart-component').click();
  await expect(page.getByTestId('cart-state')).toHaveText('실행 중');
  await expect(page.getByTestId('component-demo')).toHaveJSProperty('inert', false);
  await expect(page.getByTestId('cart-error')).toContainText('이전 자원 해제는 확인되지 않았습니다');
});

test('[EFF-04] idle Effect 오류는 실행 상태와 분리하고 일반 State 갱신은 오류를 지우지 않는다', async ({ page }) => {
  await page.evaluate(() => {
    const count = document.querySelector('[data-testid="effect-setup-count"]')!;
    const original = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent')!;
    Object.defineProperty(count, 'textContent', {
      configurable: true,
      set(value) {
        original.set!.call(this, value);
        delete (this as unknown as { textContent?: string }).textContent;
        throw new Error('ux-effect-fault');
      },
    });
  });
  await page.getByTestId('change-product').click();
  await expect(page.getByTestId('cart-state')).toHaveText('실행 중');
  await expect(page.getByTestId('cart-error')).toContainText('ux-effect-fault');
  await page.getByTestId('increase-quantity').click();
  await expect(page.getByTestId('cart-error')).toContainText('ux-effect-fault');
  await page.getByTestId('prepend-list-item').click();
  await expect(page.getByTestId('cart-error')).toContainText('ux-effect-fault');
  await page.getByTestId('restart-component').click();
  await expect(page.getByTestId('cart-error')).not.toContainText('ux-effect-fault');
  await expect(page.getByTestId('cart-error')).toContainText('자원 정리 완료는 확인되지 않았습니다');
});

test('[EFF-04] DOM 복구 중 구독 정리 실패는 시도를 세고 새 mount 후에도 경고를 보존한다', async ({ page }) => {
  await page.evaluate(() => {
    const text = document.querySelector('[data-testid="quantity"]')!.firstChild!;
    const originalValue = Object.getOwnPropertyDescriptor(Node.prototype, 'nodeValue')!;
    Object.defineProperty(text, 'nodeValue', {
      configurable: true,
      get() { return originalValue.get!.call(this); },
      set(value) {
        originalValue.set!.call(this, value);
        delete (this as unknown as { nodeValue?: string }).nodeValue;
        throw new Error('ux-recovery-write');
      },
    });
    const originalDelete = Set.prototype.delete;
    Set.prototype.delete = function (value) {
      if (typeof value === 'function') {
        Set.prototype.delete = originalDelete;
        throw new Error('ux-recovery-cleanup');
      }
      return originalDelete.call(this, value);
    };
  });
  await page.getByTestId('increase-quantity').click();
  await expect(page.getByTestId('cart-state')).toHaveText('오류로 중단됨');
  await expect(page.getByTestId('cart-error')).toContainText('ux-recovery-cleanup');
  await expect(page.getByTestId('effect-cleanup-count')).toHaveText('1');
  await page.getByTestId('restart-component').click();
  await expect(page.getByTestId('cart-state')).toHaveText('실행 중');
  await expect(page.getByTestId('cart-error')).toContainText('ux-recovery-cleanup');
  await expect(page.getByTestId('cart-error')).toContainText('이전 자원 해제는 확인되지 않았습니다');
  await expect(page.getByTestId('effect-cleanup-count')).toHaveText('1');
});

test('[EFF-04] 상품 변경의 실패한 구독 정리 시도도 누적 횟수에 포함한다', async ({ page }) => {
  await page.evaluate(() => {
    const originalDelete = Set.prototype.delete;
    Set.prototype.delete = function (value) {
      if (typeof value === 'function') {
        Set.prototype.delete = originalDelete;
        throw new Error('ux-product-cleanup');
      }
      return originalDelete.call(this, value);
    };
  });
  await page.getByTestId('change-product').click();
  await expect(page.getByTestId('cart-state')).toHaveText('실행 중');
  await expect(page.getByTestId('cart-error')).toContainText('ux-product-cleanup');
  await expect(page.getByTestId('effect-cleanup-count')).toHaveText('1');
});

test('[EFF-04] 계측 표시 쓰기 실패에도 복구 cleanup의 실제 구독 해제를 수행한다', async ({ page }) => {
  await page.evaluate(() => {
    const count = document.querySelector('[data-testid="effect-cleanup-count"]')!;
    const content = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent')!;
    Object.defineProperty(count, 'textContent', {
      configurable: true,
      set(value) {
        content.set!.call(this, value);
        delete (this as unknown as { textContent?: string }).textContent;
        throw new Error('ux-count-display');
      },
    });
    const probe = window as unknown as { cleanupAttempts: number; remainingSubscribers: number };
    probe.cleanupAttempts = 0;
    const originalDelete = Set.prototype.delete;
    Set.prototype.delete = function (value) {
      const removed = originalDelete.call(this, value);
      if (typeof value === 'function') {
        probe.cleanupAttempts += 1;
        probe.remainingSubscribers = this.size;
      }
      return removed;
    };
    const text = document.querySelector('[data-testid="quantity"]')!.firstChild!;
    const originalValue = Object.getOwnPropertyDescriptor(Node.prototype, 'nodeValue')!;
    Object.defineProperty(text, 'nodeValue', {
      configurable: true,
      get() { return originalValue.get!.call(this); },
      set(value) {
        originalValue.set!.call(this, value);
        delete (this as unknown as { nodeValue?: string }).nodeValue;
        throw new Error('ux-write-before-cleanup');
      },
    });
  });
  await page.getByTestId('increase-quantity').click();
  await expect(page.getByTestId('cart-state')).toHaveText('오류로 중단됨');
  await expect(page.getByTestId('effect-cleanup-count')).toHaveText('1');
  expect(await page.evaluate(() => {
    const probe = window as unknown as { cleanupAttempts: number; remainingSubscribers: number };
    return [probe.cleanupAttempts, probe.remainingSubscribers];
  })).toEqual([1, 0]);
  await page.getByTestId('restart-component').click();
  await expect(page.getByTestId('cart-state')).toHaveText('실행 중');
});

test('[VIEW-01, VIEW-04] 모바일 너비에서 카드와 편집창이 화면 안에 있고 조작을 키보드로 실행한다', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 760 });
  await selectPhase(page, 'one');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  await page.getByTestId('html-editor').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('html-editor')).toBeInViewport();
  await selectPhase(page, 'two');
  await page.getByTestId('prepend-list-item').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('list-count')).toHaveText('4');
  await expect(page.getByTestId('list-order')).toContainText('new-1');
});
