import { test, expect } from '@playwright/test';

test.describe('Feed View Toggle', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
  });

  test('shows view toggle on feed page', async ({ page }) => {
    await page.goto('/feed?neighborhoods=nyc-west-village');

    // Check that both toggle buttons are visible
    await expect(page.locator('button[aria-label="Compact view"]')).toBeVisible();
    await expect(page.locator('button[aria-label="Gallery view"]')).toBeVisible();
  });

  test('shows view toggle on neighborhood page', async ({ page }) => {
    await page.goto('/stockholm/ostermalm');

    // Check that both toggle buttons are visible
    await expect(page.locator('button[aria-label="Compact view"]')).toBeVisible();
    await expect(page.locator('button[aria-label="Gallery view"]')).toBeVisible();
  });

  test('defaults to compact view', async ({ page }) => {
    await page.goto('/feed?neighborhoods=nyc-west-village');

    // Compact view button should be selected (has shadow)
    const compactButton = page.locator('button[aria-label="Compact view"]');
    await expect(compactButton).toHaveClass(/shadow-sm/);
  });

  test('can switch between views', async ({ page }) => {
    await page.goto('/feed?neighborhoods=nyc-west-village');

    // Wait for hydration
    await page.waitForTimeout(500);

    // Click gallery view
    await page.locator('button[aria-label="Gallery view"]').click();
    await page.waitForTimeout(100);

    // Gallery view button should now be selected
    const galleryButton = page.locator('button[aria-label="Gallery view"]');
    await expect(galleryButton).toHaveClass(/shadow-sm/);

    // Click compact view
    await page.locator('button[aria-label="Compact view"]').click();
    await page.waitForTimeout(100);

    // Compact view button should now be selected
    const compactButton = page.locator('button[aria-label="Compact view"]');
    await expect(compactButton).toHaveClass(/shadow-sm/);
  });

  test('persists view preference in localStorage', async ({ page }) => {
    await page.goto('/feed?neighborhoods=nyc-west-village');

    // Wait for hydration
    await page.waitForTimeout(500);

    // Switch to gallery view
    await page.locator('button[aria-label="Gallery view"]').click();
    await page.waitForTimeout(200);

    // Check localStorage
    const savedView = await page.evaluate(() => localStorage.getItem('flaneur-feed-view'));
    expect(savedView).toBe('gallery');

    // Reload page
    await page.reload();
    await page.waitForTimeout(500);

    // Gallery view should still be selected
    const galleryButton = page.locator('button[aria-label="Gallery view"]');
    await expect(galleryButton).toHaveClass(/shadow-sm/);
  });

  test('view preference persists across different pages', async ({ page }) => {
    // Set preference on feed page
    await page.goto('/feed?neighborhoods=nyc-west-village');
    await page.waitForTimeout(500);
    await page.locator('button[aria-label="Gallery view"]').click();
    await page.waitForTimeout(200);

    // Navigate to neighborhood page
    await page.goto('/stockholm/ostermalm');
    await page.waitForTimeout(500);

    // Gallery view should be selected
    const galleryButton = page.locator('button[aria-label="Gallery view"]');
    await expect(galleryButton).toHaveClass(/shadow-sm/);
  });
});
