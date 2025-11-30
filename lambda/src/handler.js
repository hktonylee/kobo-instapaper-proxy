import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

const MINIMAL_STYLES = `
  body { font-family: 'Georgia', 'Times New Roman', serif; margin: 1.5rem auto; max-width: 740px; padding: 0 1rem; background: #f9f9f9; color: #222; }
  article { background: #fff; padding: 1.25rem; border-radius: 12px; box-shadow: 0 6px 20px rgba(0,0,0,0.08); }
  h1 { font-size: 1.8rem; line-height: 1.25; margin-bottom: 0.75rem; }
  h2, h3, h4 { margin-top: 1.25rem; line-height: 1.3; }
  p { line-height: 1.6; margin: 0.85rem 0; font-size: 1rem; }
  img, picture, video { max-width: 100%; height: auto; display: block; margin: 1rem auto; }
  figure { margin: 1rem auto; }
  figcaption { font-size: 0.9rem; color: #555; text-align: center; }
  a { color: #0067c5; text-decoration: none; }
  a:hover { text-decoration: underline; }
  ul, ol { padding-left: 1.25rem; }
  blockquote { border-left: 4px solid #ddd; padding-left: 0.75rem; color: #555; }
  code { background: #f2f2f2; padding: 0.15rem 0.25rem; border-radius: 4px; font-size: 0.95rem; }
`;

const UNSUPPORTED_PROTOCOLS = ['javascript:', 'data:', 'mailto:', 'tel:'];

const escapeHtml = (value = '') => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const normalizeTargetUrl = (rawPath = '') => {
  const trimmed = rawPath.replace(/^\/+/, '');
  if (!trimmed) return null;

  const decoded = decodeURIComponent(trimmed);
  const withNormalizedProtocolSlashes = decoded.replace(/^(https?:)\/(?!\/)/i, '$1//');

  const protocolMatch = withNormalizedProtocolSlashes.match(/^([a-z][a-z0-9+.-]*:)/i);
  if (protocolMatch) {
    const protocol = protocolMatch[1].toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:') {
      throw new Error(`Unsupported protocol: ${protocol}`);
    }
  }

  if (withNormalizedProtocolSlashes.startsWith('http://') || withNormalizedProtocolSlashes.startsWith('https://')) {
    return withNormalizedProtocolSlashes;
  }

  return `https://${withNormalizedProtocolSlashes}`;
};

const buildProxyBase = (event) => {
  const protocol = event.headers?.['x-forwarded-proto'] || 'https';
  const host = event.headers?.host || '';
  return host ? `${protocol}://${host}` : '';
};

const resolveAndRewrite = (doc, proxyBase, originUrl) => {
  const makeAbsolute = (value) => {
    try {
      return new URL(value, originUrl).toString();
    } catch (error) {
      console.warn('Failed to absolutize URL', value, error);
      return null;
    }
  };

  const toProxy = (absoluteUrl) => `${proxyBase}/${encodeURI(absoluteUrl)}`;

  const elements = doc.querySelectorAll('[href], [src]');
  elements.forEach((element) => {
    const attribute = element.hasAttribute('href') ? 'href' : 'src';
    const value = element.getAttribute(attribute);
    if (!value) return;

    const protocol = value.split(':')[0].toLowerCase();
    if (UNSUPPORTED_PROTOCOLS.includes(`${protocol}:`)) return;

    const absolute = makeAbsolute(value);
    if (!absolute) return;

    element.setAttribute(attribute, toProxy(absolute));
  });

  const srcsetElements = doc.querySelectorAll('[srcset]');
  srcsetElements.forEach((element) => {
    const entries = element.getAttribute('srcset')
      ?.split(',')
      .map((part) => part.trim())
      .map((part) => {
        const [url, descriptor] = part.split(/\s+/, 2);
        const absolute = makeAbsolute(url);
        return absolute ? `${toProxy(absolute)}${descriptor ? ` ${descriptor}` : ''}` : null;
      })
      .filter(Boolean);

    if (entries?.length) {
      element.setAttribute('srcset', entries.join(', '));
    }
  });
};

export const createHandler = ({ chromiumLib = chromium, puppeteerLib = puppeteer } = {}) => async (event) => {
  let targetUrl;
  try {
    const rawPath = event.rawPath || event.path || '/';
    const rawQueryString = event.rawQueryString || '';
    const rawTarget = rawQueryString ? `${rawPath}?${rawQueryString}` : rawPath;

    targetUrl = normalizeTargetUrl(rawTarget);
  } catch (error) {
    return { statusCode: 400, body: error.message };
  }

  if (!targetUrl) {
    return { statusCode: 400, body: 'A target URL is required in the path.' };
  }

  const proxyBase = buildProxyBase(event);
  const executablePath = await chromiumLib.executablePath();
  let browser;

  try {
    browser = await puppeteerLib.launch({
      args: chromiumLib.args,
      executablePath,
      headless: chromiumLib.headless,
      defaultViewport: { width: 1280, height: 800 },
    });

    const page = await browser.newPage();
    await page.goto(targetUrl, { waitUntil: 'networkidle0' });
    const pageContent = await page.content();

    const dom = new JSDOM(pageContent, { url: targetUrl });
    const article = new Readability(dom.window.document).parse();

    const contentHtml = article?.content || dom.window.document.body.innerHTML;
    const articleDom = new JSDOM(contentHtml, { url: targetUrl });

    if (proxyBase) {
      resolveAndRewrite(articleDom.window.document, proxyBase, targetUrl);
    }

    const title = article?.title || dom.window.document.title || 'Saved article';
    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>${MINIMAL_STYLES}</style>
</head>
<body>
  <article>
    <h1>${escapeHtml(title)}</h1>
    ${articleDom.window.document.body.innerHTML}
  </article>
</body>
</html>`;

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
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};

export const handler = createHandler();
