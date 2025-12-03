import { build } from 'esbuild';
import { copyFileSync, cpSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

await build({
  entryPoints: ['src/handler.js'],
  bundle: true,
  minify: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  outfile: 'dist/src/handler.js',
  external: ['@sparticuz/chromium'],
  plugins: [
    {
      name: 'externalize-xhr-worker',
      setup(build) {
        build.onResolve({ filter: /xhr-sync-worker\.js$/ }, (args) => ({
          path: args.path,
          external: true,
        }));
      },
    },
  ],
});

mkdirSync('dist', { recursive: true });
writeFileSync('dist/package.json', JSON.stringify({ type: 'commonjs' }, null, 2));

const xhrWorkerPath = require.resolve('jsdom/lib/jsdom/living/xhr/xhr-sync-worker.js');
copyFileSync(xhrWorkerPath, 'dist/src/xhr-sync-worker.js');

mkdirSync('dist/node_modules', { recursive: true });
cpSync('node_modules/sharp', 'dist/node_modules/sharp', { recursive: true });
if (existsSync('node_modules/@img')) {
  cpSync('node_modules/@img', 'dist/node_modules/@img', { recursive: true });
}
const sharpDeps = ['detect-libc', 'color', 'color-string', 'semver'];
for (const dep of sharpDeps) {
  const depPath = `node_modules/${dep}`;
  if (existsSync(depPath)) {
    cpSync(depPath, `dist/node_modules/${dep}`, { recursive: true });
  }
}
