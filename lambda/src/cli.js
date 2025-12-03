#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHandler } from './handler.js';
import { withPage } from './utils/browser.js';

const USAGE = `Usage: npm run cli -- <url> [--output <file>] [--host <host>] [--proto <http|https>] [--prefix <basePath>] [--headful]

Examples:
  npm run cli -- https://example.com/article
  npm run cli -- https://example.com/article --output article.html --host localhost:3000 --proto http --prefix /prod
  npm run cli -- https://example.com/article --headful
`;

const parseArgs = (argv) => {
  const args = {
    url: null,
    output: null,
    host: 'localhost',
    proto: 'http',
    prefix: '',
    headless: true,
  };
  const entries = [...argv];

  while (entries.length > 0) {
    const value = entries.shift();

    if (!args.url && !value.startsWith('--')) {
      args.url = value;
      continue;
    }

    switch (value) {
      case '--output':
        args.output = entries.shift();
        break;
      case '--host':
        args.host = entries.shift() ?? args.host;
        break;
      case '--proto':
        args.proto = entries.shift() ?? args.proto;
        break;
      case '--prefix':
        args.prefix = entries.shift() ?? args.prefix;
        break;
      case '--headful':
        args.headless = false;
        break;
      case '--help':
      case '-h':
        return { ...args, help: true };
      default:
        throw new Error(`Unknown argument: ${value}`);
    }
  }

  return args;
};

const createLocalChromiumLib = (puppeteerLib, { headless = true } = {}) => ({
  args: [],
  headless,
  executablePath: async () => puppeteerLib.executablePath(),
});

export const buildEvent = ({ url, host, proto, prefix }) => ({
  rawPath: url.startsWith('/') ? url : `/${url}`,
  rawQueryString: '',
  headers: {
    host,
    'x-forwarded-proto': proto,
    ...(prefix ? { 'x-forwarded-prefix': prefix } : {}),
  },
});

const writeOutput = async ({ body, output }) => {
  if (!output) {
    process.stdout.write(body);
    return;
  }

  const outputPath = path.resolve(process.cwd(), output);
  await fs.writeFile(outputPath, body, 'utf8');
  console.info(`Saved rendered HTML to ${outputPath}`);
};

const isDirectRun = () => {
  const entry = process.argv[1];

  if (!entry) {
    return false;
  }

  return new URL(`file://${path.resolve(entry)}`).href === import.meta.url;
};

const main = async () => {
  try {
    const { url, output, host, proto, prefix, headless, help } = parseArgs(process.argv.slice(2));

    if (help || !url) {
      process.stdout.write(USAGE);
      process.exit(help ? 0 : 1);
      return;
    }

    const { default: puppeteerLib } = await import('puppeteer');
    const handler = createHandler({
      chromiumLib: createLocalChromiumLib(puppeteerLib, { headless }),
      puppeteerLib,
      withPageLib: (chromiumLib, puppeteerLib, work) => withPage(chromiumLib, puppeteerLib, work, { forceQuit: true }),
    });
    const response = await handler(buildEvent({ url, host, proto, prefix }));

    if (response.statusCode !== 200) {
      console.error(`Rendering failed (${response.statusCode}): ${response.body}`);
      process.exit(1);
      return;
    }

    await writeOutput({ body: response.body, output });
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
};

if (isDirectRun()) {
  await main();
}
