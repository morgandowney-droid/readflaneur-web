import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('https://readflaneur.com/feed?neighborhoods=nyc-tribeca');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'ui-review/phase2-header-desktop.png' });
  await browser.close();
  console.log('Header screenshot captured');
})();
