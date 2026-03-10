// @ts-check
const { chromium } = require('@playwright/test');

const BASE_URL = 'http://localhost:4000';
const ADMIN_EMAIL = 'admin@verein.de';
const ADMIN_PASSWORD = 'changeme123';

module.exports = async function globalSetup() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(`${BASE_URL}/login.html`);
  await page.fill('#login-form input[name="email"]', ADMIN_EMAIL);
  await page.fill('#login-form input[name="password"]', ADMIN_PASSWORD);
  await page.click('#login-form button[type="submit"]');
  await page.waitForURL(/\/(index\.html)?(\?.*)?$/, { timeout: 15000 });

  await page.context().storageState({ path: 'tests/.auth/admin.json' });
  await browser.close();
};
