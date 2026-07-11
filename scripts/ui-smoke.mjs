import electronPath from 'electron';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rendererPath = join(root, 'out/renderer/index.html');
const longFixturePath = join(root, 'fixtures/qa/long-report.html');
const interactiveFixturePath = join(root, 'fixtures/qa/interactive/index.html');
const widthArg = process.argv.find((item) => item.startsWith('--width='));
const heightArg = process.argv.find((item) => item.startsWith('--height='));
const screenshotArg = process.argv.find((item) => item.startsWith('--screenshot='));
const uiWidth = Number.parseInt(widthArg?.split('=')[1] || '1600', 10) || 1600;
const uiHeight = Number.parseInt(heightArg?.split('=')[1] || '1000', 10) || 1000;
const longFixture = await readFile(longFixturePath, 'utf8');
const interactiveFixture = await readFile(interactiveFixturePath, 'utf8');
const longFixtureBase64 = Buffer.from(longFixture, 'utf8').toString('base64');
const interactiveFixtureBase64 = Buffer.from(interactiveFixture, 'utf8').toString('base64');

if (!existsSync(rendererPath)) {
  throw new Error('Run npm run build before npm run test:ui');
}

const tempDir = await mkdtemp(join(tmpdir(), 'html-demo-editor-ui-smoke-'));
const mainPath = join(tempDir, 'main.cjs');

