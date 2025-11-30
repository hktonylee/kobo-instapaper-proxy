import { build } from 'esbuild';
import { copyFileSync, mkdirSync, writeFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

await build({
  entryPoints: ['src/handler.js'],
  bundle: true,
  minify: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  outfile: 'dist/src/handler.js',
  external: ['@sparticuz/chromium'],
  plugins: [],
});

mkdirSync('dist', { recursive: true });
writeFileSync('dist/package.json', JSON.stringify({ type: 'commonjs' }, null, 2));

const xhrWorkerPath = require.resolve('jsdom/lib/jsdom/living/xhr/xhr-sync-worker.js');
copyFileSync(xhrWorkerPath, 'dist/src/xhr-sync-worker.js');
