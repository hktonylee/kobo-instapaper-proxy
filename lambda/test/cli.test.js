import assert from 'node:assert';
import { test } from 'node:test';
import { buildEvent } from '../src/cli.js';

test('buildEvent preserves the raw URL path without encoding', () => {
  const event = buildEvent({ url: 'https://www.abc.com', host: 'localhost', proto: 'http', prefix: '' });

  assert.strictEqual(event.rawPath, '/https://www.abc.com');
  assert.strictEqual(event.rawQueryString, '');
  assert.deepStrictEqual(event.headers, {
    host: 'localhost',
    'x-forwarded-proto': 'http',
  });
});

test('buildEvent keeps an existing leading slash and prefix header', () => {
  const event = buildEvent({ url: '/https://www.abc.com', host: 'example.com', proto: 'https', prefix: '/prod' });

  assert.strictEqual(event.rawPath, '/https://www.abc.com');
  assert.strictEqual(event.rawQueryString, '');
  assert.deepStrictEqual(event.headers, {
    host: 'example.com',
    'x-forwarded-proto': 'https',
    'x-forwarded-prefix': '/prod',
  });
});
