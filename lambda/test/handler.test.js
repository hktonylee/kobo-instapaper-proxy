import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { Readability } from '@mozilla/readability';
import sharp from 'sharp';
import { createHandler } from '../src/handler.js';
import { NAVIGATION_TIMEOUT_MS } from '../src/utils/constants.js';

const createPageMocks = ({ goto, content, waitForNetworkIdle } = {}) => {
  const gotoMock = goto ?? mock.fn(async () => {});
  const contentMock = content ?? mock.fn(async () => '<html><body><p>Content</p></body></html>');
  const setDefaultNavigationTimeout = mock.fn(() => {});
  const waitForNetworkIdleMock = waitForNetworkIdle ?? mock.fn(async () => {});
  const setUserAgent = mock.fn(async () => {});
  const setExtraHTTPHeaders = mock.fn(async () => {});
  const evaluateOnNewDocument = mock.fn(async () => {});

  return {
    page: {
      goto: gotoMock,
      content: contentMock,
      setDefaultNavigationTimeout,
      waitForNetworkIdle: waitForNetworkIdleMock,
      setUserAgent,
      setExtraHTTPHeaders,
      evaluateOnNewDocument,
    },
    goto: gotoMock,
    content: contentMock,
    setDefaultNavigationTimeout,
    waitForNetworkIdle: waitForNetworkIdleMock,
    setUserAgent,
    setExtraHTTPHeaders,
    evaluateOnNewDocument,
  };
};

test('handler renders article HTML and rewrites links for proxy usage', async () => {
  const chromiumLib = {
    executablePath: async () => '/opt/chromium',
    args: ['--no-sandbox'],
    headless: true,
  };

  const { page, goto, content, setDefaultNavigationTimeout, setUserAgent, setExtraHTTPHeaders, evaluateOnNewDocument } = createPageMocks({
    content: mock.fn(async () => '<html><head><title>Example Article</title></head><body><article><a href="/foo?bar=baz">read more</a><img href="/gallery" src="/images/photo.jpg" srcset="/images/photo.jpg 1x, /images/photo@2x.jpg 2x" alt="example" /><p>Content</p></article></body></html>'),
  });
  const close = mock.fn(async () => {});

  const launch = mock.fn(async () => ({
    newPage: async () => page,
    close,
  }));

  const handler = createHandler({ chromiumLib, puppeteerLib: { launch } });

  const response = await handler({
    rawPath: '/https://example.com/post',
    headers: { host: 'proxy.test', 'x-forwarded-proto': 'https' },
  });

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /Example Article/);
  assert.match(response.body, /https:\/\/proxy\.test\/https:\/\/example\.com\/foo\?bar=baz/);
  assert.match(response.body, /<img href="https:\/\/proxy\.test\/https:\/\/example\.com\/gallery" src="https:\/\/proxy\.test\/jpg\/https:\/\/example\.com\/images\/photo.jpg" srcset="https:\/\/proxy\.test\/jpg\/https:\/\/example\.com\/images\/photo.jpg 1x, https:\/\/proxy\.test\/jpg\/https:\/\/example\.com\/images\/photo@2x.jpg 2x" alt="example">/);

  assert.equal(launch.mock.calls.length, 1);
  const launchArgs = launch.mock.calls[0].arguments[0];
  assert.deepEqual(launchArgs.args, ['--no-sandbox']);
  assert.equal(launchArgs.executablePath, '/opt/chromium');
  assert.equal(launchArgs.headless, true);
  assert.deepEqual(launchArgs.defaultViewport, { width: 1280, height: 800 });

  assert.equal(setDefaultNavigationTimeout.mock.calls.length, 1);
  assert.deepEqual(setDefaultNavigationTimeout.mock.calls[0].arguments, [0]);
  assert.equal(goto.mock.calls.length, 1);
  assert.equal(goto.mock.calls[0].arguments[0], 'https://example.com/post');
  assert.deepEqual(goto.mock.calls[0].arguments[1], { waitUntil: 'load', timeout: NAVIGATION_TIMEOUT_MS });
  assert.equal(page.waitForNetworkIdle.mock.calls.length, 1);
  assert.deepEqual(page.waitForNetworkIdle.mock.calls[0].arguments, [{ idleTime: 500, timeout: 1000, concurrency: 3 }]);

  assert.equal(setUserAgent.mock.calls.length, 1);
  assert.equal(setUserAgent.mock.calls[0].arguments[0], 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');
  assert.equal(setExtraHTTPHeaders.mock.calls.length, 1);
  assert.deepEqual(setExtraHTTPHeaders.mock.calls[0].arguments[0], { 'Accept-Language': 'en-US,en;q=0.9' });
  assert.equal(evaluateOnNewDocument.mock.calls.length, 1);

  assert.equal(content.mock.calls.length, 1);
  assert.equal(close.mock.calls.length, 1);
});

