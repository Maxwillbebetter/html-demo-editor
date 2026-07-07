declare module 'grapesjs-blocks-basic';
declare module 'grapesjs-preset-webpage';

export interface OpenProjectResult {
  filePath: string;
  baseDir: string;
  html: string;
  name: string;
}

export interface SaveResult {
  filePath: string;
}

export interface ImageAssetResult {
  filePath: string;
  dataUrl: string;
}

export interface PresentPayload {
  html: string;
  baseDir?: string;
  fullscreen?: boolean;
}

export interface SavePayload {
  filePath?: string;
  html: string;
  defaultName?: string;
  sourceBaseDir?: string;
  assetPaths?: string[];
}

export interface ExportPayload {
  html: string;
  sourceBaseDir?: string;
  assetPaths?: string[];
}

export interface DesktopBridge {
  openHtmlFile(): Promise<OpenProjectResult | null>;
  openProjectFolder(): Promise<OpenProjectResult | null>;
  openPath(filePath: string): Promise<OpenProjectResult | null>;
  getPathForFile(file: File): string;
  saveProject(payload: SavePayload): Promise<SaveResult | null>;
  saveProjectAs(payload: SavePayload): Promise<SaveResult | null>;
  exportPackage(payload: ExportPayload): Promise<SaveResult | null>;
  selectImage(): Promise<ImageAssetResult | null>;
  presentProject(payload: PresentPayload): Promise<void>;
}

declare global {
  interface Window {
    desktopBridge: DesktopBridge;
  }
}
