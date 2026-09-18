import * as esbuild from 'esbuild';
import { copyFileSync, cpSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const outdir = resolve(__dirname, 'dist');
const publicDir = resolve(__dirname, 'public');

mkdirSync(join(outdir, 'assets'), { recursive: true });

const buildDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const buildTime = new Date().toISOString();

const result = await esbuild.build({
  entryPoints: ['src/main.tsx'],
  bundle: true,
  splitting: true,
  format: 'esm',
  outdir: join(outdir, 'assets'),
  platform: 'browser',
  target: 'esnext',
  jsx: 'automatic',
  minify: true,
  metafile: true,
  define: {
    '__APP_BUILD_DATE__': JSON.stringify(buildDate),
    '__APP_BUILD_TIME__': JSON.stringify(buildTime),
    'process.env.NODE_ENV': '"production"',
  },
  alias: {
    '@': resolve(__dirname, 'src'),
  },
  loader: {
    '.tsx': 'tsx',
    '.ts': 'ts',
    '.css': 'css',
    '.svg': 'dataurl',
    '.png': 'dataurl',
    '.jpg': 'dataurl',
    '.jpeg': 'dataurl',
    '.gif': 'dataurl',
    '.webp': 'dataurl',
    '.woff': 'file',
    '.woff2': 'file',
    '.ttf': 'file',
    '.eot': 'file',
  },
});

// Find the main JS and CSS output files
const outputs = Object.keys(result.metafile.outputs);
const mainJs = outputs.find(f => f.endsWith('.js') && f.includes('main'));
const mainCss = outputs.find(f => f.endsWith('.css') && f.includes('main'));

const jsFile = mainJs ? mainJs.replace('dist/', '') : 'assets/main.js';
const cssFile = mainCss ? mainCss.replace('dist/', '') : null;

// Read index.html and inject built assets
let html = readFileSync(resolve(__dirname, 'index.html'), 'utf-8');

// Remove the Vite module script
html = html.replace(
  '<script type="module" src="/src/main.tsx"></script>',
  `${cssFile ? `<link rel="stylesheet" href="/${cssFile}">` : ''}
    <script type="module" src="/${jsFile}"></script>`
);

writeFileSync(join(outdir, 'index.html'), html);

// Copy public directory contents
if (existsSync(publicDir)) {
  const entries = readdirSync(publicDir);
  for (const entry of entries) {
    const src = join(publicDir, entry);
    try {
      cpSync(src, join(outdir, entry), { recursive: true });
    } catch (e) {
      // Skip if already exists or permission issue
    }
  }
}

console.log('Build complete!');
const analysis = await esbuild.analyzeMetafile(result.metafile, { verbose: false });
console.log(analysis);