await writeFile(
  mainPath,
  `
const { app, BrowserWindow, net, protocol } = require('electron');
const { isAbsolute, relative, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');

const fixtureRoot = ${JSON.stringify(dirname(interactiveFixturePath))};

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'html-demo-local',
    privileges: {
      standard: true,
      secure: true,
      bypassCSP: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
]);

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
	  protocol.handle('html-demo-local', async (request) => {
	    const url = new URL(request.url);
	    if (url.hostname !== 'fixture') return new Response('Unknown project', { status: 404 });
	    const requestedPath = decodeURIComponent(url.pathname).replace(/^\\/+/, '');
	    const filePath = resolve(fixtureRoot, requestedPath);
	    const relativePath = relative(fixtureRoot, filePath);
	    if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
	      return new Response('Blocked path', { status: 403 });
	    }
	    return net.fetch(pathToFileURL(filePath).href);
	  });

	  const win = new BrowserWindow({
    width: ${uiWidth},
    height: ${uiHeight},
    show: false,
	    webPreferences: {
	      contextIsolation: true,
	      nodeIntegration: false,
	      sandbox: false
	    }
	  });

  await win.loadFile(${JSON.stringify(rendererPath)});
  await waitFor(win, 'Boolean(document.querySelector(".app-shell") && document.querySelector(".gjs-editor"))');

  if (${JSON.stringify(Boolean(screenshotArg))}) {
    await new Promise((resolve) => setTimeout(resolve, 420));
    const screenshot = await win.webContents.capturePage();
    await require('node:fs/promises').writeFile(${JSON.stringify(
      screenshotArg ? resolve(root, screenshotArg.slice('--screenshot='.length)) : ''
    )}, screenshot.toPNG());
  }

	  const result = await win.webContents.executeJavaScript(\`
	    (async () => {
	      try {
	      await new Promise((resolve) => setTimeout(resolve, 320));
	      const text = document.body.innerText;
      const failures = [];
      const hasText = (value) => text.includes(value);
      const hasTitle = (value) => Boolean(document.querySelector('[title="' + value + '"]'));
      const count = (selector) => document.querySelectorAll(selector).length;
	      const shell = document.querySelector('.editor-shell')?.getBoundingClientRect();
	      const host = document.querySelector('.editor-host')?.getBoundingClientRect();
	      const frame = document.querySelector('.gjs-frame-wrapper')?.getBoundingClientRect();
	      const canvasRegion = document.querySelector('.canvas-region')?.getBoundingClientRect();
	      const rightPane = document.querySelector('.right-pane')?.getBoundingClientRect();
	      const resizeHandle = document.querySelector('.canvas-resize-handle')?.getBoundingClientRect();
	      const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
	      const waitUntil = async (predicate, timeout = 5000) => {
	        const started = Date.now();
	        while (Date.now() - started < timeout) {
	          if (predicate()) return true;
	          await delay(80);
	        }
	        return false;
	      };

	      const decodeFixture = (value) => new TextDecoder().decode(Uint8Array.from(atob(value), (character) => character.charCodeAt(0)));
	      const fixtures = {
	        long: {
	          html: decodeFixture(${JSON.stringify(longFixtureBase64)}),
	          name: 'long-report.html',
	          filePath: ${JSON.stringify(longFixturePath)},
	          baseDir: ${JSON.stringify(dirname(longFixturePath))}
	        },
	        interactive: {
	          html: decodeFixture(${JSON.stringify(interactiveFixtureBase64)}),
	          name: 'index.html',
	          filePath: ${JSON.stringify(interactiveFixturePath)},
	          baseDir: ${JSON.stringify(dirname(interactiveFixturePath))},
	          assetBaseUrl: 'html-demo-local://fixture/'
	        }
	      };
	      const desktopState = {
	        fixtureMode: 'long',
	        dropPath: ${JSON.stringify(interactiveFixturePath)},
	        saved: null,
	        presented: null
	      };
	      window.confirm = () => true;
	      window.desktopBridge = {
	        openHtmlFile: async () => fixtures[desktopState.fixtureMode],
	        openProjectFolder: async () => fixtures.interactive,
	        openPath: async (filePath) => filePath.includes('long-report') ? fixtures.long : fixtures.interactive,
	        listRecentFiles: async () => [],
	        onOpenPathRequested: () => () => {},
	        getPathForFile: () => desktopState.dropPath,
	        saveProject: async (payload) => {
	          desktopState.saved = payload;
	          return { filePath: '/tmp/html-demo-editor-saved.html' };
	        },
	        saveProjectAs: async (payload) => {
	          desktopState.saved = payload;
	          return { filePath: '/tmp/html-demo-editor-saved-as.html' };
	        },
	        autoSaveProject: async () => ({ savedAt: new Date().toISOString() }),
	        loadAutoSave: async () => null,
	        clearAutoSave: async () => true,
	        exportPackage: async () => ({ filePath: '/tmp/html-demo-editor-export/index.html' }),
	        selectImage: async () => null,
	        presentProject: async (payload) => {
	          desktopState.presented = payload;
	        }
	      };

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
	      if (!canvasRegion || !host || Math.abs(canvasRegion.width - host.width) > 2) {
	        failures.push('editor host should stay inside the center workspace column');
	      }
	      if (host && rightPane && host.right > rightPane.left + 2) {
	        failures.push('editor host must not render underneath the property pane');
	      }
	      if (!frame || Math.abs(frame.x - host.x) > 2 || Math.abs(frame.y - host.y) > 2) {
	        failures.push('canvas frame should align to the editor viewport top-left');
	      }
	      if (!resizeHandle || !frame || Math.abs(resizeHandle.right - frame.right) > 5 || Math.abs(resizeHandle.bottom - frame.bottom) > 5) {
	        failures.push('canvas resize handle should attach to the visible canvas corner: ' + JSON.stringify({ resizeHandle, frame }));
	      }
	      if (!hasTitle('交互预览')) failures.push('canvas interaction preview control missing');
	      if (!document.querySelector('.statusbar')?.textContent?.includes('尚未保存')) {
	        failures.push('new unsaved project should not claim to be saved');
	      }

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

	      document.querySelector('button[title="打开"]')?.click();
	      if (!(await waitUntil(() => document.body.innerText.includes('长页 HTML 报告测试')))) {
	        failures.push('open should load a long HTML document into the editor');
	      } else {
	        await delay(1100);
	        const longHost = document.querySelector('.editor-host')?.getBoundingClientRect();
	        const longFrame = document.querySelector('.gjs-frame-wrapper')?.getBoundingClientRect();
	        const longCanvas = document.querySelector('.gjs-cv-canvas');
	        const longFrameDoc = document.querySelector('.gjs-frame')?.contentDocument;
	        const report = longFrameDoc?.querySelector('.report');
	        const reportStyle = report && longFrameDoc?.defaultView?.getComputedStyle(report);
	        const longZoom = Number.parseFloat(document.querySelector('.zoom-value')?.textContent || '100');
	        if (!longHost || !longFrame || longFrame.width > longHost.width + 2 || longFrame.right > longHost.right + 2) {
	          failures.push('long HTML should fit its full width inside the editor viewport');
	        }
	        if (!(longZoom > 10 && longZoom < 100)) failures.push('long fixed-width HTML should be scaled to the editor width');
	        if (!longCanvas || longCanvas.scrollHeight <= longCanvas.clientHeight) {
	          failures.push('long HTML should remain vertically scrollable in the editor');
	        }
	        if (!reportStyle?.backgroundImage.includes('linear-gradient')) {
	          failures.push('long HTML should preserve its original background styling');
	        }
	        if (document.querySelector('.statusbar')?.textContent?.includes('有未保存修改')) {
	          failures.push('opening an HTML file should not be marked dirty by editor normalization');
	        }
	      }

	      desktopState.fixtureMode = 'interactive';
	      document.querySelector('button[title="打开"]')?.click();
	      if (!(await waitUntil(() => document.body.innerText.includes('外链 CSS / JS / 图片资源测试')))) {
	        failures.push('open should load an interactive HTML project');
	      } else {
	        await waitUntil(() => document.querySelector('.gjs-frame')?.contentDocument?.body?.dataset.qaScriptLoaded === 'true');
	        const interactiveDoc = document.querySelector('.gjs-frame')?.contentDocument;
	        const interactiveWindow = interactiveDoc?.defaultView;
	        const motionCard = interactiveDoc?.querySelector('.motion-card');
	        if (interactiveDoc?.body.dataset.qaScriptLoaded !== 'true') {
	          failures.push('interactive HTML should run its preserved script in the editor canvas');
	        }
	        if (!motionCard || interactiveWindow?.getComputedStyle(motionCard).animationName !== 'float-card') {
	          failures.push('interactive HTML should preserve CSS animation');
	        }
	        const interactiveBodyStyle = interactiveDoc && interactiveWindow?.getComputedStyle(interactiveDoc.body);
	        if (!interactiveBodyStyle?.backgroundImage.includes('html-demo-local://fixture/assets/pattern.svg')) {
	          failures.push('interactive HTML should load relative images through the guarded local asset protocol');
	        }
	        const blockedRequest = await fetch('html-demo-local://fixture/..%2Fpackage.json');
	        if (blockedRequest.status !== 403) {
	          failures.push('local asset protocol should block encoded parent-directory traversal');
	        }
	        const interactionButton = document.querySelector('button[title="交互预览"]');
	        interactionButton?.click();
	        await delay(80);
	        const themeButton = interactiveDoc?.querySelector('#toggleTheme');
	        themeButton?.dispatchEvent(new interactiveWindow.MouseEvent('click', { bubbles: true, cancelable: true, view: interactiveWindow }));
	        await delay(80);
	        if (!interactiveDoc?.body.classList.contains('dark')) {
	          failures.push('interaction preview should let imported page controls receive clicks');
	        }
	        const darkColor = interactiveDoc && interactiveWindow?.getComputedStyle(interactiveDoc.body).color;
	        if (darkColor !== 'rgb(248, 250, 252)') {
	          failures.push('interactive color theme should stay readable after script-driven state changes');
	        }

	        document.querySelector('button[title="代码"]')?.click();
	        await delay(80);
	        const htmlEditor = document.querySelector('.code-grid textarea');
	        if (!htmlEditor) {
	          failures.push('code view should expose the current page HTML');
	        } else {
	          const nextCode = htmlEditor.value.replace('外链 CSS / JS / 图片资源测试', '已修改的交互标题');
	          Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(htmlEditor, nextCode);
	          htmlEditor.dispatchEvent(new Event('input', { bubbles: true }));
	          await delay(80);
	          document.querySelector('.code-dialog button.primary')?.click();
	          if (!(await waitUntil(() => document.querySelector('.gjs-frame')?.contentDocument?.body?.innerText.includes('已修改的交互标题')))) {
	            failures.push('code edits should refresh the current canvas');
	          }
	        }

	        document.querySelector('button[title="保存"]')?.click();
	        await waitUntil(() => Boolean(desktopState.saved));
	        await delay(240);
	        if (!desktopState.saved?.html?.includes('已修改的交互标题')) {
	          failures.push('save should use the latest edited HTML');
	        }
	        if (!document.querySelector('[role="status"]')?.textContent?.includes('已保存到')) {
	          failures.push('save should show a visible success message');
	        }
	        if (!document.querySelector('.statusbar')?.textContent?.includes('已保存')) {
	          failures.push('save should update the durable status indicator');
	        }

	        document.querySelector('button[title="预览"]')?.click();
	        await waitUntil(() => Boolean(desktopState.presented));
	        if (!desktopState.presented?.html?.includes('已修改的交互标题')) {
	          failures.push('preview should use the latest edited HTML');
	        }
	        if (desktopState.presented?.html !== desktopState.saved?.html) {
	          failures.push(
	            'preview immediately after save should exactly match the saved HTML: ' +
	              JSON.stringify({ savedLength: desktopState.saved?.html?.length, presentedLength: desktopState.presented?.html?.length })
	          );
	        }
	      }

	      desktopState.dropPath = fixtures.long.filePath;
	      const transfer = new DataTransfer();
	      transfer.items.add(new File(['html'], 'long-report.html', { type: 'text/html' }));
	      window.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: transfer }));
	      await delay(40);
	      if (!document.querySelector('.drop-overlay')) failures.push('file drag should show an open affordance');
	      window.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
	      if (!(await waitUntil(() => document.body.innerText.includes('长页 HTML 报告测试')))) {
	        failures.push('dropping an HTML file should open it');
	      }

	      return { ok: failures.length === 0, failures };
	      } catch (error) {
	        return { ok: false, failures: ['UI smoke crashed: ' + (error?.stack || String(error))] };
	      }
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
  console.error(stdout);
  console.error(result.failures.join('\\n'));
  process.exit(1);
}

if (code !== 0) process.exit(code);
console.log('UI smoke checks passed.');
