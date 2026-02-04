import { chromium } from 'playwright';

const BASE_URL = 'https://readflaneur.com';

async function captureScreenshots() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }
  });
  const page = await context.newPage();

  // 1. Feed page - check ad frequency and AI badge
  await page.goto(`${BASE_URL}/new-york/tribeca`);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'ui-review/phase3-feed-mobile.png', fullPage: true });

  // 2. Advertise page - check ad frequency mention
  await page.goto(`${BASE_URL}/advertise`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'ui-review/phase3-advertise-mobile.png' });

  // 3. Search page - check empty state
  await page.goto(`${BASE_URL}/search`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'ui-review/phase3-search-mobile.png' });

  // 4. About page - check visual interest
  await page.goto(`${BASE_URL}/about`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'ui-review/phase3-about-mobile.png' });

  // 5. Home page - check decorative line and input border
  await page.goto(`${BASE_URL}/`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'ui-review/phase3-home-mobile.png' });

  await browser.close();
  console.log('Phase 3 screenshots captured');
}

captureScreenshots().catch(console.error);
