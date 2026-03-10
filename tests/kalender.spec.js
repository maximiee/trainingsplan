// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Kalender', () => {
  test.use({ storageState: 'tests/.auth/admin.json' });

  test('Wochenkalender wird geladen', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#week-label')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#calendar-container')).toBeVisible({ timeout: 5000 });
  });

  test('Navigation vor/zurück wechselt die Woche', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#week-label')).not.toHaveText('…', { timeout: 5000 });
    const getWeekLabel = () => page.locator('#week-label').textContent();
    const initial = await getWeekLabel();
    await page.click('#btn-next');
    const next = await getWeekLabel();
    expect(next).not.toBe(initial);
    await page.click('#btn-prev');
    const back = await getWeekLabel();
    expect(back).toBe(initial);
  });
});
