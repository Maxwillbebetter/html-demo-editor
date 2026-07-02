import { build } from 'esbuild';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tempDir = await mkdtemp(join(tmpdir(), 'html-demo-editor-assets-'));
const bundlePath = join(tempDir, 'assets.mjs');

await build({
  entryPoints: [join(root, 'src/main/assets.ts')],
  bundle: true,
  outfile: bundlePath,
  platform: 'node',
  format: 'esm',
  logLevel: 'silent'
});

try {
  const { collectCssAssetPaths, copyReferencedAssets, normalizeAssetPath } = await import(pathToFileURL(bundlePath).href);
  const fixtureDir = join(root, 'fixtures/qa/interactive');
  const outputDir = join(tempDir, 'export');

  const cssPaths = collectCssAssetPaths('body{background:url("./assets/pattern.svg?v=1#hash")}');
  if (!cssPaths.includes('assets/pattern.svg')) {
    throw new Error('CSS asset scanner should normalize query/hash references');
  }

  if (normalizeAssetPath('./assets/pattern.svg?v=1#hash') !== 'assets/pattern.svg') {
    throw new Error('Asset path normalizer should remove query, hash, and leading ./');
  }

  if (normalizeAssetPath('https://example.com/a.png') !== null) {
    throw new Error('Asset path normalizer should reject remote references');
  }

  await copyReferencedAssets(fixtureDir, outputDir, ['./styles.css', './scripts.js', './css/nested.css', '../outside-secret.txt']);

  const expectedFiles = ['styles.css', 'scripts.js', 'css/nested.css', 'assets/mark.svg', 'assets/pattern.svg'];
  const missing = expectedFiles.filter((filePath) => !existsSync(join(outputDir, filePath)));
  if (missing.length) {
    throw new Error(`Exported package is missing copied assets: ${missing.join(', ')}`);
  }

  if (existsSync(join(outputDir, 'outside-secret.txt'))) {
    throw new Error('Exported package should not copy references outside the project folder');
  }
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

console.log('Asset copy checks passed.');
