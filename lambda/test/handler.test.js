import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { Readability } from '@mozilla/readability';
import { createHandler } from '../src/handler.js';

const createPageMocks = ({ goto, content } = {}) => {
  const gotoMock = goto ?? mock.fn(async () => {});
  const contentMock = content ?? mock.fn(async () => '<html><body><p>Content</p></body></html>');
  const setUserAgent = mock.fn(async () => {});
  const setExtraHTTPHeaders = mock.fn(async () => {});
  const evaluateOnNewDocument = mock.fn(async () => {});

  return {
    page: { goto: gotoMock, content: contentMock, setUserAgent, setExtraHTTPHeaders, evaluateOnNewDocument },
    goto: gotoMock,
    content: contentMock,
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

  const { page, goto, content, setUserAgent, setExtraHTTPHeaders, evaluateOnNewDocument } = createPageMocks({
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
  assert.match(response.body, /<img href="https:\/\/proxy\.test\/https:\/\/example\.com\/gallery" src="https:\/\/example\.com\/images\/photo.jpg" srcset="https:\/\/example\.com\/images\/photo.jpg 1x, https:\/\/example\.com\/images\/photo@2x.jpg 2x" alt="example">/);
  assert.doesNotMatch(response.body, /proxy\.test\/https:\/\/example\.com\/images/);

  assert.equal(launch.mock.calls.length, 1);
  const launchArgs = launch.mock.calls[0].arguments[0];
  assert.deepEqual(launchArgs.args, ['--no-sandbox']);
  assert.equal(launchArgs.executablePath, '/opt/chromium');
  assert.equal(launchArgs.headless, true);
  assert.deepEqual(launchArgs.defaultViewport, { width: 1280, height: 800 });

  assert.equal(goto.mock.calls.length, 1);
  assert.equal(goto.mock.calls[0].arguments[0], 'https://example.com/post');
  assert.deepEqual(goto.mock.calls[0].arguments[1], { waitUntil: 'networkidle0' });

  assert.equal(setUserAgent.mock.calls.length, 1);
  assert.equal(setUserAgent.mock.calls[0].arguments[0], 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');
  assert.equal(setExtraHTTPHeaders.mock.calls.length, 1);
  assert.deepEqual(setExtraHTTPHeaders.mock.calls[0].arguments[0], { 'Accept-Language': 'en-US,en;q=0.9' });
  assert.equal(evaluateOnNewDocument.mock.calls.length, 1);

  assert.equal(content.mock.calls.length, 1);
  assert.equal(close.mock.calls.length, 1);
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
  assert.match(response.body, /<img href="https:\/\/proxy\.test\/https:\/\/example\.com\/gallery" src="\/images\/photo\.jpg" srcset="\/images\/photo\.jpg 1x, \/images\/photo@2x\.jpg 2x" alt="example">/);
  assert.match(response.body, /https:\/\/proxy\.test\/https:\/\/example\.com\/foo\?bar=baz/);
  assert.doesNotMatch(response.body, /proxy\.test\/https:\/\/example\.com\/images/);
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
