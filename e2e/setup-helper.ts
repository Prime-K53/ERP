import type { Page } from '@playwright/test';
import { TEST_ADMIN } from './fixtures';

export async function completeSetup(page: Page) {
  const companyInput = page.getByPlaceholder(/company/i).first();
  if (await companyInput.isVisible().catch(() => false)) {
    await companyInput.fill('Test Company');

    const phoneInput = page.getByPlaceholder(/phone/i).first();
    if (await phoneInput.isVisible().catch(() => false)) {
      await phoneInput.fill('1234567890');
    }

    const continueBtn = page.getByRole('button', { name: /continue/i });
    for (let i = 0; i < 3; i++) {
      if (await continueBtn.isVisible().catch(() => false)) {
        await continueBtn.click();
        await page.waitForTimeout(500);
      }
    }
  }

  const nameInput = page.getByPlaceholder('John Doe');
  if (await nameInput.isVisible().catch(() => false)) {
    await nameInput.fill(TEST_ADMIN.fullName);
    const emailInput = page.getByPlaceholder('admin@co.com');
    if (await emailInput.isVisible().catch(() => false)) {
      await emailInput.fill(TEST_ADMIN.email);
    }
    const usernameInput = page.getByPlaceholder('admin_prime');
    if (await usernameInput.isVisible().catch(() => false)) {
      await usernameInput.fill(TEST_ADMIN.username);
    }
    const continueBtn = page.getByRole('button', { name: /continue/i });
    if (await continueBtn.isVisible().catch(() => false)) {
      await continueBtn.click();
      await page.waitForTimeout(500);
    }
  }

  const pwdInput = page.locator('input[type="password"]').first();
  if (await pwdInput.isVisible().catch(() => false)) {
    await pwdInput.fill(TEST_ADMIN.password);
    const confirmInput = page.locator('input[type="password"]').nth(1);
    if (await confirmInput.isVisible().catch(() => false)) {
      await confirmInput.fill(TEST_ADMIN.password);
    }
    const finishBtn = page.getByRole('button', { name: /complete|finish|submit/i });
    if (await finishBtn.isVisible().catch(() => false)) {
      await finishBtn.click();
      await page.waitForTimeout(3000);
    }
  }
}

export async function login(page: Page) {
  const emailInput = page.getByPlaceholder('admin@company.com');
  if (await emailInput.isVisible().catch(() => false)) {
    await emailInput.fill(TEST_ADMIN.email);
    await page.getByPlaceholder('Enter your password').fill(TEST_ADMIN.password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForTimeout(3000);
  }
}

export async function ensureLoggedIn(page: Page) {
  await page.goto('/');
  await page.waitForTimeout(2000);

  const isSetup = await page.getByPlaceholder('John Doe').isVisible().catch(() => false);
  if (isSetup) {
    await completeSetup(page);
  }

  await login(page);

  await page.waitForURL('**/');
  await page.waitForTimeout(2000);
}
