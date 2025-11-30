import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { createHandler } from '../src/handler.js';

test('handler renders article HTML and rewrites links for proxy usage', async () => {
  const chromiumLib = {
    executablePath: async () => '/opt/chromium',
    args: ['--no-sandbox'],
    headless: true,
  };

  const goto = mock.fn(async () => {});
  const content = mock.fn(async () => '<html><head><title>Example Article</title></head><body><article><a href="/foo?bar=baz">read more</a><p>Content</p></article></body></html>');
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
