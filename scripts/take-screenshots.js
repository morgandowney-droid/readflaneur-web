const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');

async function takeScreenshots() {
  // Ensure screenshot directory exists
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  const browser = await chromium.launch();

  // Mobile viewport (iPhone 14 Pro)
  const mobileContext = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    isMobile: true,
  });

  // Desktop viewport
  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  // URLs to test
  const urls = [
    // Expo app
    { name: 'expo-mobile', url: 'http://localhost:8081', context: mobileContext },
    { name: 'expo-desktop', url: 'http://localhost:8081', context: desktopContext },

    // Next.js public pages
    { name: 'nextjs-home-desktop', url: 'http://localhost:3001', context: desktopContext },
    { name: 'nextjs-home-mobile', url: 'http://localhost:3001', context: mobileContext },
    { name: 'nextjs-neighborhoods', url: 'http://localhost:3001/neighborhoods', context: desktopContext },
    { name: 'nextjs-advertise', url: 'http://localhost:3001/advertise', context: desktopContext },
    { name: 'nextjs-login', url: 'http://localhost:3001/login', context: desktopContext },
    { name: 'nextjs-signup', url: 'http://localhost:3001/signup', context: desktopContext },

    // Next.js neighborhood pages
    { name: 'nextjs-westvillage', url: 'http://localhost:3001/new-york/west-village', context: desktopContext },
    { name: 'nextjs-nottinghill', url: 'http://localhost:3001/london/notting-hill', context: desktopContext },

    // Admin pages (will show login if not authenticated)
    { name: 'nextjs-admin-articles', url: 'http://localhost:3001/admin/articles', context: desktopContext },
    { name: 'nextjs-admin-ads', url: 'http://localhost:3001/admin/ads', context: desktopContext },
    { name: 'nextjs-admin-journalists', url: 'http://localhost:3001/admin/journalists', context: desktopContext },
    { name: 'nextjs-admin-analytics', url: 'http://localhost:3001/admin/analytics', context: desktopContext },
    { name: 'nextjs-admin-newsletter', url: 'http://localhost:3001/admin/newsletter', context: desktopContext },

    // Journalist pages
    { name: 'nextjs-journalist', url: 'http://localhost:3001/journalist', context: desktopContext },
    { name: 'nextjs-journalist-apply', url: 'http://localhost:3001/journalist/apply', context: desktopContext },

    // Advertiser pages
    { name: 'nextjs-advertiser', url: 'http://localhost:3001/advertiser', context: desktopContext },
  ];

  for (const { name, url, context } of urls) {
    try {
      const page = await context.newPage();
      console.log(`Taking screenshot: ${name} (${url})`);

      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

      // Wait a bit for any JS rendering
      await page.waitForTimeout(2000);

      const filename = `${name}-${timestamp}.png`;
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, filename),
        fullPage: false
      });

      console.log(`  Saved: ${filename}`);
      await page.close();
    } catch (error) {
      console.error(`  Error for ${name}: ${error.message}`);
    }
  }

  await mobileContext.close();
  await desktopContext.close();
  await browser.close();

  console.log(`\nScreenshots saved to: ${SCREENSHOT_DIR}`);
}

takeScreenshots().catch(console.error);
