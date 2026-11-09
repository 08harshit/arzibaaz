// Bundles the Chrome extension entry points that the Angular build does not emit:
//   dist/content.js     (content script, classic script => iife)
//   dist/background.js  (MV3 service worker, "type": "module" => esm)
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dev = process.argv.includes('--dev');

const common = {
  absWorkingDir: root,
  bundle: true,
  platform: 'browser',
  target: 'chrome114',
  tsconfig: 'tsconfig.json',
  sourcemap: dev ? 'inline' : false,
  minify: !dev,
  logLevel: 'info',
};

// A production bundle must never ship placeholder or localhost configuration.
if (!dev) {
  const { readdir, readFile } = await import('node:fs/promises');
  const dist = path.join(root, 'dist');
  const problems = [];
  for (const file of (await readdir(dist)).filter((f) => f.endsWith('.js'))) {
    const text = await readFile(path.join(dist, file), 'utf8');
    if (text.includes('REPLACE_WITH_')) problems.push(`${file}: still contains a REPLACE_WITH_ placeholder`);
    if (text.includes('localhost:3000')) problems.push(`${file}: points at localhost:3000`);
  }
  if (problems.length > 0) {
    console.error(
      '\nProduction build blocked:\n  - ' + problems.join('\n  - ') +
        '\n\nSet the real values in src/environments/environment.prod.ts, or use `npm run build:dev` for local testing.\n',
    );
    process.exit(1);
  }
}

await Promise.all([
  build({
    ...common,
    entryPoints: ['src/extension/content/scanner.ts'],
    outfile: 'dist/content.js',
    format: 'iife',
  }),
  build({
    ...common,
    entryPoints: ['src/extension/background/service-worker.ts'],
    outfile: 'dist/background.js',
    format: 'esm',
  }),
]);
