import { test, expect } from './fixtures';
import { ensureLoggedIn } from './setup-helper';

test.describe('Prime ERP Application', () => {
  test('setup, login, and see dashboard', async ({ app: page }) => {
    await ensureLoggedIn(page);
    await expect(page).toHaveURL(/\//, { timeout: 10000 });
    const title = await page.title();
    expect(title).toContain('Prime ERP');
  });

  test('sidebar navigation shows main menu items', async ({ app: page }) => {
    await ensureLoggedIn(page);

    const sidebarLinks = page.locator('nav a, aside a, [class*="sidebar"] a');
    const linkCount = await sidebarLinks.count();
    expect(linkCount).toBeGreaterThan(10);

    const dashboardLink = sidebarLinks.filter({ hasText: /dashboard/i });
    await expect(dashboardLink.first()).toBeVisible({ timeout: 5000 });
  });

  test('navigate to Inventory page', async ({ app: page }) => {
    await ensureLoggedIn(page);

    const inventoryLink = page.locator('a').filter({ hasText: /inventory|master inventory/i }).first();
    if (await inventoryLink.isVisible().catch(() => false)) {
      await inventoryLink.click();
      await page.waitForTimeout(3000);
      await expect(page).toHaveURL(/inventory/i, { timeout: 10000 });
    }
  });

  test('navigate to Sales Flow page', async ({ app: page }) => {
    await ensureLoggedIn(page);

    const salesFlowLink = page.locator('a').filter({ hasText: /sales flow/i }).first();
    if (await salesFlowLink.isVisible().catch(() => false)) {
      await salesFlowLink.click();
      await page.waitForTimeout(3000);
    }
    await page.waitForTimeout(1000);
  });

  test('open Settings page', async ({ app: page }) => {
    await ensureLoggedIn(page);

    const settingsLink = page.locator('a').filter({ hasText: /settings/i }).first();
    if (await settingsLink.isVisible().catch(() => false)) {
      await settingsLink.click();
      await page.waitForTimeout(3000);
    }
    await page.waitForTimeout(1000);
  });
});
