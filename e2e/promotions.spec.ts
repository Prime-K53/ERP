import { test, expect, TEST_ADMIN } from './fixtures';

/**
 * Promotions Admin — Portal-driven promotion engine.
 *
 * Walks through the premium admin flow: create a PORTAL promotion from the
 * rebuilt UI and verify it appears in the list with the correct channel and
 * status. Promotions are stored locally (IndexedDB) and shared with the
 * backend through Supabase, so this test runs against the frontend alone.
 */
test.describe('Promotions Admin', () => {
  test('create a PORTAL promotion and see it in the list', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    const url = page.url();

    // Complete the first-run setup wizard if present.
    if (url.includes('setup')) {
      await page.getByPlaceholder('John Doe').first().fill(TEST_ADMIN.fullName);

      const emailInput = page.getByPlaceholder('admin@co.com');
      if (await emailInput.isVisible()) {
        await emailInput.fill(TEST_ADMIN.email);
      }

      const usernameInput = page.getByPlaceholder('admin_prime');
      if (await usernameInput.isVisible()) {
        await usernameInput.fill(TEST_ADMIN.username);
      }

      await page.getByRole('button', { name: /continue/i }).click();
      await page.waitForTimeout(500);

      const passwordInput = page.locator('input[type="password"]').first();
      if (await passwordInput.isVisible()) {
        await passwordInput.fill(TEST_ADMIN.password);
        const confirmInput = page.locator('input[type="password"]').nth(1);
        if (await confirmInput.isVisible()) {
          await confirmInput.fill(TEST_ADMIN.password);
        }
      }

      const finishBtn = page.getByRole('button', { name: /complete|finish|submit|setup/i });
      if (await finishBtn.isVisible()) {
        await finishBtn.click();
        await page.waitForTimeout(3000);
      }
    }

    // Sign in if the login form is shown.
    const loginForm = page.getByPlaceholder('admin@company.com');
    if (await loginForm.isVisible().catch(() => false)) {
      await loginForm.fill(TEST_ADMIN.email);
      await page.getByPlaceholder('Enter your password').fill(TEST_ADMIN.password);
      await page.getByRole('button', { name: /sign in/i }).click();
      await page.waitForTimeout(3000);
    }

    // ── Open the Promotions admin ──
    await page.goto('/admin/promotions');
    await expect(page.getByRole('button', { name: /new promotion/i })).toBeVisible({ timeout: 20000 });

    // ── Create a PORTAL promotion ──
    await page.getByRole('button', { name: /new promotion/i }).click();

    const formCard = page.locator('div.prime-card', { has: page.getByPlaceholder('e.g. August Portal Promotion') });
    await expect(formCard).toBeVisible();

    await formCard.getByPlaceholder('e.g. August Portal Promotion').fill('E2E Portal Promotion');
    await formCard.getByPlaceholder('AUGUST10').fill('E2E10');

    // Channel → Portal Only (PORTAL). Scoped to the form card: the toolbar's
    // channel filter renders "PORTAL" (uppercase) so it can't collide, but
    // scoping keeps the locator robust regardless.
    const channelSelect = formCard
      .locator('select')
      .filter({ has: formCard.getByRole('option', { name: /portal only/i }) });
    await channelSelect.selectOption({ label: 'Portal Only' });

    // Discount type stays Percentage (default); set the value.
    await formCard.getByPlaceholder('e.g. 10').fill('10');

    // Status → Active. Scoped to the form card — the toolbar's status filter
    // select also contains an 'active' option.
    const statusSelect = formCard
      .locator('select')
      .filter({ has: formCard.getByRole('option', { name: 'active', exact: true }) });
    await statusSelect.selectOption({ label: 'Active' });

    // Submit — the form card's own create button (avoids the empty-state one).
    await formCard.getByRole('button', { name: /create promotion/i }).click();

    // ── Assert it appears in the list with correct metadata ──
    await expect(page.getByText('E2E Portal Promotion').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('E2E10').first()).toBeVisible();
    await expect(page.getByText('PORTAL', { exact: true }).first()).toBeVisible();

    // Active status badge should be shown.
    await expect(page.getByText('active', { exact: true }).first()).toBeVisible();
  });
});
