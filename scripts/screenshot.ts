/**
 * Quick screenshot tool for UI review
 *
 * Usage: npx tsx scripts/screenshot.ts [url] [output-name]
 *
 * Examples:
 *   npx tsx scripts/screenshot.ts http://localhost:3000/stockholm/ostermalm/guides guides
 *   npx tsx scripts/screenshot.ts http://localhost:3000/admin/news-coverage admin-coverage
 */

import { chromium } from 'playwright';
import * as path from 'path';

async function takeScreenshot() {
  const url = process.argv[2] || 'http://localhost:3000';
  const name = process.argv[3] || 'screenshot';
  const outputPath = path.join(process.cwd(), `screenshots/${name}.png`);

  console.log(`Taking screenshot of: ${url}`);

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 }
  });

  await page.goto(url, { waitUntil: 'networkidle' });

  // Wait a bit for any animations/lazy loading
  await page.waitForTimeout(1000);

  // Ensure screenshots directory exists
  const fs = await import('fs');
  const screenshotsDir = path.join(process.cwd(), 'screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  await page.screenshot({ path: outputPath, fullPage: true });

  console.log(`Screenshot saved to: ${outputPath}`);

  await browser.close();
}

takeScreenshot().catch(console.error);