test('handler continues rendering when navigation times out', async () => {
  const chromiumLib = {
    executablePath: async () => '/opt/chromium',
    args: ['--no-sandbox'],
    headless: true,
  };

  const timeoutError = new Error('Navigation Timeout');
  timeoutError.name = 'TimeoutError';

  const { page, goto, content, waitForNetworkIdle } = createPageMocks({
    goto: mock.fn(async () => {
      throw timeoutError;
    }),
  });
  const close = mock.fn(async () => {});

  const launch = mock.fn(async () => ({
    newPage: async () => page,
    close,
  }));

  const handler = createHandler({ chromiumLib, puppeteerLib: { launch } });

  const response = await handler({
    rawPath: '/https://example.com/post',
    headers: { host: 'proxy.test', 'x-forwarded-proto': 'https' },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(goto.mock.calls.length, 1);
  assert.equal(waitForNetworkIdle.mock.calls.length, 1);
  assert.equal(content.mock.calls.length, 1);
});

test('handler continues rendering when network idle wait times out', async () => {
  const chromiumLib = {
    executablePath: async () => '/opt/chromium',
    args: ['--no-sandbox'],
    headless: true,
  };

  const timeoutError = new Error('Network idle Timeout');
  timeoutError.name = 'TimeoutError';

  const { page, goto, content, waitForNetworkIdle } = createPageMocks({
    waitForNetworkIdle: mock.fn(async () => {
      throw timeoutError;
    }),
  });
  const close = mock.fn(async () => {});

  const launch = mock.fn(async () => ({
    newPage: async () => page,
    close,
  }));

  const handler = createHandler({ chromiumLib, puppeteerLib: { launch } });

  const response = await handler({
    rawPath: '/https://example.com/post',
    headers: { host: 'proxy.test', 'x-forwarded-proto': 'https' },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(goto.mock.calls.length, 1);
  assert.equal(waitForNetworkIdle.mock.calls.length, 1);
  assert.equal(content.mock.calls.length, 1);
});

test('handler welcome page proxies https inputs directly', async () => {
  const chromiumLib = {
    executablePath: async () => '/opt/chromium',
    args: ['--no-sandbox'],
    headless: true,
  };

  const handler = createHandler({ chromiumLib, puppeteerLib: { launch: () => {} } });

  const response = await handler({
    rawPath: '/',
    headers: { host: 'proxy.test', 'x-forwarded-proto': 'https' },
  });

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /id="search-form"/);
  assert.match(response.body, /id="search-input"/);
  assert.match(response.body, /const proxyBase = "https:\/\/proxy\.test"/);
  assert.ok(response.body.includes("query.toLowerCase().startsWith('https://')"));
  assert.match(response.body, /Search DuckDuckGo or paste https:\/\/ URL/);
});

test('handler keeps API gateway base path when rewriting links', async () => {
  const chromiumLib = {
    executablePath: async () => '/opt/chromium',
    args: ['--no-sandbox'],
    headless: true,
  };

  const { page, goto, content } = createPageMocks({
    content: mock.fn(async () => '<html><head><title>Example Article</title></head><body><article><a href="/foo?bar=baz">read more</a><p>Content</p></article></body></html>'),
  });
  const close = mock.fn(async () => {});

  const launch = mock.fn(async () => ({
    newPage: async () => page,
    close,
  }));

  const handler = createHandler({ chromiumLib, puppeteerLib: { launch } });

  const response = await handler({
    rawPath: '/path1/path2/https://example.com/post',
    headers: { host: 'proxy.test', 'x-forwarded-proto': 'https' },
  });

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /https:\/\/proxy\.test\/path1\/path2\/https:\/\/example\.com\/foo\?bar=baz/);
  assert.equal(goto.mock.calls[0].arguments[0], 'https://example.com/post');
});

test('url subpath rewrites links without altering the original markup', async (t) => {
  t.after(() => mock.restoreAll());

  mock.method(Readability.prototype, 'parse', () => {
    throw new Error('Readability should not run for /url/ requests');
  });

  const chromiumLib = {
    executablePath: async () => '/opt/chromium',
    args: ['--no-sandbox'],
    headless: true,
  };

  const { page, goto, content } = createPageMocks({
    content: mock.fn(async () => '<html><head><title>Example Article</title></head><body><main><a href="/foo">Next</a><p>Content</p></main></body></html>'),
  });
  const close = mock.fn(async () => {});

  const launch = mock.fn(async () => ({
    newPage: async () => page,
    close,
  }));

  const handler = createHandler({ chromiumLib, puppeteerLib: { launch } });

  const response = await handler({
    rawPath: '/url/https://example.com/post',
    headers: { host: 'proxy.test', 'x-forwarded-proto': 'https' },
  });

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /<title>Example Article<\/title>/);
  assert.match(response.body, /<main>.*href="https:\/\/proxy\.test\/https:\/\/example\.com\/foo".*Next.*Content.*<\/main>/s);
  assert.equal(response.body.includes('/url/https://example.com/foo'), false);
  assert.equal(goto.mock.calls[0].arguments[0], 'https://example.com/post');
});

test('jpg subpath converts images to JPEG without launching a browser', async (t) => {
  t.after(() => mock.restoreAll());

  const pngBuffer = await sharp({
    create: {
      width: 1,
      height: 1,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    },
  }).png().toBuffer();

  mock.method(globalThis, 'fetch', async () => new Response(pngBuffer, {
    status: 200,
    headers: { 'Content-Type': 'image/png' },
  }));

  const chromiumLib = {
    executablePath: async () => '/opt/chromium',
    args: ['--no-sandbox'],
    headless: true,
  };

  const launch = mock.fn(async () => ({ close: async () => {} }));
  const handler = createHandler({ chromiumLib, puppeteerLib: { launch } });

  const response = await handler({
    rawPath: '/jpg/https://example.com/image.png',
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['Content-Type'], 'image/jpeg');
  assert.equal(response.isBase64Encoded, true);

  const outputBuffer = Buffer.from(response.body, 'base64');
  const metadata = await sharp(outputBuffer).metadata();
  assert.equal(metadata.format, 'jpeg');

  assert.equal(fetch.mock.calls.length, 1);
  assert.equal(launch.mock.calls.length, 0);
});

test('handler uses forwarded prefix header when base path is stripped before lambda', async () => {
  const chromiumLib = {
    executablePath: async () => '/opt/chromium',
    args: ['--no-sandbox'],
    headless: true,
  };

  const { page, goto, content } = createPageMocks({
    content: mock.fn(async () => '<html><head><title>Example Article</title></head><body><article><a href="/foo?bar=baz">read more</a><p>Content</p></article></body></html>'),
  });
  const close = mock.fn(async () => {});

  const launch = mock.fn(async () => ({
    newPage: async () => page,
    close,
  }));

  const handler = createHandler({ chromiumLib, puppeteerLib: { launch } });

  const response = await handler({
    rawPath: '/https://example.com/post',
    headers: { host: 'proxy.test', 'x-forwarded-proto': 'https', 'x-forwarded-prefix': '/path1/path2' },
  });

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /https:\/\/proxy\.test\/path1\/path2\/https:\/\/example\.com\/foo\?bar=baz/);
  assert.equal(goto.mock.calls[0].arguments[0], 'https://example.com/post');
});

test('assets keep their original URLs when readability parsing is unavailable', async (t) => {
  t.after(() => mock.restoreAll());

  mock.method(Readability.prototype, 'parse', () => null);

  const chromiumLib = {
    executablePath: async () => '/opt/chromium',
    args: ['--no-sandbox'],
    headless: true,
  };

  const { page, goto, content } = createPageMocks({
    content: mock.fn(async () => '<html><head><title>Example Article</title></head><body><article><a href="/foo?bar=baz">read more</a><img href="/gallery" src="/images/photo.jpg" srcset="/images/photo.jpg 1x, /images/photo@2x.jpg 2x" alt="example" /><p>Content</p></article></body></html>'),
  });
  const close = mock.fn(async () => {});

  const launch = mock.fn(async () => ({
    newPage: async () => page,
    close,
  }));

  const handler = createHandler({ chromiumLib, puppeteerLib: { launch } });

  const response = await handler({
    rawPath: '/https://example.com/post',
    headers: { host: 'proxy.test', 'x-forwarded-proto': 'https' },
  });

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /<img href="https:\/\/proxy\.test\/https:\/\/example\.com\/gallery" src="https:\/\/proxy\.test\/jpg\/https:\/\/example\.com\/images\/photo.jpg" srcset="https:\/\/proxy\.test\/jpg\/https:\/\/example\.com\/images\/photo.jpg 1x, https:\/\/proxy\.test\/jpg\/https:\/\/example\.com\/images\/photo@2x.jpg 2x" alt="example">/);
  assert.match(response.body, /https:\/\/proxy\.test\/https:\/\/example\.com\/foo\?bar=baz/);
});

