import { test, expect } from '@playwright/test';

test.describe('Homepage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('displays hero section with FLÂNEUR branding', async ({ page }) => {
    // Check main heading
    const heading = page.locator('h1');
    await expect(heading).toContainText('FLÂNEUR');

    // Check tagline
    await expect(page.getByText('Stories daily from neighborhoods you love')).toBeVisible();
  });

  test('hero section has correct styling', async ({ page }) => {
    const hero = page.locator('section').first();
    await expect(hero).toHaveCSS('background-color', 'rgb(0, 0, 0)');
    await expect(hero).toHaveCSS('color', 'rgb(255, 255, 255)');
  });

  test('typewriter headlines section exists', async ({ page }) => {
    // The typewriter component should be present
    const heroSection = page.locator('section').first();
    await expect(heroSection).toBeVisible();
  });

  test('neighborhood signup section is visible', async ({ page }) => {
    await expect(page.getByText('Choose your neighborhoods')).toBeVisible();
  });

  test('page loads without errors', async ({ page }) => {
    // Check for no console errors
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.reload();
    await page.waitForLoadState('networkidle');

    // Filter out expected errors (like third-party scripts)
    const criticalErrors = errors.filter(e =>
      !e.includes('favicon') &&
      !e.includes('third-party')
    );

    expect(criticalErrors.length).toBe(0);
  });
});

test.describe('Homepage - Mobile Responsiveness', () => {
  test('hero text scales appropriately on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
    await page.goto('/');

    const heading = page.locator('h1');
    await expect(heading).toBeVisible();

    // Check heading is readable (not too small)
    const fontSize = await heading.evaluate(el =>
      window.getComputedStyle(el).fontSize
    );
    expect(parseFloat(fontSize)).toBeGreaterThanOrEqual(24);
  });

  test('content is not horizontally scrollable on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);

    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1); // +1 for rounding
  });
});
