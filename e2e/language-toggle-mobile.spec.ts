import { test, expect, devices } from '@playwright/test';

const PROD_URL = 'https://readflaneur.com';

test.use({
  ...devices['Pixel 5'],
  browserName: 'chromium',
});

test.describe('Mobile Language Toggle', () => {
  test.beforeEach(async ({ page }) => {
    // Clear language preference so each test starts in English
    await page.goto(`${PROD_URL}/feed`, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.removeItem('flaneur-language'));
  });

  test('globe icon is visible and clickable on mobile', async ({ page }) => {
    await page.goto(`${PROD_URL}/feed`, { waitUntil: 'networkidle' });

    // There are two toggle buttons (desktop + mobile) - get the visible one
    const toggle = page.getByTestId('language-toggle').and(page.locator(':visible'));
    await expect(toggle).toBeVisible({ timeout: 10000 });

    // Should contain an SVG (globe icon, not Union Jack)
    const svg = toggle.locator('svg');
    await expect(svg).toBeVisible();

    // Globe has a circle element (Union Jack did not)
    const circle = svg.locator('circle');
    await expect(circle).toHaveCount(1);
  });

  test('clicking globe opens language picker when browser is English', async ({ page }) => {
    await page.goto(`${PROD_URL}/feed`, { waitUntil: 'networkidle' });

    const toggle = page.getByTestId('language-toggle').and(page.locator(':visible'));
    await expect(toggle).toBeVisible({ timeout: 10000 });

    // Click the globe
    await toggle.click();

    // Language picker dropdown should appear
    const picker = page.getByTestId('language-picker');
    await expect(picker).toBeVisible({ timeout: 5000 });

    // Should show language options
    await expect(picker.getByText('English (Original)')).toBeVisible();
    await expect(picker.getByText('Svenska')).toBeVisible();
    await expect(picker.getByText('Français')).toBeVisible();
    await expect(picker.getByText('Deutsch')).toBeVisible();
    await expect(picker.getByText('Español')).toBeVisible();
  });

  test('selecting a language activates translation and shows badge', async ({ page }) => {
    await page.goto(`${PROD_URL}/feed`, { waitUntil: 'networkidle' });

    const toggle = page.getByTestId('language-toggle').and(page.locator(':visible'));
    await expect(toggle).toBeVisible({ timeout: 10000 });

    // Click globe to open picker
    await toggle.click();
    const picker = page.getByTestId('language-picker');
    await expect(picker).toBeVisible({ timeout: 5000 });

    // Select Svenska
    await picker.getByText('Svenska').click();

    // Picker should close
    await expect(picker).not.toBeVisible();

    // Language badge should appear showing "SV"
    const badge = page.getByTestId('language-badge').and(page.locator(':visible'));
    await expect(badge).toBeVisible({ timeout: 5000 });
    await expect(badge).toHaveText('SV');
  });

  test('clicking globe when translated returns to English', async ({ page }) => {
    await page.goto(`${PROD_URL}/feed`, { waitUntil: 'networkidle' });

    const toggle = page.getByTestId('language-toggle').and(page.locator(':visible'));
    await expect(toggle).toBeVisible({ timeout: 10000 });

    // Set language to Swedish first
    await toggle.click();
    const picker = page.getByTestId('language-picker');
    await expect(picker).toBeVisible({ timeout: 5000 });
    await picker.getByText('Svenska').click();

    // Badge should show SV
    const badge = page.getByTestId('language-badge').and(page.locator(':visible'));
    await expect(badge).toBeVisible({ timeout: 5000 });

    // Click globe again to go back to English
    await toggle.click();

    // Badge should disappear (back to English)
    await expect(badge).not.toBeVisible({ timeout: 5000 });
  });

  test('language picker closes on outside click', async ({ page }) => {
    await page.goto(`${PROD_URL}/feed`, { waitUntil: 'networkidle' });

    const toggle = page.getByTestId('language-toggle').and(page.locator(':visible'));
    await expect(toggle).toBeVisible({ timeout: 10000 });

    // Open picker
    await toggle.click();
    const picker = page.getByTestId('language-picker');
    await expect(picker).toBeVisible({ timeout: 5000 });

    // Click outside (on the page body)
    await page.locator('body').click({ position: { x: 10, y: 300 } });

    // Picker should close
    await expect(picker).not.toBeVisible({ timeout: 3000 });
  });
});
