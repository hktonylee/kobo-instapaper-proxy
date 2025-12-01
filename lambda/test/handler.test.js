import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { Readability } from '@mozilla/readability';
import { createHandler } from '../src/handler.js';

test('handler renders article HTML and rewrites links for proxy usage', async () => {
  const chromiumLib = {
    executablePath: async () => '/opt/chromium',
    args: ['--no-sandbox'],
    headless: true,
  };

  const goto = mock.fn(async () => {});
  const content = mock.fn(async () => '<html><head><title>Example Article</title></head><body><article><a href="/foo?bar=baz">read more</a><img src="/images/photo.jpg" srcset="/images/photo.jpg 1x, /images/photo@2x.jpg 2x" alt="example" /><p>Content</p></article></body></html>');
  const close = mock.fn(async () => {});

  const launch = mock.fn(async () => ({
    newPage: async () => ({ goto, content }),
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
  assert.match(response.body, /<img src="https:\/\/example\.com\/images\/photo.jpg" srcset="https:\/\/example\.com\/images\/photo.jpg 1x, https:\/\/example\.com\/images\/photo@2x.jpg 2x" alt="example">/);
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

  assert.equal(content.mock.calls.length, 1);
  assert.equal(close.mock.calls.length, 1);
});

test('assets keep their original URLs when readability parsing is unavailable', async (t) => {
  t.after(() => mock.restoreAll());

  mock.method(Readability.prototype, 'parse', () => null);

  const chromiumLib = {
    executablePath: async () => '/opt/chromium',
    args: ['--no-sandbox'],
    headless: true,
  };

  const goto = mock.fn(async () => {});
  const content = mock.fn(async () => '<html><head><title>Example Article</title></head><body><article><a href="/foo?bar=baz">read more</a><img src="/images/photo.jpg" srcset="/images/photo.jpg 1x, /images/photo@2x.jpg 2x" alt="example" /><p>Content</p></article></body></html>');
  const close = mock.fn(async () => {});

  const launch = mock.fn(async () => ({
    newPage: async () => ({ goto, content }),
    close,
  }));

  const handler = createHandler({ chromiumLib, puppeteerLib: { launch } });

  const response = await handler({
    rawPath: '/https://example.com/post',
    headers: { host: 'proxy.test', 'x-forwarded-proto': 'https' },
  });

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /<img src="\/images\/photo\.jpg" srcset="\/images\/photo\.jpg 1x, \/images\/photo@2x\.jpg 2x" alt="example">/);
  assert.match(response.body, /https:\/\/proxy\.test\/https:\/\/example\.com\/foo\?bar=baz/);
  assert.doesNotMatch(response.body, /proxy\.test\/https:\/\/example\.com\/images/);
});

test('handler normalizes single-slash https URLs', async () => {
  const chromiumLib = {
    executablePath: async () => '/opt/chromium',
    args: ['--no-sandbox'],
    headless: true,
  };

  const goto = mock.fn(async () => {});
  const content = mock.fn(async () => '<html><body><p>Content</p></body></html>');
  const close = mock.fn(async () => {});

  const launch = mock.fn(async () => ({
    newPage: async () => ({ goto, content }),
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

  const goto = mock.fn(async () => {});
  const content = mock.fn(async () => '<html><body><p>Content</p></body></html>');
  const close = mock.fn(async () => {});

  const launch = mock.fn(async () => ({
    newPage: async () => ({ goto, content }),
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

  const goto = mock.fn(async () => {});
  const content = mock.fn(async () => '<html><body><p>Content</p></body></html>');
  const close = mock.fn(async () => {});

  const launch = mock.fn(async () => ({
    newPage: async () => ({ goto, content }),
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
