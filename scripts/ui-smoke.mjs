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
            view: frameWindow,
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
        const fontSizeValue = Number(menu?.querySelector('input[aria-label="字号"]')?.value || 0);
        if (contextTarget.matches('h1') && fontSizeValue < 50) {
          failures.push('context menu should show the selected heading computed font size, not the fallback size');
        }
        document.body.click();

        const beforeLeft = Number.parseFloat(frameWindow.getComputedStyle(contextTarget).left);
        frameDoc.dispatchEvent(
          new frameWindow.KeyboardEvent('keydown', {
            bubbles: true,
            cancelable: true,
            key: 'ArrowRight'
          })
        );
        await delay(80);
        const afterLeft = Number.parseFloat(contextTarget.style.left || frameWindow.getComputedStyle(contextTarget).left);
        if (Number.isFinite(beforeLeft) && Number.isFinite(afterLeft) && afterLeft <= beforeLeft) {
          failures.push('arrow keys should nudge the selected element');
        }

        const paragraph = frameDoc.querySelector('p');
        if (!paragraph) {
          failures.push('default canvas should include a paragraph for multi-select checks');
        } else {
          const multiTarget = frameDoc.querySelector('h1, h2, p, button, span') || contextTarget;
          multiTarget.dispatchEvent(
            new frameWindow.MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: frameWindow,
            clientX: 40,
            clientY: 40
          })
          );
          paragraph.dispatchEvent(
            new frameWindow.MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              view: frameWindow,
              shiftKey: true,
              clientX: 44,
              clientY: 120
            })
          );
          await delay(300);
          if (!document.body.innerText.includes('已选 2') && !document.body.innerText.includes('已选择 2')) {
            failures.push(
              'shift-click should multi-select canvas elements: ' +
                JSON.stringify({
                  toolbarText: document.querySelector('.canvas-tools')?.textContent || '',
                  marked: Array.from(frameDoc.querySelectorAll('[data-html-demo-multi-selected="true"]')).map((element) => ({
                    tag: element.tagName,
                    text: element.textContent.trim().slice(0, 40)
                  })),
                  h1Connected: multiTarget.isConnected,
                  pConnected: paragraph.isConnected,
                  toast: document.querySelector('.toast')?.textContent || ''
                })
            );
          }
          const groupButton = document.querySelector('.canvas-tools button[title="组合"]');
          if (!groupButton || groupButton.disabled) {
            failures.push('multi-select should enable group action');
          } else {
            const beforeGroupState = {
              selectedText: document.body.innerText.match(/已选 \\d|已选择 \\d/)?.[0],
              marked: Array.from(frameDoc.querySelectorAll('[data-html-demo-multi-selected="true"]')).map((element) => ({
                tag: element.tagName,
                text: element.textContent.trim().slice(0, 40)
              })),
              toast: document.querySelector('.toast')?.textContent || ''
            };
            groupButton.click();
            await delay(500);
            const groupedFrameDoc = document.querySelector('.gjs-frame')?.contentDocument;
            if (!groupedFrameDoc?.querySelector('[data-html-demo-group="true"]')) {
              failures.push(
                'group action should wrap selected elements in an editable group: ' +
                  JSON.stringify({
                    beforeGroupState,
                    selectedText: document.body.innerText.match(/已选 \\d|已选择 \\d/)?.[0],
                    groupDisabled: groupButton.disabled,
                    markedAfter: Array.from(groupedFrameDoc?.querySelectorAll('[data-html-demo-multi-selected="true"]') || []).map((element) => ({
                      tag: element.tagName,
                      text: element.textContent.trim().slice(0, 40)
                    })),
                    toast: document.querySelector('.toast')?.textContent || '',
                    slideHtml: groupedFrameDoc?.querySelector('.deck-slide')?.innerHTML?.slice(0, 260)
                  })
              );
            }
            const ungroupButton = document.querySelector('.canvas-tools button[title="取消组合"]');
            if (!ungroupButton || ungroupButton.disabled) {
              failures.push('group selection should enable ungroup action');
            } else {
              ungroupButton.click();
              await delay(500);
              const ungroupedFrameDoc = document.querySelector('.gjs-frame')?.contentDocument;
              if (ungroupedFrameDoc?.querySelector('[data-html-demo-group="true"]')) {
                failures.push('ungroup action should unwrap the selected group');
              }
            }
          }
          document.querySelector('.right-pane .pane-tabs button:nth-child(2)')?.click();
          await delay(80);
          if (!document.body.innerText.includes('对象图层')) {
            failures.push('layer tab should expose a productized object layer panel');
          }
        }
      }

      for (let i = 0; i < 3; i += 1) {
        const deleteButton = document.querySelector('.slide-row.is-active .slide-actions button[title="删除页面"]');
        deleteButton?.click();
        await delay(80);
      }
      if (count('.slide-row') !== 1) failures.push('deleting the last page should leave one editable page');
      if (!document.body.innerText.includes('新页面')) failures.push('last page delete should create a blank page');
      const lastFrameDoc = document.querySelector('.gjs-frame')?.contentDocument;
      const lastSlide = lastFrameDoc?.querySelector('.deck-slide');
      if (!lastSlide) failures.push('last page delete should keep an editable deck-slide root');
      if (lastSlide && lastSlide.children.length !== 0) failures.push('last page delete should create a truly blank canvas');
      if (lastFrameDoc?.body.innerText.includes('双击这里编辑正文内容')) {
        failures.push('blank canvas should not keep starter instruction content');
      }

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
