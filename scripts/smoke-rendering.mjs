import { build } from 'esbuild';
import electronPath from 'electron';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectModulePath = join(root, 'src/renderer/src/project.ts');
const tempDir = await mkdtemp(join(tmpdir(), 'html-demo-editor-smoke-'));
const entryPath = join(tempDir, 'entry.js');
const bundlePath = join(tempDir, 'bundle.js');
const htmlPath = join(tempDir, 'runner.html');
const mainPath = join(tempDir, 'main.cjs');

const shortFixture = await readFile(join(root, 'fixtures/qa/short-card.html'), 'utf8');
const longFixture = await readFile(join(root, 'fixtures/qa/long-report.html'), 'utf8');
const interactiveFixture = await readFile(join(root, 'fixtures/qa/interactive/index.html'), 'utf8');
const fixture = String.raw`<!doctype html>
<html class="theme-dark" data-density="demo">
<head>
  <title>AI long page</title>
  <link rel="stylesheet" href="./styles.css">
  <style>
    html.theme-dark { --hero-text: #172033; }
    body.original-body > .wrap { width: 1440px; min-height: 2100px; background: linear-gradient(#fff7ed, #e0f2fe); }
    .hero { height: 820px; color: var(--hero-text); }
    .card { width: 420px; height: 260px; background: #0f766e; color: white; }
  </style>
</head>
<body class="original-body" data-theme="ai-report">
  <div class="wrap">
    <section class="hero"><h1>阵地矩阵</h1><button id="toggle">交互按钮</button></section>
    <section class="card">颜色素材</section>
  </div>
  <script>document.body.dataset.scriptLoaded = 'yes';</script>
</body>
</html>`;

await writeFile(
  entryPath,
  `
import { buildExportHtml, buildSlidePreviewDoc, collectReferencedAssetPaths, parseHtmlProject } from ${JSON.stringify(projectModulePath)};

const fixture = ${JSON.stringify(fixture)};
const shortFixture = ${JSON.stringify(shortFixture)};
const longFixture = ${JSON.stringify(longFixture)};
const interactiveFixture = ${JSON.stringify(interactiveFixture)};
const explicitSlidesFixture = '<!doctype html><html><head><title>Slides</title><style>.page{width:1280px;height:720px}</style></head><body><section data-slide class="page"><h1>One</h1></section><section data-slide class="page"><h1>Two</h1></section></body></html>';
const parsed = parseHtmlProject(fixture, 'index.html', '/tmp/ai-report/index.html', '/tmp/ai-report');
const slide = parsed.slides[0];
const exported = buildExportHtml(parsed.slides, parsed.meta);
const preview = buildSlidePreviewDoc(slide, parsed.meta);
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

assert(parsed.slides.length === 1, 'expected a single imported page');
assert(parsed.meta.documentMode === true, 'plain imported HTML should default to document mode');
assert(slide.presentationMode === 'scroll', 'single imported HTML should default to scroll mode');
assert(slide.canvasHeight >= 1600, 'scroll page should keep a tall editable canvas');
assert(/^<div[^>]*class="wrap"/.test(slide.components), 'single root .wrap should remain the page root, not be nested inside a forced section');
assert(!/^<div[^>]*class="[^"]*deck-slide/.test(slide.components), 'document mode root should not receive slide-only classes');
assert(parsed.meta.headExtras.includes('stylesheet'), 'external stylesheet link should be preserved');
assert(parsed.meta.bodyScripts.includes('scriptLoaded'), 'body scripts should be preserved for preview/export');
assert(parsed.meta.htmlAttributes?.class === 'theme-dark', 'html class should be preserved for theme-dependent CSS');
assert(exported.includes('body class="original-body"'), 'body class should be preserved in document export');
assert(exported.includes('<html lang="zh-CN" class="theme-dark" data-density="demo">'), 'document export should preserve html attributes');
assert(!exported.includes('htmlppt-deck'), 'document export should not add deck runtime classes');
assert(!exported.includes('<main'), 'document export should not wrap pages in a main that breaks body > .wrap selectors');
assert(!exported.includes('data-presentation-mode='), 'document export should strip editor-only slide attributes');
assert(!exported.includes('data-htmlppt-document-root'), 'document export should strip editor document root attributes');
assert(/<div[^>]*class="wrap"[^>]*>/.test(exported), 'document export should restore the original root element class');
assert(preview.includes('<base href="file:///tmp/ai-report/">'), 'srcDoc preview should include a base href for relative assets');
assert(!preview.includes('background: #ffffff'), 'document preview should not force a white browser background');
assert(!preview.includes('deck-slide {'), 'document preview should not inject slide-only CSS');

const shortParsed = parseHtmlProject(shortFixture, 'short-card.html', '/tmp/qa/short-card.html', '/tmp/qa');
assert(shortParsed.meta.documentMode === true && shortParsed.slides.length === 1, 'short HTML should import as one document page');
assert(!buildExportHtml(shortParsed.slides, shortParsed.meta).includes('htmlppt-deck'), 'short document export should not include deck runtime');

const longParsed = parseHtmlProject(longFixture, 'long-report.html', '/tmp/qa/long-report.html', '/tmp/qa');
assert(longParsed.meta.documentMode === true, 'long report with multiple normal sections should remain document mode');
assert(longParsed.slides.length === 1, 'normal sections must not be guessed as slides');
assert(longParsed.slides[0].canvasHeight >= 1600, 'long report should get a tall editable canvas');

const interactiveParsed = parseHtmlProject(interactiveFixture, 'index.html', '/tmp/qa/interactive/index.html', '/tmp/qa/interactive');
const interactiveExport = buildExportHtml(interactiveParsed.slides, interactiveParsed.meta);
const interactiveAssets = collectReferencedAssetPaths(interactiveExport);
assert(interactiveParsed.meta.headExtras.includes('./styles.css'), 'interactive fixture should preserve linked CSS');
assert(interactiveParsed.meta.headExtras.includes('./css/nested.css'), 'interactive fixture should preserve nested linked CSS');
assert(interactiveParsed.meta.bodyScripts.includes('./scripts.js'), 'interactive fixture should preserve linked JS');
assert(interactiveAssets.includes('./styles.css'), 'export asset scan should include linked CSS');
assert(interactiveAssets.includes('./css/nested.css'), 'export asset scan should include nested linked CSS');
assert(interactiveAssets.includes('./scripts.js'), 'export asset scan should include linked JS');
assert(interactiveAssets.includes('./assets/mark.svg'), 'export asset scan should include referenced image assets');

const slidesParsed = parseHtmlProject(explicitSlidesFixture, 'slides.html', '/tmp/slides.html', '/tmp');
const slidesExport = buildExportHtml(slidesParsed.slides, slidesParsed.meta);
assert(slidesParsed.meta.documentMode === false, 'explicit data-slide sections should import as slide mode');
assert(slidesParsed.slides.length === 2, 'explicit slides should keep multiple pages');
assert(slidesExport.includes('htmlppt-deck'), 'slide export should include deck runtime');
assert(slidesExport.includes('data-htmlppt-runtime'), 'slide export should include presenter runtime');

window.__SMOKE_RESULT = { ok: failures.length === 0, failures };
console.log('SMOKE_RESULT:' + JSON.stringify(window.__SMOKE_RESULT));
`
);

