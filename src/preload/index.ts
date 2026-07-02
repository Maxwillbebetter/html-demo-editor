import { contextBridge, ipcRenderer } from 'electron';
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
  saveProject: (payload: SavePayload): Promise<SaveResult | null> => ipcRenderer.invoke('project:save', payload),
  saveProjectAs: (payload: SavePayload): Promise<SaveResult | null> => ipcRenderer.invoke('project:save-as', payload),
  exportPackage: (payload: ExportPayload): Promise<SaveResult | null> =>
    ipcRenderer.invoke('project:export-package', payload),
  selectImage: (): Promise<ImageAssetResult | null> => ipcRenderer.invoke('asset:select-image'),
  presentProject: (payload: PresentPayload): Promise<void> => ipcRenderer.invoke('project:present', payload)
});
