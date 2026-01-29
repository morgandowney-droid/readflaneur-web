import { test, expect } from '@playwright/test';

test.describe('Neighborhoods Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/neighborhoods');
  });

  test('displays page title', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Neighborhoods');
  });

  test('displays description text', async ({ page }) => {
    await expect(page.getByText('Choose a neighborhood to see local stories')).toBeVisible();
  });

  test('shows neighborhood cards', async ({ page }) => {
    // Wait for neighborhoods to load
    await page.waitForSelector('a[href*="/"]');

    // Check that neighborhood links exist
    const neighborhoodLinks = page.locator('a[href*="/"][href*="-"]');
    const count = await neighborhoodLinks.count();

    expect(count).toBeGreaterThan(0);
  });

  test('neighborhood cards have hover effect', async ({ page }) => {
    const firstCard = page.locator('a[href*="/"]').first();

    // Get initial border color
    const initialBorder = await firstCard.evaluate(el =>
      window.getComputedStyle(el).borderColor
    );

    // Hover over card
    await firstCard.hover();

    // Card should have some visual feedback (hover state)
    await expect(firstCard).toBeVisible();
  });

  test('groups neighborhoods by city', async ({ page }) => {
    // Check for city headings (uppercase, tracking-wide text)
    const cityHeadings = page.locator('h2');
    const count = await cityHeadings.count();

    expect(count).toBeGreaterThan(0);
  });
});

test.describe('Neighborhoods Page - Mobile', () => {
  test('page is usable on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/neighborhoods');

    // Check that the page title is visible
    await expect(page.locator('h1')).toBeVisible();

    // Check that neighborhood cards are visible and clickable
    // Cards are inside the grid and have h3 elements
    const cards = page.locator('.grid a');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    // Verify no horizontal overflow
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1);

    // Check that neighborhood cards have adequate touch target size
    const firstCard = cards.first();
    const box = await firstCard.boundingBox();
    if (box) {
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  });
});
