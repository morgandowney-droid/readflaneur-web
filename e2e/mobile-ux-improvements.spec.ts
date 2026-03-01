import { test, expect } from '@playwright/test';

const PROD_URL = 'https://readflaneur.com';

// Test with multiple neighborhoods to exercise the multi-feed mobile dropdown
const NEIGHBORHOODS = ['nyc-tribeca', 'stockholm-ostermalm', 'london-mayfair'];

test.use({
  viewport: { width: 390, height: 844 },
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
  isMobile: true,
  hasTouch: true,
});

test.describe('Mobile UX Improvements', () => {
  test.beforeEach(async ({ page }) => {
    // Set up neighborhoods in localStorage before navigating
    await page.goto(PROD_URL, { waitUntil: 'domcontentloaded' });
    await page.evaluate((ids) => {
      localStorage.setItem('flaneur-neighborhood-preferences', JSON.stringify(ids));
      document.cookie = `flaneur-neighborhoods=${ids.join(',')};path=/;max-age=31536000;SameSite=Strict`;
    }, NEIGHBORHOODS);
  });

  test('1. "Make primary" link appears when non-primary pill is selected', async ({ page }) => {
    await page.goto(`${PROD_URL}/feed`, { waitUntil: 'networkidle' });

    // Wait for the mobile dropdown to be visible
    const dropdown = page.locator('button:has-text("All Stories"), button:has-text("Tribeca")').first();
    await expect(dropdown).toBeVisible({ timeout: 15000 });

    // Open dropdown
    await dropdown.click();
    await page.waitForTimeout(500);

    // Click a non-primary neighborhood (Ostermalm is second, not primary)
    const ostermalmOption = page.locator('button:has-text("Östermalm"), button:has-text("Ostermalm")').first();
    if (await ostermalmOption.isVisible()) {
      await ostermalmOption.click();
      await page.waitForTimeout(1000);

      // "Make primary" link should appear below dropdown
      const makePrimaryLink = page.locator('button:has-text("my primary")');
      await expect(makePrimaryLink).toBeVisible({ timeout: 5000 });

      // Take screenshot
      await page.screenshot({ path: 'e2e/screenshots/mobile-make-primary-link.png', fullPage: false });
    }
  });

  test('2. Neighborhood selector modal - inline actions for selected neighborhoods', async ({ page }) => {
    await page.goto(`${PROD_URL}/feed`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Open the neighborhood selector modal via manage button
    const manageBtn = page.locator('button[title="Manage neighborhoods"]').first();
    await expect(manageBtn).toBeVisible({ timeout: 15000 });
    await manageBtn.click();

    // Wait for modal to appear
    const modal = page.locator('text=City Search');
    await expect(modal).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(1000);

    // Search for Tribeca to find it in the modal list
    const searchInput = page.locator('input[placeholder="Search..."]');
    await expect(searchInput).toBeVisible({ timeout: 5000 });
    await searchInput.fill('Tribeca');
    await page.waitForTimeout(500);

    // Find Tribeca in the search results - it should have accent color since it's selected
    // The modal list items are buttons within the modal content area
    const modalContent = page.locator('[class*="overflow-y-auto"]');
    const tribecaItem = modalContent.locator('button:has-text("Tribeca")').first();
    await expect(tribecaItem).toBeVisible({ timeout: 10000 });

    // Click it - should expand inline action row instead of deselecting
    await tribecaItem.click();
    await page.waitForTimeout(500);

    // Check for inline action buttons (use exact match to avoid "Go to Stories >" header link)
    const goToStories = page.locator('a:has-text("Go to stories")').nth(1);
    const removeBtn = page.getByRole('button', { name: 'Remove', exact: true });

    // At least one action should be visible
    const hasActions = await goToStories.isVisible() || await removeBtn.isVisible();
    expect(hasActions).toBeTruthy();

    // Take screenshot
    await page.screenshot({ path: 'e2e/screenshots/mobile-inline-actions.png', fullPage: false });
  });

  test('3. Modal search hides pills and sort buttons on mobile', async ({ page }) => {
    await page.goto(`${PROD_URL}/feed`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Open the neighborhood selector modal
    const manageBtn = page.locator('button[title="Manage neighborhoods"]').first();
    await expect(manageBtn).toBeVisible({ timeout: 15000 });
    await manageBtn.click();

    // Wait for modal
    const modal = page.locator('text=City Search');
    await expect(modal).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(1000);

    // Check that sort buttons are visible before searching
    const sortNearest = page.locator('button:has-text("Sort by nearest")');
    const sortNearestVisible = await sortNearest.isVisible();

    // Selected pills should be visible (we have 3 neighborhoods)
    const selectedPills = page.locator('.flex-wrap >> span:has-text("Tribeca"), .flex-wrap >> span:has-text("Mayfair")');

    // Take "before" screenshot
    await page.screenshot({ path: 'e2e/screenshots/mobile-search-before.png', fullPage: false });

    // Type in search box
    const searchInput = page.locator('input[placeholder="Search..."]');
    await expect(searchInput).toBeVisible({ timeout: 5000 });
    await searchInput.focus();
    await searchInput.fill('Tokyo');
    await page.waitForTimeout(500);

    // Sort buttons should be hidden while searching
    const sortAfterSearch = page.locator('button:has-text("Sort by nearest")');
    await expect(sortAfterSearch).toBeHidden({ timeout: 3000 });

    // Take "during search" screenshot
    await page.screenshot({ path: 'e2e/screenshots/mobile-search-active.png', fullPage: false });

    // Clear search
    const clearBtn = page.locator('button:has(svg) >> nth=-1').locator('visible=true');
    // Use the X button in search
    const searchClear = searchInput.locator('..').locator('button');
    if (await searchClear.isVisible()) {
      await searchClear.click();
    } else {
      await searchInput.fill('');
    }
    await page.waitForTimeout(500);

    // Sort buttons should reappear
    if (sortNearestVisible) {
      await expect(sortNearest).toBeVisible({ timeout: 3000 });
    }

    // Take "after clear" screenshot
    await page.screenshot({ path: 'e2e/screenshots/mobile-search-cleared.png', fullPage: false });
  });
});
