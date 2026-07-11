declare module 'grapesjs-blocks-basic';
declare module 'grapesjs-preset-webpage';

export interface OpenProjectResult {
  filePath: string;
  baseDir: string;
  assetBaseUrl?: string;
  html: string;
  name: string;
}

export interface SaveResult {
  filePath: string;
  assetBaseUrl?: string;
}

export interface ImageAssetResult {
  filePath: string;
  dataUrl: string;
}

export interface PresentPayload {
  html: string;
  baseDir?: string;
  fullscreen?: boolean;
  startSlideIndex?: number;
}

export interface SavePayload {
  filePath?: string;
  html: string;
  defaultName?: string;
  sourceBaseDir?: string;
  assetPaths?: string[];
}

export interface AutoSaveRecord {
  html: string;
  title?: string;
  filePath?: string;
  baseDir?: string;
  assetBaseUrl?: string;
  sourceName?: string;
  savedAt: string;
}

export interface RecentFile {
  filePath: string;
  name: string;
  baseDir: string;
  openedAt: string;
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
  listRecentFiles(): Promise<RecentFile[]>;
  onOpenPathRequested(callback: (filePath: string) => void): () => void;
  getPathForFile(file: File): string;
  saveProject(payload: SavePayload): Promise<SaveResult | null>;
  saveProjectAs(payload: SavePayload): Promise<SaveResult | null>;
  autoSaveProject(payload: Omit<AutoSaveRecord, 'savedAt'>): Promise<{ savedAt: string }>;
  loadAutoSave(): Promise<AutoSaveRecord | null>;
  clearAutoSave(): Promise<boolean>;
  exportPackage(payload: ExportPayload): Promise<SaveResult | null>;
  selectImage(): Promise<ImageAssetResult | null>;
  presentProject(payload: PresentPayload): Promise<void>;
}

declare global {
  interface Window {
    desktopBridge: DesktopBridge;
  }
}
