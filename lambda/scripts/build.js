import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'fs';

await build({
  entryPoints: ['src/handler.js'],
  bundle: true,
  minify: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  outfile: 'dist/src/handler.js',
  external: ['@sparticuz/chromium'],
  plugins: [
    {
      name: 'external-xhr-sync-worker',
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
