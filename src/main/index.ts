import { app, BrowserWindow, dialog, ipcMain, type MessageBoxOptions, type OpenDialogOptions, type SaveDialogOptions } from 'electron';
import { mkdir, readFile, readdir, stat, writeFile, cp, unlink } from 'node:fs/promises';
import { basename, dirname, extname, join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { copyReferencedAssets } from './assets';

interface SavePayload {
  filePath?: string;
  html: string;
  defaultName?: string;
  sourceBaseDir?: string;
  assetPaths?: string[];
}

interface ExportPayload {
  html: string;
  sourceBaseDir?: string;
  assetPaths?: string[];
}

interface PresentPayload {
  html: string;
  baseDir?: string;
  fullscreen?: boolean;
  startSlideIndex?: number;
}

interface AutoSavePayload {
  html: string;
  title?: string;
  filePath?: string;
  baseDir?: string;
  sourceName?: string;
}

interface AutoSaveRecord extends AutoSavePayload {
  savedAt: string;
}

interface RecentFileRecord {
  filePath: string;
  name: string;
  baseDir: string;
  openedAt: string;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
let mainWindow: BrowserWindow | null = null;
let presenterWindow: BrowserWindow | null = null;
let pendingOpenPath: string | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1180,
    minHeight: 760,
    autoHideMenuBar: true,
    title: 'HTML Demo Editor',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.webContents.once('did-finish-load', () => {
    if (pendingOpenPath) {
      mainWindow?.webContents.send('project:open-path-requested', pendingOpenPath);
      pendingOpenPath = null;
    }
  });
}

function escapeAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}

