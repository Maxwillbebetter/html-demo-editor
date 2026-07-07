import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type {
  ExportPayload,
  ImageAssetResult,
  OpenProjectResult,
  PresentPayload,
  SavePayload,
  SaveResult
} from '../renderer/src/types';

contextBridge.exposeInMainWorld('desktopBridge', {
  openHtmlFile: (): Promise<OpenProjectResult | null> => ipcRenderer.invoke('project:open-html'),
  openProjectFolder: (): Promise<OpenProjectResult | null> => ipcRenderer.invoke('project:open-folder'),
  openPath: (filePath: string): Promise<OpenProjectResult | null> => ipcRenderer.invoke('project:open-path', filePath),
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
  saveProject: (payload: SavePayload): Promise<SaveResult | null> => ipcRenderer.invoke('project:save', payload),
  saveProjectAs: (payload: SavePayload): Promise<SaveResult | null> => ipcRenderer.invoke('project:save-as', payload),
  exportPackage: (payload: ExportPayload): Promise<SaveResult | null> =>
    ipcRenderer.invoke('project:export-package', payload),
  selectImage: (): Promise<ImageAssetResult | null> => ipcRenderer.invoke('asset:select-image'),
  presentProject: (payload: PresentPayload): Promise<void> => ipcRenderer.invoke('project:present', payload)
});
