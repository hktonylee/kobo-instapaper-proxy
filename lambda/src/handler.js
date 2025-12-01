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

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const applyStealthTweaks = async (page) => {
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

const escapeHtml = (value = '') => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const normalizeTargetUrl = (rawPath = '') => {
  const trimmed = rawPath.replace(/^\/+/, '');
  if (!trimmed) return { targetUrl: null, pathPrefix: '' };

  const decoded = decodeURIComponent(trimmed);

  const protocolMatch = decoded.match(/([a-z][a-z0-9+.-]*:\/+)/i);
  if (!protocolMatch) {
    throw new Error('A fully-qualified http(s) URL is required in the path.');
  }

  const protocolIndex = protocolMatch?.index ?? -1;
  const pathPrefix = protocolIndex > 0 ? decoded.slice(0, protocolIndex).replace(/\/+$/, '') : '';
  const candidate = protocolIndex > -1 ? decoded.slice(protocolIndex) : decoded;

  const withNormalizedProtocolSlashes = candidate.replace(/^(https?:)\/(?!\/)/i, '$1//');

  const protocolSchemeMatch = withNormalizedProtocolSlashes.match(/^([a-z][a-z0-9+.-]*:)/i);
  if (protocolSchemeMatch) {
    const protocol = protocolSchemeMatch[1].toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:') {
      throw new Error(`Unsupported protocol: ${protocol}`);
    }
  }

  const targetUrl = withNormalizedProtocolSlashes.startsWith('http://')
    || withNormalizedProtocolSlashes.startsWith('https://')
    ? withNormalizedProtocolSlashes
    : `https://${withNormalizedProtocolSlashes}`;

  return { targetUrl, pathPrefix };
};

const normalizePrefix = (value = '') => value.replace(/^\/+|\/+$/g, '');

const buildProxyBase = (event, pathPrefix = '') => {
  const protocol = event.headers?.['x-forwarded-proto'] || 'https';
  const host = event.headers?.host || '';

  const combinedPrefixes = [
    event.headers?.['x-forwarded-prefix'],
    pathPrefix,
  ]
    .map(normalizePrefix)
    .filter(Boolean)
    .join('/');

  const prefixSegment = combinedPrefixes ? `/${combinedPrefixes}` : '';

  return host ? `${protocol}://${host}${prefixSegment}` : '';
};

const logRequestMetadata = (event, { targetUrl, pathPrefix, proxyBase }) => {
  const headers = event.headers || {};

  console.info('Request URL metadata', {
    targetUrl,
    pathPrefix,
    rawPath: event.rawPath || event.path,
    rawQueryString: event.rawQueryString,
    proxyBase,
    forwarded: {
      proto: headers['x-forwarded-proto'],
      host: headers['x-forwarded-host'],
      prefix: headers['x-forwarded-prefix'],
      for: headers['x-forwarded-for'],
    },
    host: headers.host,
  });
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

  const assetTags = new Set(['img', 'picture', 'source', 'video', 'audio', 'track', 'iframe', 'embed', 'object', 'script', 'link']);

  const elements = doc.querySelectorAll('[href], [src]');
  elements.forEach((element) => {
    const attribute = element.hasAttribute('href') ? 'href' : 'src';
    const value = element.getAttribute(attribute);
    if (!value) return;

    const protocol = value.split(':')[0].toLowerCase();
    if (UNSUPPORTED_PROTOCOLS.includes(`${protocol}:`)) return;

    const tag = element.tagName.toLowerCase();
    if (attribute === 'src' && assetTags.has(tag)) return;

    const absolute = makeAbsolute(value);
    if (!absolute) return;

    element.setAttribute(attribute, toProxy(absolute));
  });

  const srcsetElements = doc.querySelectorAll('[srcset]');
  srcsetElements.forEach((element) => {
    const tag = element.tagName.toLowerCase();
    if (assetTags.has(tag)) return;

    const entries = element.getAttribute('srcset')
      ?.split(',')
      .map((part) => part.trim())
      .map((part) => {
        const [url, descriptor] = part.split(/\s+/, 2);
        const absolute = makeAbsolute(url);
        return absolute ? `${absolute}${descriptor ? ` ${descriptor}` : ''}` : null;
      })
      .filter(Boolean);

    if (entries?.length) {
      element.setAttribute('srcset', entries.join(', '));
    }
  });
};

export const createHandler = ({ chromiumLib = chromium, puppeteerLib = puppeteer } = {}) => async (event) => {
  const rawPath = event.rawPath || event.path || '/';
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

  if (!targetUrl) {
    const welcomeHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Welcome to the Proxy</title>
  <style>
    body { font-family: 'Inter', system-ui, -apple-system, sans-serif; margin: 0; padding: 0; background: #f6f8fb; color: #1f2933; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    .card { background: #fff; padding: 1.75rem; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.08); width: min(560px, 92vw); }
    h1 { font-size: 1.8rem; margin: 0 0 0.35rem; }
    p { margin: 0 0 1rem; color: #4b5563; line-height: 1.5; }
    form { display: flex; gap: 0.6rem; margin-top: 0.75rem; }
    input[type="search"] { flex: 1; padding: 0.85rem 1rem; border: 1px solid #d4d8dd; border-radius: 12px; font-size: 1rem; transition: border-color 0.2s, box-shadow 0.2s; }
    input[type="search"]:focus { outline: none; border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.18); }
    button { padding: 0.85rem 1.1rem; border: none; border-radius: 12px; background: linear-gradient(135deg, #2563eb, #1d4ed8); color: #fff; font-weight: 600; cursor: pointer; transition: transform 0.1s ease, box-shadow 0.2s ease; }
    button:hover { transform: translateY(-1px); box-shadow: 0 8px 18px rgba(37, 99, 235, 0.24); }
  </style>
</head>
<body>
  <main class="card" aria-labelledby="welcome-title">
    <h1 id="welcome-title">Welcome</h1>
    <p>Use the box below to search with DuckDuckGo. Results will open through this proxy so links stay readable.</p>
    <form action="${buildProxyBase(event, '') || ''}/https://duckduckgo.com/" method="get">
      <input type="search" name="q" placeholder="Search DuckDuckGo" required />
      <button type="submit">Search</button>
    </form>
  </main>
</body>
</html>`;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
      body: welcomeHtml,
    };
  }

  const proxyBase = buildProxyBase(event, pathPrefix);
  logRequestMetadata(event, { targetUrl, pathPrefix, proxyBase });
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
    await applyStealthTweaks(page);
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