test('handler normalizes single-slash https URLs', async () => {
  const chromiumLib = {
    executablePath: async () => '/opt/chromium',
    args: ['--no-sandbox'],
    headless: true,
  };

  const { page, goto } = createPageMocks();
  const close = mock.fn(async () => {});

  const launch = mock.fn(async () => ({
    newPage: async () => page,
    close,
  }));

  const handler = createHandler({ chromiumLib, puppeteerLib: { launch } });

  const response = await handler({
    rawPath: '/https:/news.ycombinator.com/news',
  });

  assert.equal(response.statusCode, 200);
  assert.equal(goto.mock.calls[0].arguments[0], 'https://news.ycombinator.com/news');
});

test('handler forwards query strings to the target URL', async () => {
  const chromiumLib = {
    executablePath: async () => '/opt/chromium',
    args: ['--no-sandbox'],
    headless: true,
  };

  const { page, goto } = createPageMocks();
  const close = mock.fn(async () => {});

  const launch = mock.fn(async () => ({
    newPage: async () => page,
    close,
  }));

  const handler = createHandler({ chromiumLib, puppeteerLib: { launch } });

  const response = await handler({
    rawPath: '/https://example.com/search',
    rawQueryString: 'q=kobo&page=2',
  });

  assert.equal(response.statusCode, 200);
  assert.equal(goto.mock.calls[0].arguments[0], 'https://example.com/search?q=kobo&page=2');
});

