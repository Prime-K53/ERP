import { test as base, type Page, type BrowserContext } from '@playwright/test';

export const TEST_ADMIN = {
  fullName: 'Admin User',
  username: 'admin',
  email: 'admin@company.com',
  password: 'Test123!',
};

let sharedContext: BrowserContext | null = null;
let sharedPage: Page | null = null;

export const test = base.extend<{ app: Page }>({
  app: async ({ browser }, use) => {
    if (!sharedContext) {
      sharedContext = await browser.newContext();
      sharedPage = await sharedContext.newPage();
      await sharedPage.goto('/');
      await sharedPage.waitForTimeout(2000);
    }
    await use(sharedPage!);
  },
});

export { expect } from '@playwright/test';
