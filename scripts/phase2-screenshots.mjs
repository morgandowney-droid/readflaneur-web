import { chromium } from 'playwright';

const BASE_URL = 'https://readflaneur.com';

async function captureScreenshots() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }
  });
  const page = await context.newPage();

  // 1. Feed page - check brief card vertical footprint
  await page.goto(`${BASE_URL}/new-york/tribeca`);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'ui-review/phase2-brief-mobile.png' });

  // 2. Header - check nav active state (go to feed page)
  await page.goto(`${BASE_URL}/feed?neighborhoods=nyc-tribeca`);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'ui-review/phase2-header-mobile.png' });

  // 3. Footer - check wrapping
  await page.goto(`${BASE_URL}/about`);
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'ui-review/phase2-footer-mobile.png' });

  // 4. Places page - check filter chips and touch targets
  await page.goto(`${BASE_URL}/new-york/tribeca/guides`);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'ui-review/phase2-places-mobile.png' });

  await browser.close();
  console.log('Phase 2 screenshots captured');
}

captureScreenshots().catch(console.error);
