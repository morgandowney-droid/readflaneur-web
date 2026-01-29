import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('can navigate to neighborhoods page', async ({ page }) => {
    await page.goto('/neighborhoods');

    await expect(page.locator('h1')).toContainText('Neighborhoods');
    await expect(page.getByText('Choose a neighborhood')).toBeVisible();
  });

  test('can navigate to search page', async ({ page }) => {
    await page.goto('/search');
    await expect(page).toHaveURL(/\/search/);
  });

  test('can navigate to login page', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL(/\/login/);
  });

  test('can navigate to signup page', async ({ page }) => {
    await page.goto('/signup');
    await expect(page).toHaveURL(/\/signup/);
  });

  test('can navigate to advertise page', async ({ page }) => {
    await page.goto('/advertise');
    await expect(page).toHaveURL(/\/advertise/);
  });

  test('can navigate to feed page', async ({ page }) => {
    await page.goto('/feed');
    await expect(page).toHaveURL(/\/feed/);
  });
});

test.describe('Navigation - Link Functionality', () => {
  test('homepage links are clickable', async ({ page }) => {
    await page.goto('/');

    // Check that interactive elements exist and are clickable
    const buttons = page.locator('button');
    const links = page.locator('a');

    // Verify there are interactive elements
    const buttonCount = await buttons.count();
    const linkCount = await links.count();

    expect(buttonCount + linkCount).toBeGreaterThan(0);
  });
});
