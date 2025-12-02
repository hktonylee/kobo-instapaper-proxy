import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { withPage } from './utils/browser.js';
import { buildWelcomePage } from './utils/html.js';
import { renderReadablePage } from './utils/readable.js';
import { buildProxyBase, logRequestMetadata, normalizeTargetUrl } from './utils/request.js';
import { NAVIGATION_TIMEOUT_MS } from './utils/constants.js';

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection', reason);
});

export const createHandler = ({ chromiumLib = chromium, puppeteerLib = puppeteer } = {}) => async (event) => {
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
  try {
    const rawQueryString = event.rawQueryString || '';
    const rawTarget = rawQueryString ? `${rawPath}?${rawQueryString}` : rawPath;

    const normalized = normalizeTargetUrl(rawTarget);
    targetUrl = normalized.targetUrl;
    pathPrefix = normalized.pathPrefix;
  } catch (error) {
    return { statusCode: 400, body: error.message };
  }

  const proxyBase = buildProxyBase(event, pathPrefix);

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

  try {
    const pageContent = await withPage(chromiumLib, puppeteerLib, async (page) => {
      await page.goto(targetUrl, { waitUntil: 'load', timeout: NAVIGATION_TIMEOUT_MS });
      await page.waitForNetworkIdle({ idleTime: 5000, concurrency: 3 });
      return page.content();
    });

    const { html } = renderReadablePage(pageContent, targetUrl, proxyBase);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'max-age=3600',
      },
      body: html,
    };
  } catch (error) {
    console.error('Rendering failed', error);
    return { statusCode: 500, body: `Failed to render: ${error.message}` };
  }
};

export const handler = createHandler();
