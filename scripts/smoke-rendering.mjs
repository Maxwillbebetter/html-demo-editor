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

const fixture = String.raw`<!doctype html>
<html>
<head>
  <title>AI long page</title>
  <link rel="stylesheet" href="./styles.css">
  <style>
    body.original-body > .wrap { width: 1440px; min-height: 2100px; background: linear-gradient(#fff7ed, #e0f2fe); }
    .hero { height: 820px; color: #123; }
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
import { buildExportHtml, buildSlidePreviewDoc, parseHtmlProject } from ${JSON.stringify(projectModulePath)};

const fixture = ${JSON.stringify(fixture)};
const parsed = parseHtmlProject(fixture, 'index.html', '/tmp/ai-report/index.html', '/tmp/ai-report');
const slide = parsed.slides[0];
const exported = buildExportHtml(parsed.slides, parsed.meta);
const preview = buildSlidePreviewDoc(slide, parsed.meta);
const failures = [];

if (parsed.slides.length !== 1) failures.push('expected a single imported page');
if (parsed.meta.documentMode !== true) failures.push('plain imported HTML should default to document mode');
if (slide.presentationMode !== 'scroll') failures.push('single imported HTML should default to scroll mode');
if (slide.canvasHeight < 1600) failures.push('scroll page should keep a tall editable canvas');
if (!/^<div[^>]*class="wrap\\s+deck-slide|^<div[^>]*class="deck-slide\\s+wrap/.test(slide.components)) {
  failures.push('single root .wrap should remain the page root, not be nested inside a forced section');
}
if (!parsed.meta.headExtras.includes('stylesheet')) failures.push('external stylesheet link should be preserved');
if (!parsed.meta.bodyScripts.includes('scriptLoaded')) failures.push('body scripts should be preserved for preview/export');
if (!exported.includes('body class="original-body"')) failures.push('body class should be preserved in document export');
if (exported.includes('htmlppt-deck')) failures.push('document export should not add deck runtime classes');
if (exported.includes('<main')) failures.push('document export should not wrap pages in a main that breaks body > .wrap selectors');
if (exported.includes('data-presentation-mode=')) failures.push('document export should strip editor-only slide attributes');
if (!/<div[^>]*class="wrap"[^>]*>/.test(exported)) failures.push('document export should restore the original root element class');
if (!preview.includes('<base href="file:///tmp/ai-report/">')) failures.push('srcDoc preview should include a base href for relative assets');

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