await build({
  entryPoints: [entryPath],
  bundle: true,
  outfile: bundlePath,
  platform: 'browser',
  format: 'iife',
  logLevel: 'silent'
});

await writeFile(htmlPath, `<!doctype html><html><body><script src="./bundle.js"></script></body></html>`);

await writeFile(
  mainPath,
  `
const { app, BrowserWindow } = require('electron');

let done = false;
function finish(code) {
  if (done) return;
  done = true;
  app.exit(code);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.webContents.on('console-message', (_event, _level, message) => {
    console.log(message);
  });

  await win.loadFile(${JSON.stringify(htmlPath)});
  const result = await win.webContents.executeJavaScript('window.__SMOKE_RESULT || null');
  if (result) {
    console.log('SMOKE_RESULT:' + JSON.stringify(result));
    finish(result.ok ? 0 : 1);
    return;
  }
  setTimeout(() => finish(1), 10000);
});
`
);

const child = spawn(electronPath, [mainPath], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe']
});

let stdout = '';
let stderr = '';
child.stdout.on('data', (chunk) => {
  stdout += chunk;
});
child.stderr.on('data', (chunk) => {
  stderr += chunk;
});

const code = await new Promise((resolveExit) => {
  child.on('exit', (exitCode) => resolveExit(exitCode ?? 1));
});

const resultLine = stdout
  .split(/\r?\n/)
  .map((line) => line.trim())
  .find((line) => line.startsWith('SMOKE_RESULT:'));

if (!resultLine) {
  console.error(stdout);
  console.error(stderr);
  throw new Error('Smoke test did not return a result');
}

const result = JSON.parse(resultLine.slice('SMOKE_RESULT:'.length));
if (!result.ok) {
  console.error(result.failures.join('\\n'));
  process.exit(1);
}

if (code !== 0) process.exit(code);
console.log('Smoke rendering checks passed.');
