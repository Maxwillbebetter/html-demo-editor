import electronPath from 'electron';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rendererPath = join(root, 'out/renderer/index.html');

if (!existsSync(rendererPath)) {
  throw new Error('Run npm run build before npm run test:ui');
}

const tempDir = await mkdtemp(join(tmpdir(), 'html-demo-editor-ui-smoke-'));
const mainPath = join(tempDir, 'main.cjs');

await writeFile(
  mainPath,
  `
const { app, BrowserWindow } = require('electron');

function waitFor(win, expression, timeout = 12000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const value = await win.webContents.executeJavaScript(expression);
        if (value) {
          resolve(value);
          return;
        }
      } catch {}
      if (Date.now() - started > timeout) {
        reject(new Error('Timed out waiting for ' + expression));
        return;
      }
      setTimeout(tick, 120);
    };
    tick();
  });
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  await win.loadFile(${JSON.stringify(rendererPath)});
  await waitFor(win, 'Boolean(document.querySelector(".app-shell") && document.querySelector(".gjs-editor"))');

  const result = await win.webContents.executeJavaScript(\`
    (async () => {
      const text = document.body.innerText;
      const failures = [];
      const hasText = (value) => text.includes(value);
      const hasTitle = (value) => Boolean(document.querySelector('[title="' + value + '"]'));
      const count = (selector) => document.querySelectorAll(selector).length;
      const shell = document.querySelector('.editor-shell')?.getBoundingClientRect();
      const host = document.querySelector('.editor-host')?.getBoundingClientRect();
      const frame = document.querySelector('.gjs-frame-wrapper')?.getBoundingClientRect();

      if (!hasText('HTML Demo Editor')) failures.push('brand missing');
      ['新建', '打开', '保存', '预览', '演示', '导出'].forEach((label) => {
        if (!hasText(label) && !hasTitle(label)) failures.push('toolbar missing ' + label);
      });
      ['页面', '组件', '样式', '图层'].forEach((label) => {
        if (!hasText(label)) failures.push('pane tab missing ' + label);
      });
      if (!hasText('宽') || !hasText('全') || !hasTitle('铺满宽度') || !hasTitle('适配整屏')) failures.push('canvas fit controls missing');
      if (count('.slide-row') !== 3) failures.push('default project should have 3 pages');
      if (!document.querySelector('.page-pane select')) failures.push('project/page mode select missing');
      if (!shell || shell.width < 500 || shell.height < 400) failures.push('editor shell too small');
      if (!host || host.width < 500 || host.height < 400) failures.push('editor host too small');
      if (!frame || Math.abs(frame.x - host.x) > 2 || Math.abs(frame.y - host.y) > 2) {
        failures.push('canvas frame should align to the editor viewport top-left');
      }

      const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const iframe = document.querySelector('.gjs-frame');
      const frameDoc = iframe?.contentDocument;
      const frameWindow = iframe?.contentWindow;
      const contextTarget = frameDoc?.querySelector('h1, h2, p, button, span');
      if (!frameDoc || !frameWindow || !contextTarget) {
        failures.push('canvas frame content missing for context menu check');
      } else {
        contextTarget.dispatchEvent(
          new frameWindow.MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: 48,
            clientY: 48
          })
        );
        await delay(80);
        const menu = document.querySelector('.context-menu');
        const menuText = menu?.textContent || '';
        if (!menuText.includes('编辑文字') || !menuText.includes('复制') || !menuText.includes('删除')) {
          failures.push('canvas context menu should expose quick edit actions');
        }
        if (
          !menu?.querySelector('select') ||
          !menu?.querySelector('input[aria-label="字号"]') ||
          !menu?.querySelector('input[aria-label="文字颜色"]') ||
          !menu?.querySelector('input[aria-label="背景颜色"]')
        ) {
          failures.push('canvas context menu should expose PPT-like quick style controls');
        }
        document.body.click();
      }

      for (let i = 0; i < 3; i += 1) {
        const deleteButton = document.querySelector('.slide-row.is-active .slide-actions button[title="删除页面"]');
        deleteButton?.click();
        await delay(80);
      }
      if (count('.slide-row') !== 1) failures.push('deleting the last page should leave one editable page');
      if (!document.body.innerText.includes('新页面')) failures.push('last page delete should create a blank page');

      return { ok: failures.length === 0, failures };
    })()
  \`);

  console.log('UI_SMOKE_RESULT:' + JSON.stringify(result));
  app.exit(result.ok ? 0 : 1);
}).catch((error) => {
  console.error(error);
  app.exit(1);
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

const line = stdout
  .split(/\r?\n/)
  .map((item) => item.trim())
  .find((item) => item.startsWith('UI_SMOKE_RESULT:'));

if (!line) {
  console.error(stdout);
  console.error(stderr);
  throw new Error('UI smoke test did not return a result');
}

const result = JSON.parse(line.slice('UI_SMOKE_RESULT:'.length));
if (!result.ok) {
  console.error(result.failures.join('\\n'));
  process.exit(1);
}

if (code !== 0) process.exit(code);
console.log('UI smoke checks passed.');