test('handler rejects unsupported protocols', async () => {
  const chromiumLib = {
    executablePath: async () => '/opt/chromium',
    args: ['--no-sandbox'],
    headless: true,
  };

  const { page, goto } = createPageMocks();
  const close = mock.fn(async () => {});

  const launch = mock.fn(async () => ({
    newPage: async () => page,
    close,
  }));

  const handler = createHandler({ chromiumLib, puppeteerLib: { launch } });

  const response = await handler({
    rawPath: '/ftp://example.com/resource',
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body, 'Unsupported protocol: ftp:');
  assert.equal(launch.mock.calls.length, 0);
});

test('handler requires http(s) protocol in the path', async () => {
  const chromiumLib = {
    executablePath: async () => '/opt/chromium',
    args: ['--no-sandbox'],
    headless: true,
  };

  const { page, goto } = createPageMocks();
  const close = mock.fn(async () => {});

  const launch = mock.fn(async () => ({
    newPage: async () => page,
    close,
  }));

  const handler = createHandler({ chromiumLib, puppeteerLib: { launch } });

  const response = await handler({
    rawPath: '/robots.txt',
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body, 'A fully-qualified http(s) URL is required in the path.');
  assert.equal(launch.mock.calls.length, 0);
});

test('handler short-circuits favicon requests', async () => {
  const chromiumLib = {
    executablePath: async () => '/opt/chromium',
    args: ['--no-sandbox'],
    headless: true,
  };

  const { page } = createPageMocks();
  const close = mock.fn(async () => {});

  const launch = mock.fn(async () => ({
    newPage: async () => page,
    close,
  }));

  const handler = createHandler({ chromiumLib, puppeteerLib: { launch } });

  const response = await handler({
    rawPath: '/favicon.ico',
    headers: { host: 'proxy.test', 'x-forwarded-proto': 'https' },
  });

  assert.equal(response.statusCode, 204);
  assert.equal(response.body, '');
  assert.deepEqual(response.headers, { 'Cache-Control': 'no-store' });
  assert.equal(launch.mock.calls.length, 0);
});
