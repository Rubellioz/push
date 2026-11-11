// Renders icons/logo.html to every app icon size.
// Usage (from the repo root, with a local server on :8765):  node scripts/render-icons.js
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1024, height: 1024 } });
  for (const [variant, file] of [['', 'icons/logo-1024.png'], ['maskable', 'icons/logo-maskable-1024.png'], ['dark', 'icons/logo-dark-1024.png']]) {
    await page.goto(`http://localhost:8765/icons/logo.html${variant ? `?variant=${variant}` : ''}`);
    await page.waitForTimeout(200);
    await page.screenshot({ path: file });
  }
  await b.close();
})();
