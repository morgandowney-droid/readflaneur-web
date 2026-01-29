import { test, expect } from '@playwright/test';

test.describe('Visual Regression', () => {
  test('homepage screenshot', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Take screenshot for visual comparison
    await expect(page).toHaveScreenshot('homepage.png', {
      fullPage: true,
      threshold: 0.2, // Allow 20% difference for dynamic content
    });
  });

  test('neighborhoods page screenshot', async ({ page }) => {
    await page.goto('/neighborhoods');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveScreenshot('neighborhoods.png', {
      fullPage: true,
      threshold: 0.2,
    });
  });
});

test.describe('Visual - Responsive Breakpoints', () => {
  const viewports = [
    { name: 'mobile', width: 375, height: 667 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1440, height: 900 },
  ];

  for (const viewport of viewports) {
    test(`homepage renders correctly at ${viewport.name} (${viewport.width}x${viewport.height})`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Check no horizontal overflow
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      expect(bodyWidth).toBeLessThanOrEqual(viewport.width + 1);

      // Check content is visible
      await expect(page.locator('h1')).toBeVisible();

      // Take screenshot
      await expect(page).toHaveScreenshot(`homepage-${viewport.name}.png`, {
        fullPage: true,
        threshold: 0.2,
      });
    });
  }
});
