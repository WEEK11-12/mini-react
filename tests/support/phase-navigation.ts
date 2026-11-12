import { expect, type Page } from '@playwright/test';

/** Use real tab controls; never unhide panels or force clicks in the page. */
export async function selectPhase(page: Page, phase: 'one' | 'two'): Promise<void> {
  const tab = page.locator(`#phase-${phase}-tab`);
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator(`#phase-${phase}`)).toBeVisible();
  const other = phase === 'one' ? 'two' : 'one';
  await expect(page.locator(`#phase-${other}-tab`)).toHaveAttribute('aria-selected', 'false');
  await expect(page.locator(`#phase-${other}`)).toBeHidden();
}
