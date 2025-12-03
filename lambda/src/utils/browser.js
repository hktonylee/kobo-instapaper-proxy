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

export const withPage = async (chromiumLib, puppeteerLib, work, { forceQuit = true } = {}) => {
  const executablePath = await chromiumLib.executablePath();
  console.info('Launching browser', { executablePath });
  const browser = await puppeteerLib.launch({
    args: chromiumLib.args,
    executablePath,
    headless: chromiumLib.headless,
    defaultViewport: { width: 1280, height: 800 },
  });
  console.info('Browser launched');

  try {
    console.info('Creating new page');
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(0);
    console.info('Applying stealth tweaks');
    await applyStealthTweaks(page);
    console.info('Running page work');
    return await work(page);
  } finally {
    const browserProcess = browser?.process?.();
    console.info('Closing browser');
    try {
      await browser.close();
      console.info('Browser closed');
    } catch (error) {
      console.warn('Browser close failed', { message: error?.message });
    }

    if (forceQuit && browserProcess) {
      const timeout = setTimeout(() => {
        if (!browserProcess.killed) {
          console.info('Force quitting browser process');
          try {
            browserProcess.kill('SIGKILL');
          } catch (error) {
            console.warn('Force quit failed', { message: error?.message });
          }
        }

        if (!browserProcess.killed && browserProcess.pid) {
          console.info('Force quitting browser process by PID');
          try {
            process.kill(browserProcess.pid, 'SIGKILL');
          } catch (error) {
            console.warn('Force quit by PID failed', { message: error?.message });
          }
        }
      }, 3000);

      timeout.unref?.();
    }
  }
};
