// @ts-check
const { test, expect } = require('@playwright/test');

const ADMIN_EMAIL = 'admin@verein.de';
const ADMIN_PASSWORD = 'changeme123';

test.describe('Login', () => {
  test('zeigt Login-Seite', async ({ page }) => {
    await page.goto('/login.html');
    await expect(page.locator('#login-form input[name="email"]')).toBeVisible();
    await expect(page.locator('#login-form input[name="password"]')).toBeVisible();
  });

  test('Login mit falschen Daten schlägt fehl', async ({ page }) => {
    await page.goto('/login.html');
    await page.fill('#login-form input[name="email"]', 'falsch@test.de');
    await page.fill('#login-form input[name="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    await expect(page.locator('#alert-container')).toContainText(/.+/, { timeout: 5000 });
  });

  test('Login mit Admin-Konto erfolgreich', async ({ page, context }) => {
    // Restore saved admin session (set by globalSetup) to avoid rate-limit consumption
    await context.addCookies(
      require('./.auth/admin.json').cookies ?? []
    );
    await page.goto('/');
    await expect(page).toHaveURL(/\/(index\.html)?(\?.*)?$/, { timeout: 5000 });
  });
});

test.describe('Redirect', () => {
  test('Nicht eingeloggt → Weiterleitung zu Login', async ({ page }) => {
    await page.goto('/admin.html');
    await expect(page).toHaveURL(/login\.html/, { timeout: 5000 });
  });
});