function withBaseHref(html: string, baseDir?: string): string {
  if (!baseDir) return html;
  const baseHref = pathToFileURL(`${baseDir}${sep}`).href;
  const baseTag = `<base href="${escapeAttribute(baseHref)}">`;

  if (/<base\s/i.test(html)) return html;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`);
  }

  return `<!doctype html><html><head>${baseTag}</head><body>${html}</body></html>`;
}

async function readHtmlFile(filePath: string) {
  const html = await readFile(filePath, 'utf8');
  return {
    filePath,
    baseDir: dirname(filePath),
    html,
    name: basename(filePath)
  };
}

function getAutoSavePath(): string {
  return join(app.getPath('userData'), 'autosave.json');
}

function getRecentFilesPath(): string {
  return join(app.getPath('userData'), 'recent-files.json');
}

function findLaunchOpenPath(argv: string[]): string | null {
  const candidate = argv.find((item) => {
    if (!item || item.startsWith('-')) return false;
    const ext = extname(item).toLowerCase();
    return ['.html', '.htm'].includes(ext);
  });
  return candidate || null;
}

async function listRecentFiles(): Promise<RecentFileRecord[]> {
  try {
    const raw = await readFile(getRecentFilesPath(), 'utf8');
    const parsed = JSON.parse(raw) as RecentFileRecord[];
    return Array.isArray(parsed) ? parsed.slice(0, 8) : [];
  } catch {
    return [];
  }
}

async function addRecentFile(filePath: string): Promise<void> {
  const record: RecentFileRecord = {
    filePath,
    name: basename(filePath),
    baseDir: dirname(filePath),
    openedAt: new Date().toISOString()
  };
  const existing = (await listRecentFiles()).filter((item) => item.filePath !== filePath);
  await mkdir(dirname(getRecentFilesPath()), { recursive: true });
  await writeFile(getRecentFilesPath(), JSON.stringify([record, ...existing].slice(0, 8), null, 2), 'utf8');
}

async function readProjectPath(filePath: string) {
  const fileStat = await stat(filePath);
  if (fileStat.isDirectory()) {
    const entry = await findHtmlEntry(filePath);
    if (!entry) return null;
    return readHtmlFile(entry);
  }

  if (!['.html', '.htm'].includes(extname(filePath).toLowerCase())) return null;
  return readHtmlFile(filePath);
}

async function findHtmlEntry(folderPath: string): Promise<string | null> {
  const preferred = join(folderPath, 'index.html');
  try {
    const entryStat = await stat(preferred);
    if (entryStat.isFile()) return preferred;
  } catch {
    // Fall through to first html file.
  }

  const entries = await readdir(folderPath);
  const htmlFile = entries.find((entry) => ['.html', '.htm'].includes(extname(entry).toLowerCase()));
  return htmlFile ? join(folderPath, htmlFile) : null;
}

function withPreviewShell(html: string): string {
  if (/data-htmlppt-runtime/i.test(html) || /data-html-demo-preview-shell/i.test(html)) return html;

  const shellStyle = `<style data-html-demo-preview-shell>
.html-demo-preview-toolbar,
.html-demo-preview-toolbar * {
  box-sizing: border-box;
  font-family: "Segoe UI", Arial, sans-serif;
}
.html-demo-preview-toolbar {
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 2147483647;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px;
  border: 1px solid rgba(15, 23, 42, 0.15);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.9);
  color: #18202b;
  box-shadow: 0 14px 38px rgba(15, 23, 42, 0.18);
  opacity: 0.78;
  transition: opacity 140ms ease;
}
.html-demo-preview-toolbar:hover,
.html-demo-preview-toolbar:focus-within {
  opacity: 1;
}
.html-demo-preview-toolbar button,
.html-demo-preview-toolbar select {
  height: 30px;
  border: 1px solid #d6dde4;
  border-radius: 7px;
  background: #ffffff;
  color: #26313f;
  font: 13px/1 "Segoe UI", Arial, sans-serif;
}
.html-demo-preview-toolbar button {
  min-width: 34px;
  padding: 0 9px;
  cursor: pointer;
}
.html-demo-preview-toolbar button:hover {
  border-color: #0f766e;
  color: #0f766e;
}
.html-demo-preview-toolbar select {
  padding: 0 8px;
}
.html-demo-preview-scale {
  min-width: 46px;
  text-align: center;
  color: #475569;
  font: 13px/1 "Segoe UI", Arial, sans-serif;
}
.html-demo-preview-laser {
  position: fixed;
  left: 0;
  top: 0;
  z-index: 2147483646;
  display: none;
  width: 18px;
  height: 18px;
  margin: -9px 0 0 -9px;
  border-radius: 999px;
  background: rgba(239, 68, 68, 0.92);
  box-shadow: 0 0 0 8px rgba(239, 68, 68, 0.18), 0 0 22px rgba(239, 68, 68, 0.7);
  pointer-events: none;
}
.html-demo-preview-ink {
  position: fixed;
  inset: 0;
  z-index: 2147483645;
  pointer-events: none;
}
html.html-demo-preview-pointer-hidden,
html.html-demo-preview-pointer-hidden * ,
html.html-demo-preview-pointer-laser,
html.html-demo-preview-pointer-laser * ,
html.html-demo-preview-pointer-auto.html-demo-preview-pointer-idle,
html.html-demo-preview-pointer-auto.html-demo-preview-pointer-idle * {
  cursor: none !important;
}
html.html-demo-preview-pointer-pen,
html.html-demo-preview-pointer-pen * {
  cursor: crosshair !important;
}
.html-demo-preview-toolbar,
.html-demo-preview-toolbar * {
  cursor: default !important;
}
html.html-demo-preview-pointer-laser .html-demo-preview-laser {
  display: block;
}
</style>`;

  const shellScript = `<script data-html-demo-preview-shell>
