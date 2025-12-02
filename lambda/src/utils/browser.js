import { DEFAULT_USER_AGENT } from './constants.js';

export const applyStealthTweaks = async (page) => {
  await page.setUserAgent(DEFAULT_USER_AGENT);
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.chrome = window.chrome || { runtime: {} };

    const originalQuery = window.navigator.permissions?.query;
    if (originalQuery) {
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission })
          : originalQuery(parameters)
      );
    }

    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
  });
};

export const withPage = async (chromiumLib, puppeteerLib, work) => {
  const executablePath = await chromiumLib.executablePath();
  const browser = await puppeteerLib.launch({
    args: chromiumLib.args,
    executablePath,
    headless: chromiumLib.headless,
    defaultViewport: { width: 1280, height: 800 },
  });

  try {
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(0);
    await applyStealthTweaks(page);
    return await work(page);
  } finally {
    // Fire and forget to avoid awaiting browser shutdown.
    browser.close().catch(() => {});
  }
};
