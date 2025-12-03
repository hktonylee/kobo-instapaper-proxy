import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { renderReadablePage } from '../src/utils/readable.js';

test('renders page while logging concise JSDOM errors', () => {
  mock.method(console, 'error');

  try {
    renderReadablePage(
      '<html><head><title>Example</title></head><body><article><script>throw new Error("boom")</script><p>Content</p></article></body></html>',
      'https://example.com/post',
      '',
    );

    assert.equal(console.error.mock.calls.length, 1);
    const [message] = console.error.mock.calls[0].arguments;

    assert.match(message, /^\[JSDOM\] /);
    assert.match(message, /boom/);
  } finally {
    mock.restoreAll();
  }
});

test('renderReadablePage keeps short content by lowering Readability threshold', () => {
  const html = [
    '<html>',
    '<head><title>Short Article</title></head>',
    '<body>',
    '<div><a href="/foo">Check this link</a></div>',
    '<script>window.tracking = true;</script>',
    '</body>',
    '</html>',
  ].join('');

  const { html: rendered } = renderReadablePage(html, 'https://example.com/post', '');

  assert.match(rendered, /Check this link/);
  assert.doesNotMatch(rendered, /window\.tracking/);
});