(() => {
  if (window.__htmlDemoPreviewShell) return;
  window.__htmlDemoPreviewShell = true;

  const root = document.documentElement;
  const body = document.body;
  if (!body) return;

  let zoom = 1;
  let pointerMode = 'auto';
  let idleTimer = 0;
  let drawing = false;

  const toolbar = document.createElement('div');
  toolbar.className = 'html-demo-preview-toolbar';
  toolbar.innerHTML = [
    '<button type="button" data-preview-action="zoom-out" title="缩小">-</button>',
    '<span class="html-demo-preview-scale" data-preview-scale>100%</span>',
    '<button type="button" data-preview-action="zoom-in" title="放大">+</button>',
    '<button type="button" data-preview-action="fit-width" title="适配宽度">宽</button>',
    '<button type="button" data-preview-action="fit-screen" title="适配整屏">全</button>',
    '<button type="button" data-preview-action="actual" title="原始比例">100%</button>',
    '<select data-preview-pointer title="指针"><option value="auto">自动</option><option value="arrow">箭头</option><option value="hidden">隐藏</option><option value="laser">激光</option><option value="pen">画笔</option></select>',
    '<button type="button" data-preview-action="clear-ink" title="清除笔迹">清除</button>',
    '<button type="button" data-preview-action="exit" title="退出">退出</button>'
  ].join('');

  const laser = document.createElement('div');
  laser.className = 'html-demo-preview-laser';
  const ink = document.createElement('canvas');
  ink.className = 'html-demo-preview-ink';
  body.append(toolbar, laser, ink);

  const scaleLabel = toolbar.querySelector('[data-preview-scale]');
  const pointerSelect = toolbar.querySelector('[data-preview-pointer]');
  const context = ink.getContext('2d');

  function resizeInk() {
    const ratio = window.devicePixelRatio || 1;
    ink.width = Math.floor(window.innerWidth * ratio);
    ink.height = Math.floor(window.innerHeight * ratio);
    ink.style.width = window.innerWidth + 'px';
    ink.style.height = window.innerHeight + 'px';
    if (context) {
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.lineWidth = 3;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.strokeStyle = '#ef4444';
    }
  }

  function setZoom(nextZoom) {
    zoom = Math.max(0.25, Math.min(3, Number(nextZoom) || 1));
    body.style.zoom = String(zoom);
    toolbar.style.zoom = String(1 / zoom);
    laser.style.zoom = String(1 / zoom);
    ink.style.zoom = String(1 / zoom);
    if (scaleLabel) scaleLabel.textContent = Math.round(zoom * 100) + '%';
  }

  function measureAtActualZoom(callback) {
    const previousZoom = zoom;
    setZoom(1);
    requestAnimationFrame(() => {
      callback();
      if (Math.abs(zoom - 1) < 0.001 && previousZoom !== 1) setZoom(previousZoom);
    });
  }

  function fitWidth() {
    measureAtActualZoom(() => {
      const width = Math.max(document.body.scrollWidth, document.documentElement.scrollWidth, 1);
      setZoom(window.innerWidth / width);
    });
  }

  function fitScreen() {
    measureAtActualZoom(() => {
      const width = Math.max(document.body.scrollWidth, document.documentElement.scrollWidth, 1);
      const height = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, 1);
      setZoom(Math.min(window.innerWidth / width, window.innerHeight / height));
    });
  }

  function setPointerMode(mode) {
    pointerMode = mode;
    root.classList.remove(
      'html-demo-preview-pointer-auto',
      'html-demo-preview-pointer-hidden',
      'html-demo-preview-pointer-laser',
      'html-demo-preview-pointer-pen',
      'html-demo-preview-pointer-idle'
    );
    root.classList.add('html-demo-preview-pointer-' + pointerMode);
    laser.style.display = pointerMode === 'laser' ? 'block' : '';
    if (pointerSelect) pointerSelect.value = pointerMode;
  }

  function markPointerActive() {
    if (pointerMode !== 'auto') return;
    root.classList.remove('html-demo-preview-pointer-idle');
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => root.classList.add('html-demo-preview-pointer-idle'), 1800);
  }

  toolbar.addEventListener('click', (event) => {
    const button = event.target.closest('[data-preview-action]');
    if (!button) return;
    const action = button.getAttribute('data-preview-action');
    if (action === 'zoom-out') setZoom(zoom - 0.1);
    if (action === 'zoom-in') setZoom(zoom + 0.1);
    if (action === 'fit-width') fitWidth();
    if (action === 'fit-screen') fitScreen();
    if (action === 'actual') setZoom(1);
    if (action === 'clear-ink') {
      context?.clearRect(0, 0, ink.width, ink.height);
    }
    if (action === 'exit') {
      if (document.fullscreenElement) document.exitFullscreen();
      window.close();
    }
  });

  pointerSelect?.addEventListener('change', (event) => setPointerMode(event.target.value));
  window.addEventListener('resize', resizeInk);
  window.addEventListener('pointermove', (event) => {
    markPointerActive();
    laser.style.transform = 'translate(' + event.clientX + 'px,' + event.clientY + 'px)';
    if (pointerMode === 'pen' && drawing && context) {
      context.lineTo(event.clientX, event.clientY);
      context.stroke();
    }
  });
  window.addEventListener('pointerdown', (event) => {
    if (pointerMode !== 'pen' || !context) return;
    drawing = true;
    context.beginPath();
    context.moveTo(event.clientX, event.clientY);
  });
  window.addEventListener('pointerup', () => {
    drawing = false;
  });
  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (key === 'escape') {
      event.preventDefault();
      if (document.fullscreenElement) document.exitFullscreen();
      window.close();
    }
    if ((event.metaKey || event.ctrlKey) && key === '=') setZoom(zoom + 0.1);
    if ((event.metaKey || event.ctrlKey) && key === '-') setZoom(zoom - 0.1);
    if ((event.metaKey || event.ctrlKey) && key === '0') setZoom(1);
  });

  resizeInk();
  setPointerMode('auto');
  markPointerActive();
})();
</script>`;

  const withStyle = /<\/head>/i.test(html)
    ? html.replace(/<\/head>/i, `${shellStyle}</head>`)
    : `<!doctype html><html><head>${shellStyle}</head><body>${html}</body></html>`;

  if (/<\/body>/i.test(withStyle)) {
    return withStyle.replace(/<\/body>/i, `${shellScript}</body>`);
  }

  return `${withStyle}${shellScript}`;
}

async function chooseSavePath(defaultName = 'demo-material.html'): Promise<string | null> {
  const options: SaveDialogOptions = {
    title: '保存 HTML 演示材料',
    defaultPath: defaultName,
    filters: [{ name: 'HTML', extensions: ['html'] }]
  };
  const result = mainWindow ? await dialog.showSaveDialog(mainWindow, options) : await dialog.showSaveDialog(options);

  return result.canceled || !result.filePath ? null : result.filePath;
}

async function copyCommonAssets(sourceBaseDir: string | undefined, outputDir: string): Promise<void> {
  if (!sourceBaseDir) return;
  const candidates = ['assets', 'asset', 'images', 'imgs', 'img', 'css', 'js', 'media', 'fonts'];

  await Promise.all(
    candidates.map(async (folder) => {
      const source = join(sourceBaseDir, folder);
      const target = join(outputDir, folder);
      try {
        const folderStat = await stat(source);
        if (folderStat.isDirectory()) {
          await cp(source, target, { recursive: true, force: true });
        }
      } catch {
        // Missing asset folders are expected for single-file decks.
      }
    })
  );
}

ipcMain.handle('project:open-html', async () => {
  const options: OpenDialogOptions = {
    title: '打开 HTML 文件',
    properties: ['openFile'],
    filters: [{ name: 'HTML', extensions: ['html', 'htm'] }]
  };
  const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);

  if (result.canceled || result.filePaths.length === 0) return null;
  const opened = await readHtmlFile(result.filePaths[0]);
  await addRecentFile(opened.filePath);
  return opened;
});

ipcMain.handle('project:open-folder', async () => {
  const options: OpenDialogOptions = {
    title: '打开 HTML 项目文件夹',
    properties: ['openDirectory']
  };
  const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);

  if (result.canceled || result.filePaths.length === 0) return null;

  const entry = await findHtmlEntry(result.filePaths[0]);
  if (!entry) {
    const options: MessageBoxOptions = {
      type: 'warning',
      title: '未找到 HTML',
      message: '这个文件夹里没有 index.html 或其它 .html 文件。'
    };
    if (mainWindow) await dialog.showMessageBox(mainWindow, options);
    else await dialog.showMessageBox(options);
    return null;
  }

  const opened = await readHtmlFile(entry);
  await addRecentFile(opened.filePath);
  return opened;
});

ipcMain.handle('project:open-path', async (_event, filePath: string) => {
  try {
    const result = await readProjectPath(filePath);
    if (result) {
      await addRecentFile(result.filePath);
      return result;
    }
  } catch {
    // Fall through to the user-facing warning below.
  }

  const options: MessageBoxOptions = {
    type: 'warning',
    title: '无法打开',
    message: '请拖入 .html 文件，或包含 index.html 的文件夹。'
  };
  if (mainWindow) await dialog.showMessageBox(mainWindow, options);
  else await dialog.showMessageBox(options);
  return null;
});

ipcMain.handle('project:list-recent', async () => listRecentFiles());

ipcMain.handle('project:save', async (_event, payload: SavePayload) => {
  const filePath = payload.filePath ?? (await chooseSavePath(payload.defaultName));
  if (!filePath) return null;

  await writeFile(filePath, payload.html, 'utf8');
  await copyReferencedAssets(payload.sourceBaseDir, dirname(filePath), payload.assetPaths);
  await addRecentFile(filePath);
  return { filePath };
});

ipcMain.handle('project:save-as', async (_event, payload: SavePayload) => {
  const filePath = await chooseSavePath(payload.defaultName);
  if (!filePath) return null;

  await writeFile(filePath, payload.html, 'utf8');
  await copyReferencedAssets(payload.sourceBaseDir, dirname(filePath), payload.assetPaths);
  await addRecentFile(filePath);
  return { filePath };
});

ipcMain.handle('project:auto-save', async (_event, payload: AutoSavePayload) => {
  const filePath = getAutoSavePath();
  const record: AutoSaveRecord = {
    ...payload,
    savedAt: new Date().toISOString()
  };
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(record), 'utf8');
  return { savedAt: record.savedAt };
});

ipcMain.handle('project:load-autosave', async () => {
  try {
    const raw = await readFile(getAutoSavePath(), 'utf8');
    return JSON.parse(raw) as AutoSaveRecord;
  } catch {
    return null;
  }
});

ipcMain.handle('project:clear-autosave', async () => {
  try {
    await unlink(getAutoSavePath());
  } catch {
    // Missing autosave files are fine.
  }
  return true;
});

ipcMain.handle('project:export-package', async (_event, payload: ExportPayload) => {
  const options: OpenDialogOptions = {
    title: '选择导出文件夹',
    properties: ['openDirectory', 'createDirectory']
  };
  const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);

  if (result.canceled || result.filePaths.length === 0) return null;

  const outputDir = result.filePaths[0];
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, 'index.html'), payload.html, 'utf8');
  await copyCommonAssets(payload.sourceBaseDir, outputDir);
  await copyReferencedAssets(payload.sourceBaseDir, outputDir, payload.assetPaths);
  return { filePath: join(outputDir, 'index.html') };
});

ipcMain.handle('asset:select-image', async () => {
  const options: OpenDialogOptions = {
    title: '选择图片',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }]
  };
  const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);

  if (result.canceled || result.filePaths.length === 0) return null;

  const filePath = result.filePaths[0];
  const ext = extname(filePath).slice(1).toLowerCase();
  const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  const data = await readFile(filePath);
  return {
    filePath,
    dataUrl: `data:${mime};base64,${data.toString('base64')}`
  };
});

ipcMain.handle('project:present', async (_event, payload: PresentPayload) => {
  const tempDir = await mkdir(join(tmpdir(), 'html-demo-editor-presenter'), { recursive: true }).then(
    () => join(tmpdir(), 'html-demo-editor-presenter')
  );
  const presentPath = join(tempDir, 'index.html');
  await writeFile(presentPath, withPreviewShell(withBaseHref(payload.html, payload.baseDir)), 'utf8');

  if (presenterWindow && !presenterWindow.isDestroyed()) {
    presenterWindow.close();
  }

  presenterWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    fullscreen: payload.fullscreen ?? true,
    autoHideMenuBar: true,
    title: '演示模式',
    backgroundColor: '#ffffff',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  presenterWindow.on('closed', () => {
    presenterWindow = null;
  });
  presenterWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'Escape' && presenterWindow && !presenterWindow.isDestroyed()) {
      event.preventDefault();
      presenterWindow.close();
    }
  });

  const startSlideIndex = Math.max(0, Math.floor(payload.startSlideIndex ?? 0));
  const startHash = startSlideIndex > 0 ? `#/${startSlideIndex + 1}` : '';
  await presenterWindow.loadURL(`${pathToFileURL(presentPath).href}${startHash}`);
});

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  pendingOpenPath = findLaunchOpenPath(process.argv);
  app.on('second-instance', (_event, argv) => {
    const filePath = findLaunchOpenPath(argv);
    if (!filePath) return;
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      mainWindow.webContents.send('project:open-path-requested', filePath);
    } else {
      pendingOpenPath = filePath;
    }
  });
}

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('project:open-path-requested', filePath);
  } else {
    pendingOpenPath = filePath;
  }
});

app.whenReady().then(() => {
  if (!hasSingleInstanceLock) return;
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
