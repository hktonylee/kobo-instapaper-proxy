import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { withPage } from './utils/browser.js';
import { buildWelcomePage } from './utils/html.js';
import { renderReadablePage } from './utils/readable.js';
import { buildProxyBase, logRequestMetadata, normalizeTargetUrl } from './utils/request.js';
import { NAVIGATION_TIMEOUT_MS } from './utils/constants.js';
import { fetchAndConvertToJpeg } from './utils/image.js';

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection', reason);
});

const isTimeoutError = (error) => error?.name === 'TimeoutError'
  || error?.message?.includes('Timed out after waiting')
  || error?.message?.includes('Navigation timeout of ');

export const createHandler = ({
  chromiumLib = chromium,
  puppeteerLib = puppeteer,
  withPageLib = withPage,
  forceQuitCurrentProcess = scheduleForceQuitCurrentProcess,
} = {}) => async (event) => {
  const rawPath = event.rawPath || event.path || '/';
  console.info('Incoming request path', {
    rawPath,
    rawQueryString: event.rawQueryString,
  });
  const lowerCasePath = rawPath.toLowerCase();
  if (lowerCasePath === '/favicon.ico' || lowerCasePath.endsWith('/favicon.ico')) {
    return { statusCode: 204, headers: { 'Cache-Control': 'no-store' }, body: '' };
  }

  let targetUrl;
  let pathPrefix = '';
  let isJpgRequest = false;
  try {
    const rawQueryString = event.rawQueryString || '';
    const rawTarget = rawQueryString ? `${rawPath}?${rawQueryString}` : rawPath;

    console.info('Normalizing target URL', { rawTarget });
    const normalized = normalizeTargetUrl(rawTarget);
    targetUrl = normalized.targetUrl;
    pathPrefix = normalized.pathPrefix;
    const pathSegments = pathPrefix.split('/').filter(Boolean);
    isJpgRequest = pathSegments[pathSegments.length - 1]?.toLowerCase() === 'jpg';
    console.info('Normalized target URL', { targetUrl, pathPrefix });
  } catch (error) {
    return { statusCode: 400, body: error.message };
  }

  const proxyBase = buildProxyBase(event, pathPrefix);
  console.info('Computed proxy base', { proxyBase });

  if (isJpgRequest) {
    try {
      const { buffer, contentType } = await fetchAndConvertToJpeg(targetUrl);
      return {
        statusCode: 200,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'max-age=86400',
        },
        isBase64Encoded: true,
        body: buffer.toString('base64'),
      };
    } catch (error) {
      console.error('Image fetch or conversion failed', error);
      return { statusCode: 500, body: `Failed to convert image: ${error.message}` };
    }
  }

  if (!targetUrl) {
    const welcomeHtml = buildWelcomePage(proxyBase);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
      body: welcomeHtml,
    };
  }

  logRequestMetadata(event, { targetUrl, pathPrefix, proxyBase });

  let response;
  try {
    const pageContent = await withPageLib(chromiumLib, puppeteerLib, async (page) => {
      console.info('Navigating to target URL', { targetUrl, timeout: NAVIGATION_TIMEOUT_MS });
      try {
        await page.goto(targetUrl, { waitUntil: 'load', timeout: NAVIGATION_TIMEOUT_MS });
        console.info('Navigation complete');
      } catch (error) {
        if (isTimeoutError(error)) {
          console.warn('Navigation timed out, continuing with page content extraction', { message: error.message });
        } else {
          throw error;
        }
      }

      console.info('Waiting for network idle');
      try {
        await page.waitForNetworkIdle({ idleTime: 500, timeout: 1000, concurrency: 3 });
        console.info('Network idle detected');
      } catch (error) {
        if (isTimeoutError(error)) {
          console.warn('Network idle wait timed out, continuing with page content extraction', { message: error.message });
        } else {
          throw error;
        }
      }

      console.info('Extracting content');
      return page.content();
    }, { forceQuit: true });

    const jpgProxyBase = proxyBase ? `${proxyBase}/jpg` : '';
    const { html } = renderReadablePage(pageContent, targetUrl, proxyBase, { jpgProxyBase });

    response = {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'max-age=3600',
      },
      body: html,
    };
  } catch (error) {
    console.error('Rendering failed', error);
    response = { statusCode: 500, body: `Failed to render: ${error.message}` };
  } finally {
    forceQuitCurrentProcess();
  }

  return response;
};

export const handler = createHandler();

function scheduleForceQuitCurrentProcess({ delayMs = 1000, signal = 'SIGKILL' } = {}) {
  const timeout = setTimeout(() => {
    console.info('Force quitting current process');
    try {
      process.kill(process.pid, signal);
    } catch (error) {
      console.warn('Force quit of current process failed', { message: error?.message });
    }
  }, delayMs);

  timeout.unref?.();
}
