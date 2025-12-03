import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { withPage } from '../src/utils/browser.js';

const chromiumLib = {
  executablePath: async () => '/opt/chromium',
  args: ['--no-sandbox'],
  headless: true,
};

const createPage = () => ({
  setDefaultNavigationTimeout: mock.fn(() => {}),
  setUserAgent: mock.fn(async () => {}),
  setExtraHTTPHeaders: mock.fn(async () => {}),
  evaluateOnNewDocument: mock.fn(async () => {}),
});

test('withPage closes browser without force quit by default', async () => {
  const page = createPage();
  const work = mock.fn(async () => 'ok');
  const browserProcess = { killed: false, kill: mock.fn(() => { browserProcess.killed = true; }) };
  const close = mock.fn(async () => {});
  const killProcess = mock.method(process, 'kill', mock.fn(() => {}));

  const launch = mock.fn(async () => ({
    newPage: async () => page,
    close,
    process: () => browserProcess,
  }));

  const result = await withPage(chromiumLib, { launch }, work);

  assert.equal(result, 'ok');
  assert.equal(work.mock.calls.length, 1);
  assert.equal(close.mock.calls.length, 1);
  assert.equal(browserProcess.kill.mock.calls.length, 0);
  assert.equal(killProcess.mock.calls.length, 0);

  killProcess.mock.restore();
});

test('withPage force quits when enabled and close fails', async () => {
  const page = createPage();
  const work = mock.fn(async () => 'still ok');
  const browserProcess = { killed: false, kill: mock.fn(() => { browserProcess.killed = true; }) };
  const close = mock.fn(async () => { throw new Error('close failed'); });
  const killProcess = mock.method(process, 'kill', mock.fn(() => {}));

  const launch = mock.fn(async () => ({
    newPage: async () => page,
    close,
    process: () => browserProcess,
  }));

  const result = await withPage(chromiumLib, { launch }, work, { forceQuit: true });

  assert.equal(result, 'still ok');
  assert.equal(close.mock.calls.length, 1);
  assert.equal(browserProcess.kill.mock.calls.length, 1);
  assert.equal(browserProcess.killed, true);
  assert.equal(killProcess.mock.calls.length, 0);

  killProcess.mock.restore();
});

test('withPage force quits the browser PID when still running', async () => {
  const page = createPage();
  const work = mock.fn(async () => 'done');
  const browserProcess = { pid: 123, killed: false, kill: mock.fn(() => {}) };
  const close = mock.fn(async () => {});
  const killProcess = mock.method(process, 'kill', mock.fn(() => {}));

  const launch = mock.fn(async () => ({
    newPage: async () => page,
    close,
    process: () => browserProcess,
  }));

  const result = await withPage(chromiumLib, { launch }, work, { forceQuit: true });

  assert.equal(result, 'done');
  assert.equal(close.mock.calls.length, 1);
  assert.equal(browserProcess.kill.mock.calls.length, 1);
  assert.equal(killProcess.mock.calls.length, 1);
  assert.deepEqual(killProcess.mock.calls[0].arguments, [123, 'SIGKILL']);

  killProcess.mock.restore();
});
