import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { IpcRendererEvent } from 'electron';
import type {
  ExportPayload,
  ImageAssetResult,
  OpenProjectResult,
  PresentPayload,
  RecentFile,
  SavePayload,
  SaveResult
} from '../renderer/src/types';

contextBridge.exposeInMainWorld('desktopBridge', {
  openHtmlFile: (): Promise<OpenProjectResult | null> => ipcRenderer.invoke('project:open-html'),
  openProjectFolder: (): Promise<OpenProjectResult | null> => ipcRenderer.invoke('project:open-folder'),
  openPath: (filePath: string): Promise<OpenProjectResult | null> => ipcRenderer.invoke('project:open-path', filePath),
  listRecentFiles: (): Promise<RecentFile[]> => ipcRenderer.invoke('project:list-recent'),
  onOpenPathRequested: (callback: (filePath: string) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, filePath: string) => callback(filePath);
    ipcRenderer.on('project:open-path-requested', listener);
    return () => ipcRenderer.removeListener('project:open-path-requested', listener);
  },
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
  saveProject: (payload: SavePayload): Promise<SaveResult | null> => ipcRenderer.invoke('project:save', payload),
  saveProjectAs: (payload: SavePayload): Promise<SaveResult | null> => ipcRenderer.invoke('project:save-as', payload),
  autoSaveProject: (payload: Omit<import('../renderer/src/types').AutoSaveRecord, 'savedAt'>): Promise<{ savedAt: string }> =>
    ipcRenderer.invoke('project:auto-save', payload),
  loadAutoSave: (): Promise<import('../renderer/src/types').AutoSaveRecord | null> => ipcRenderer.invoke('project:load-autosave'),
  clearAutoSave: (): Promise<boolean> => ipcRenderer.invoke('project:clear-autosave'),
  exportPackage: (payload: ExportPayload): Promise<SaveResult | null> =>
    ipcRenderer.invoke('project:export-package', payload),
  selectImage: (): Promise<ImageAssetResult | null> => ipcRenderer.invoke('asset:select-image'),
  presentProject: (payload: PresentPayload): Promise<void> => ipcRenderer.invoke('project:present', payload),
  quitApplication: (): Promise<void> => ipcRenderer.invoke('app:quit')
});
