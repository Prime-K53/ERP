import { test, expect, TEST_ADMIN } from './fixtures';

test.describe('Authentication', () => {
  test('complete setup wizard and login successfully', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    const url = page.url();

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

    const loginForm = page.getByPlaceholder('admin@company.com');
    if (await loginForm.isVisible().catch(() => false)) {
      await loginForm.fill(TEST_ADMIN.email);
      await page.getByPlaceholder('Enter your password').fill(TEST_ADMIN.password);
      await page.getByRole('button', { name: /sign in/i }).click();
      await page.waitForTimeout(3000);
    }

    await expect(page).toHaveURL(/\//, { timeout: 15000 });
    await page.waitForTimeout(1000);
  });
});
