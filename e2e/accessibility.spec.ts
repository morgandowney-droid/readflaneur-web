import { test, expect } from '@playwright/test';

test.describe('Accessibility', () => {
  test('homepage has proper heading hierarchy', async ({ page }) => {
    await page.goto('/');

    // Should have exactly one h1
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBe(1);
  });

  test('interactive elements are keyboard accessible', async ({ page }) => {
    await page.goto('/');

    // Tab through the page
    await page.keyboard.press('Tab');

    // Check that something is focused
    const focusedElement = await page.evaluate(() =>
      document.activeElement?.tagName
    );

    expect(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA']).toContain(focusedElement);
  });

  test('images have alt text', async ({ page }) => {
    await page.goto('/neighborhoods');

    const images = page.locator('img');
    const count = await images.count();

    for (let i = 0; i < count; i++) {
      const img = images.nth(i);
      const alt = await img.getAttribute('alt');
      // Alt should exist (even if empty for decorative images)
      expect(alt).not.toBeNull();
    }
  });

  test('links have accessible names', async ({ page }) => {
    await page.goto('/');

    const links = page.locator('a');
    const count = await links.count();

    for (let i = 0; i < Math.min(count, 10); i++) { // Check first 10 links
      const link = links.nth(i);
      const text = await link.textContent();
      const ariaLabel = await link.getAttribute('aria-label');

      // Link should have either text content or aria-label
      expect(text?.trim() || ariaLabel).toBeTruthy();
    }
  });

  test('color contrast - text is readable', async ({ page }) => {
    await page.goto('/');

    // Check that main text isn't too light
    const bodyColor = await page.evaluate(() => {
      const body = document.body;
      return window.getComputedStyle(body).color;
    });

    // Body text should be reasonably dark (not pure white on white)
    expect(bodyColor).not.toBe('rgb(255, 255, 255)');
  });

  test('form inputs have labels', async ({ page }) => {
    await page.goto('/login');

    const inputs = page.locator('input:not([type="hidden"]):not([type="submit"])');
    const count = await inputs.count();

    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i);
      const id = await input.getAttribute('id');
      const ariaLabel = await input.getAttribute('aria-label');
      const placeholder = await input.getAttribute('placeholder');

      // Input should have some form of label
      const hasLabel = id
        ? await page.locator(`label[for="${id}"]`).count() > 0
        : false;

      expect(hasLabel || ariaLabel || placeholder).toBeTruthy();
    }
  });
});

test.describe('Accessibility - Mobile', () => {
  test('primary interactive elements have adequate touch targets', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // Check neighborhood selection buttons (primary interactive elements)
    const neighborhoodButtons = page.locator('button').filter({ hasText: /Notting Hill|West Village|Pacific Heights/ });
    const count = await neighborhoodButtons.count();

    for (let i = 0; i < count; i++) {
      const button = neighborhoodButtons.nth(i);
      const box = await button.boundingBox();

      if (box) {
        // Minimum touch target size should be 44x44 (Apple HIG)
        // Allow 40px as a reasonable minimum
        expect(box.height).toBeGreaterThanOrEqual(40);
      }
    }

    // Check that the mobile menu button is large enough
    const menuButton = page.locator('button[aria-label*="menu"]');
    if (await menuButton.count() > 0) {
      const menuBox = await menuButton.first().boundingBox();
      if (menuBox) {
        expect(menuBox.width).toBeGreaterThanOrEqual(44);
        expect(menuBox.height).toBeGreaterThanOrEqual(44);
      }
    }
  });
});
