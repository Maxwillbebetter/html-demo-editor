import { app, BrowserWindow, dialog, ipcMain, type MessageBoxOptions, type OpenDialogOptions, type SaveDialogOptions } from 'electron';
import { mkdir, readFile, readdir, stat, writeFile, cp } from 'node:fs/promises';
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
}

const __dirname = dirname(fileURLToPath(import.meta.url));
let mainWindow: BrowserWindow | null = null;
let presenterWindow: BrowserWindow | null = null;

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
  return readHtmlFile(result.filePaths[0]);
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

  return readHtmlFile(entry);
});

ipcMain.handle('project:save', async (_event, payload: SavePayload) => {
  const filePath = payload.filePath ?? (await chooseSavePath(payload.defaultName));
  if (!filePath) return null;

  await writeFile(filePath, payload.html, 'utf8');
  await copyReferencedAssets(payload.sourceBaseDir, dirname(filePath), payload.assetPaths);
  return { filePath };
});

ipcMain.handle('project:save-as', async (_event, payload: SavePayload) => {
  const filePath = await chooseSavePath(payload.defaultName);
  if (!filePath) return null;

  await writeFile(filePath, payload.html, 'utf8');
  await copyReferencedAssets(payload.sourceBaseDir, dirname(filePath), payload.assetPaths);
  return { filePath };
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
  await writeFile(presentPath, withBaseHref(payload.html, payload.baseDir), 'utf8');

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

  await presenterWindow.loadFile(presentPath);
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
