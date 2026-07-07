import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import grapesjs, { type Component, type Editor } from 'grapesjs';
import basicBlocks from 'grapesjs-blocks-basic';
import {
  Bold,
  BringToFront,
  Code2,
  Copy,
  Download,
  FilePlus2,
  FolderOpen,
  Image,
  Italic,
  Maximize2,
  MonitorPlay,
  PaintBucket,
  PanelLeft,
  PanelRight,
  Palette,
  Play,
  Plus,
  Redo2,
  Save,
  Scissors,
  SendToBack,
  Trash2,
  Type,
  Undo2,
  Underline,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { registerEditorBlocks, STYLE_SECTORS } from './editorBlocks';
import {
  buildExportHtml,
  buildSlidePreviewDoc,
  collectReferencedAssetPaths,
  createBlankSlide,
  createDefaultProject,
  DEFAULT_CANVAS_HEIGHT,
  DEFAULT_CANVAS_WIDTH,
  DEFAULT_SCROLL_CANVAS_HEIGHT,
  DEFAULT_SCROLL_CANVAS_WIDTH,
  formatLooseHtml,
  getSlideCanvasHeight,
  getSlideCanvasWidth,
  normalizeSlide,
  parseHtmlProject,
  type PresentationMode,
  type ProjectMeta,
  type SlideModel
} from './project';

const CURRENT_DEVICE_ID = 'current-page';
const TEXT_COLOR_SWATCHES = ['#111827', '#374151', '#ffffff', '#0f766e', '#2563eb', '#7c3aed', '#d9852b', '#dc2626'];
const FILL_COLOR_SWATCHES = ['#ffffff', '#f8fafc', '#eef7f6', '#fff7ed', '#eff6ff', '#f5f3ff', '#111827', '#0f766e'];
const FONT_OPTIONS = [
  { label: 'Segoe UI', value: '"Segoe UI", Arial, sans-serif' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: '微软雅黑', value: '"Microsoft YaHei", "Segoe UI", sans-serif' },
  { label: '宋体', value: 'SimSun, serif' },
  { label: '等宽', value: '"Cascadia Code", Consolas, monospace' }
];

type LeftTab = 'slides' | 'blocks';
type RightTab = 'style' | 'layers' | 'page';
type CanvasFitMode = 'fit' | 'width';

interface SelectedSummary {
  label: string;
  id?: string;
  classes?: string;
  width?: string;
  height?: string;
  left?: string;
  top?: string;
  zIndex?: string;
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  fontStyle?: string;
  color?: string;
  backgroundColor?: string;
  textDecoration?: string;
  borderRadius?: string;
  opacity?: string;
  isImage: boolean;
}

interface ContextMenuState {
  x: number;
  y: number;
  label: string;
  isImage: boolean;
  canEditText: boolean;
}

function dirnameFromPath(filePath?: string): string | undefined {
  if (!filePath) return undefined;
  const slash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  return slash >= 0 ? filePath.slice(0, slash) : undefined;
}

function safeDefaultName(title: string): string {
  const cleaned = title.replace(/[\\/:*?"<>|]/g, '-').trim();
  return `${cleaned || 'demo-material'}.html`;
}

function baseDirToFileHref(baseDir?: string): string | null {
  if (!baseDir) return null;
  const normalized = baseDir.replace(/\\/g, '/');
  const withSlash = normalized.endsWith('/') ? normalized : `${normalized}/`;
  if (/^[a-zA-Z]:\//.test(withSlash)) return `file:///${encodeURI(withSlash)}`;
  if (withSlash.startsWith('/')) return `file://${encodeURI(withSlash)}`;
  return null;
}

function clampCanvasInput(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(320, Math.min(12000, Math.round(value)));
}

function presentationModeLabel(mode: PresentationMode): string {
  return mode === 'scroll' ? '滚动长页' : '适配演示';
}

function projectModeLabel(documentMode?: boolean): string {
  return documentMode ? '大 HTML 文档' : '分页演示';
}

function makeSlideId(): string {
  return `slide-${crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(16).slice(2, 10)}`;
}

function renameSlideMarkup(components: string, id: string, name: string): string {
  const doc = new DOMParser().parseFromString(components, 'text/html');
  const slide = doc.querySelector('.deck-slide');
  if (!slide) return components;
  slide.setAttribute('data-slide-id', id);
  slide.setAttribute('aria-label', name);
  return slide.outerHTML;
}

function stringStyleValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return undefined;
}

function normalizeCssValue(property: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const pxProperties = new Set(['left', 'top', 'width', 'height', 'font-size', 'border-radius']);
  if (pxProperties.has(property) && /^-?\d+(\.\d+)?$/.test(trimmed)) return `${trimmed}px`;
  return trimmed;
}

function summarizeSelected(editor: Editor): SelectedSummary | null {
  const selected = editor.getSelected();
  if (!selected) return null;

  const attrs = selected.getAttributes();
  const style = selected.getStyle();
  const tagName = String(selected.get('tagName') || selected.getName() || 'element').toLowerCase();
  const classes = selected.getClasses().join(' ');

  return {
    label: tagName,
    id: attrs.id,
    classes,
    width: stringStyleValue(style.width),
    height: stringStyleValue(style.height),
    left: stringStyleValue(style.left),
    top: stringStyleValue(style.top),
    zIndex: stringStyleValue(style['z-index']),
    fontFamily: stringStyleValue(style['font-family']),
    fontSize: stringStyleValue(style['font-size']),
    fontWeight: stringStyleValue(style['font-weight']),
    fontStyle: stringStyleValue(style['font-style']),
    color: stringStyleValue(style.color),
    backgroundColor: stringStyleValue(style['background-color']),
    textDecoration: stringStyleValue(style['text-decoration']),
    borderRadius: stringStyleValue(style['border-radius']),
    opacity: stringStyleValue(style.opacity),
    isImage: tagName === 'img' || selected.is('image')
  };
}

function cssNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cssColorInputValue(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed;
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const [, r, g, b] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return fallback;
}

function isBoldValue(value: string | undefined): boolean {
  if (!value) return false;
  if (value === 'bold' || value === 'bolder') return true;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 600;
}

function isTextLikeComponent(component: Component | null): boolean {
  if (!component) return false;
  const tagName = String(component.get('tagName') || component.getName() || '').toLowerCase();
  if (component.is('text') || component.is('textnode')) return true;
  return ['a', 'button', 'figcaption', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'p', 'span', 'td', 'th'].includes(tagName);
}

function syncEditableElementToModel(editor: Editor, element: HTMLElement | null): void {
  if (!element) return;

  const tagName = element.tagName.toLowerCase();
  const component = getGrapesComponentFromElement(editor, element);
  if (!component) return;

  if (tagName === 'input' || tagName === 'textarea') {
    const value = 'value' in element ? String((element as HTMLInputElement | HTMLTextAreaElement).value) : element.getAttribute('value') || '';
    component.addAttributes({ value });
    return;
  }

  const editableRoot = element.isContentEditable
    ? (element.closest('[contenteditable="true"]') as HTMLElement | null) || element
    : null;
  if (!editableRoot) return;

  const editableComponent = getGrapesComponentFromElement(editor, editableRoot) || component;
  if (isTextLikeComponent(editableComponent)) {
    editableComponent.components(editableRoot.innerHTML);
  }
}

function flushEditorState(editor: Editor): void {
  const frameDoc = editor.Canvas.getDocument();
  const activeElement =
    frameDoc?.activeElement && frameDoc.activeElement.nodeType === Node.ELEMENT_NODE ? (frameDoc.activeElement as HTMLElement) : null;

  syncEditableElementToModel(editor, activeElement);

  const selected = editor.getSelected();
  const selectedElement = selected?.getEl?.();
  if (selectedElement && selectedElement.nodeType === Node.ELEMENT_NODE) {
    syncEditableElementToModel(editor, selectedElement as HTMLElement);
  }

  try {
    (editor as unknown as { stopCommand?: (id: string) => void }).stopCommand?.('core:component-edit');
    (editor as unknown as { RichTextEditor?: { disable?: () => void } }).RichTextEditor?.disable?.();
  } finally {
    activeElement?.blur();
  }
}

function QuickField({
  label,
  value,
  onChange,
  placeholder
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="quick-field">
      <span>{label}</span>
      <input value={value || ''} placeholder={placeholder || '-'} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function getClickElement(target: EventTarget | null): HTMLElement | null {
  const node = target as Node | null;
  if (!node || typeof node.nodeType !== 'number') return null;
  const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  return element?.nodeType === Node.ELEMENT_NODE ? (element as HTMLElement) : null;
}

function getGrapesComponentFromElement(editor: Editor, target: EventTarget | null): Component | null {
  const element = getClickElement(target);
  if (!element) return null;

  const helpers = (grapesjs as unknown as {
    helpers?: { getComponentModel?: (el?: Node) => Component | undefined };
  }).helpers;
  const helperMatch = helpers?.getComponentModel?.(element);
  if (helperMatch) return helperMatch;

  const wrapper = editor.getWrapper();
  if (!wrapper) return null;

  const candidates = [...wrapper.find('*'), wrapper].reverse();
  const directMatch = candidates.find((component) => component.getEl?.() === element);
  if (directMatch) return directMatch;

  const containedMatch = candidates.find((component) => component.getEl?.()?.contains(element));
  if (containedMatch) return containedMatch;

  const tagName = element.tagName.toLowerCase();
  const text = element.textContent?.trim();
  const classes = Array.from(element.classList);
  return (
    candidates.find((component) => {
      const componentEl = component.getEl?.();
      if (!componentEl || componentEl.tagName.toLowerCase() !== tagName) return false;
      const classMatch = classes.length === 0 || classes.some((className) => componentEl.classList.contains(className));
      const textMatch = !text || componentEl.textContent?.trim() === text;
      return classMatch && textMatch;
    }) ?? null
  );
}

function ToolbarButton({
  label,
  title,
  onClick,
  children,
  active = false
}: {
  label: string;
  title?: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button className={`toolbar-button${active ? ' is-active' : ''}`} type="button" title={title || label} onClick={onClick}>
      {children}
      <span>{label}</span>
    </button>
  );
}

export default function App() {
  const initialProject = useMemo(() => createDefaultProject(), []);
  const [meta, setMeta] = useState<ProjectMeta>(initialProject.meta);
  const [slides, setSlides] = useState<SlideModel[]>(initialProject.slides);
  const [currentSlideId, setCurrentSlideId] = useState(initialProject.slides[0].id);
  const [leftTab, setLeftTab] = useState<LeftTab>('slides');
  const [rightTab, setRightTab] = useState<RightTab>('page');
  const [zoom, setZoom] = useState(50);
  const [dirty, setDirty] = useState(false);
  const [selectedSummary, setSelectedSummary] = useState<SelectedSummary | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeHtml, setCodeHtml] = useState('');
  const [codeCss, setCodeCss] = useState('');
  const [gridEnabled, setGridEnabled] = useState(false);
  const [draggedSlideId, setDraggedSlideId] = useState<string | null>(null);
  const [canvasFitMode, setCanvasFitMode] = useState<CanvasFitMode>('width');
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [dropActive, setDropActive] = useState(false);

  const editorHostRef = useRef<HTMLDivElement | null>(null);
  const editorShellRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const loadingSlideRef = useRef(false);
  const slidesRef = useRef(slides);
  const metaRef = useRef(meta);
  const currentSlideIdRef = useRef(currentSlideId);
  const gridEnabledRef = useRef(gridEnabled);
  const zoomRef = useRef(zoom);
  const canvasFitModeRef = useRef(canvasFitMode);

  useEffect(() => {
    slidesRef.current = slides;
  }, [slides]);

  useEffect(() => {
    metaRef.current = meta;
  }, [meta]);

  useEffect(() => {
    currentSlideIdRef.current = currentSlideId;
  }, [currentSlideId]);

  useEffect(() => {
    gridEnabledRef.current = gridEnabled;
  }, [gridEnabled]);

  useEffect(() => {
    canvasFitModeRef.current = canvasFitMode;
  }, [canvasFitMode]);

  useEffect(() => {
    zoomRef.current = zoom;
    editorRef.current?.Canvas.setZoom(zoom);
  }, [zoom]);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 2600);
  }, []);

  useEffect(() => {
    const dismissTransientUi = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== 'Escape') return;
      setContextMenu(null);
    };

    window.addEventListener('click', dismissTransientUi);
    window.addEventListener('keydown', dismissTransientUi);
    window.addEventListener('resize', dismissTransientUi);
    return () => {
      window.removeEventListener('click', dismissTransientUi);
      window.removeEventListener('keydown', dismissTransientUi);
      window.removeEventListener('resize', dismissTransientUi);
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  const syncCanvasHelpers = useCallback(() => {
    const editor = editorRef.current;
    const doc = editor?.Canvas.getDocument();
    if (!doc) return;
    const isDocumentMode = metaRef.current.documentMode === true;

    doc.querySelectorAll('[data-html-demo-editor-managed="head"]').forEach((node) => node.remove());
    doc.documentElement.classList.toggle('html-demo-editor-grid', gridEnabledRef.current && !isDocumentMode);
    doc.documentElement.classList.toggle('html-demo-editor-document-mode', isDocumentMode);

    const baseHref = baseDirToFileHref(metaRef.current.baseDir);
    if (baseHref) {
      const base = doc.createElement('base');
      base.href = baseHref;
      base.setAttribute('data-html-demo-editor-managed', 'head');
      doc.head.insertBefore(base, doc.head.firstChild);
    }

    let helperStyle = doc.getElementById('html-demo-editor-canvas-style') as HTMLStyleElement | null;
    if (!helperStyle) {
      helperStyle = doc.createElement('style');
      helperStyle.id = 'html-demo-editor-canvas-style';
      helperStyle.setAttribute('data-html-demo-editor-managed', 'head');
      doc.head.insertBefore(helperStyle, baseHref ? doc.head.children[1] || null : doc.head.firstChild);
    }

    const previousHtmlClasses = (doc.documentElement.getAttribute('data-html-demo-editor-managed-html-classes') || '')
      .split(/\s+/)
      .filter(Boolean);
    previousHtmlClasses.forEach((className) => doc.documentElement.classList.remove(className));
    const previousHtmlAttrs = (doc.documentElement.getAttribute('data-html-demo-editor-managed-html-attrs') || '')
      .split(/\s+/)
      .filter(Boolean);
    previousHtmlAttrs.forEach((name) => doc.documentElement.removeAttribute(name));

    const htmlAttributes = metaRef.current.htmlAttributes || {};
    const managedHtmlClasses: string[] = [];
    const managedHtmlAttrs: string[] = [];
    Object.entries(htmlAttributes).forEach(([name, value]) => {
      if (name.toLowerCase() === 'class') {
        value
          .split(/\s+/)
          .filter(Boolean)
          .forEach((className) => {
            doc.documentElement.classList.add(className);
            managedHtmlClasses.push(className);
          });
        return;
      }
      doc.documentElement.setAttribute(name, value);
      managedHtmlAttrs.push(name);
    });
    doc.documentElement.setAttribute('data-html-demo-editor-managed-html-classes', managedHtmlClasses.join(' '));
    doc.documentElement.setAttribute('data-html-demo-editor-managed-html-attrs', managedHtmlAttrs.join(' '));

    helperStyle.textContent = isDocumentMode
      ? `
      html.html-demo-editor-grid body::after {
        content: "";
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 2147483647;
        background-image:
          linear-gradient(rgba(15, 118, 110, 0.13) 1px, transparent 1px),
          linear-gradient(90deg, rgba(15, 118, 110, 0.13) 1px, transparent 1px);
        background-size: 24px 24px;
      }
    `
      : `
      html {
        min-height: 100%;
      }
      body {
        margin: 0;
        min-height: 100%;
      }
      .deck-slide {
        box-sizing: border-box;
        width: var(--htmlppt-slide-width, ${DEFAULT_CANVAS_WIDTH}px);
        min-height: var(--htmlppt-slide-height, ${DEFAULT_CANVAS_HEIGHT}px);
        position: relative;
        margin: 0 auto;
        outline: 1px solid rgba(41, 52, 66, 0.16);
        box-shadow: 0 26px 60px rgba(30, 41, 59, 0.14);
      }
      .deck-slide,
      .deck-slide * {
        box-sizing: border-box;
      }
      .deck-slide[data-presentation-mode="fit"] {
        height: var(--htmlppt-slide-height, ${DEFAULT_CANVAS_HEIGHT}px);
        overflow: hidden;
      }
      .deck-slide[data-presentation-mode="scroll"] {
        min-height: var(--htmlppt-slide-height, ${DEFAULT_SCROLL_CANVAS_HEIGHT}px);
        height: auto;
        overflow: visible;
      }
      html.html-demo-editor-grid body::after {
        content: "";
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 2147483647;
        background-image:
          linear-gradient(rgba(15, 118, 110, 0.13) 1px, transparent 1px),
          linear-gradient(90deg, rgba(15, 118, 110, 0.13) 1px, transparent 1px);
        background-size: 24px 24px;
      }
    `;

    const headTemplate = doc.createElement('template');
    headTemplate.innerHTML = metaRef.current.headExtras || '';
    Array.from(headTemplate.content.children).forEach((node) => {
      const tag = node.tagName.toLowerCase();
      if (['script', 'title', 'base'].includes(tag)) return;
      const clone = node.cloneNode(true) as HTMLElement;
      clone.setAttribute('data-html-demo-editor-managed', 'head');
      doc.head.appendChild(clone);
    });

    const previousClasses = (doc.body.getAttribute('data-html-demo-editor-managed-body-classes') || '').split(/\s+/).filter(Boolean);
    previousClasses.forEach((className) => doc.body.classList.remove(className));
    const previousAttrs = (doc.body.getAttribute('data-html-demo-editor-managed-body-attrs') || '').split(/\s+/).filter(Boolean);
    previousAttrs.forEach((name) => doc.body.removeAttribute(name));

    const bodyAttributes = metaRef.current.bodyAttributes || {};
    const managedClasses: string[] = [];
    const managedAttrs: string[] = [];
    Object.entries(bodyAttributes).forEach(([name, value]) => {
      if (name.toLowerCase() === 'class') {
        value
          .split(/\s+/)
          .filter(Boolean)
          .forEach((className) => {
            doc.body.classList.add(className);
            managedClasses.push(className);
          });
        return;
      }
      doc.body.setAttribute(name, value);
      managedAttrs.push(name);
    });
    doc.body.setAttribute('data-html-demo-editor-managed-body-classes', managedClasses.join(' '));
    doc.body.setAttribute('data-html-demo-editor-managed-body-attrs', managedAttrs.join(' '));

    const scriptSignature = metaRef.current.bodyScripts || '';
    if (doc.body.getAttribute('data-html-demo-editor-script-signature') !== scriptSignature) {
      doc.body.querySelectorAll('[data-html-demo-editor-managed="body-script"]').forEach((node) => node.remove());
      doc.body.setAttribute('data-html-demo-editor-script-signature', scriptSignature);

      if (scriptSignature.trim()) {
        const scriptTemplate = doc.createElement('template');
        scriptTemplate.innerHTML = scriptSignature;
        Array.from(scriptTemplate.content.querySelectorAll('script')).forEach((sourceScript) => {
          const script = doc.createElement('script');
          Array.from(sourceScript.attributes).forEach((attr) => script.setAttribute(attr.name, attr.value));
          script.textContent = sourceScript.textContent;
          script.setAttribute('data-html-demo-editor-managed', 'body-script');
          doc.body.appendChild(script);
        });
      }
    }
  }, []);

  const updateCanvasDevice = useCallback((slide: SlideModel) => {
    const editor = editorRef.current;
    if (!editor) return;
    const normalized = normalizeSlide(slide);
    const shellBounds = editorShellRef.current?.getBoundingClientRect();
    const documentViewportWidth = shellBounds ? Math.max(640, Math.floor(shellBounds.width - 34)) : getSlideCanvasWidth(normalized);
    const width = `${metaRef.current.documentMode ? documentViewportWidth : getSlideCanvasWidth(normalized)}px`;
    const height = `${getSlideCanvasHeight(normalized)}px`;
    const deviceManager = editor.Devices;
    let device = deviceManager.get(CURRENT_DEVICE_ID);
    if (!device) {
      device = deviceManager.add({
        id: CURRENT_DEVICE_ID,
        name: '当前页面',
        width,
        height,
        widthMedia: width
      });
    } else {
      device.set({
        width,
        height,
        widthMedia: width
      });
    }
    editor.setDevice(CURRENT_DEVICE_ID);
  }, []);

  const loadSlideIntoEditor = useCallback(
    (slide: SlideModel) => {
      const editor = editorRef.current;
      if (!editor) return;

      const normalized = normalizeSlide(slide);
      loadingSlideRef.current = true;
      updateCanvasDevice(normalized);
      editor.setComponents(normalized.components);
      editor.setStyle(normalized.css);
      editor.Canvas.setZoom(zoomRef.current);
      (editor as unknown as { setDragMode?: (mode: string) => void }).setDragMode?.('absolute');
      setSelectedSummary(null);

      window.setTimeout(() => {
        syncCanvasHelpers();
        loadingSlideRef.current = false;
      }, 0);
    },
    [syncCanvasHelpers, updateCanvasDevice]
  );

  const commitCurrentSlide = useCallback(() => {
    const editor = editorRef.current;
    const currentId = currentSlideIdRef.current;
    if (!editor || !currentId || loadingSlideRef.current) return slidesRef.current;

    flushEditorState(editor);

    const updated: SlideModel[] = slidesRef.current.map((slide) =>
      slide.id === currentId
        ? {
            ...slide,
            components: editor.getHtml(),
            css: editor.getCss() ?? ''
          }
        : slide
    );

    slidesRef.current = updated;
    setSlides(updated);
    return updated;
  }, []);

  const replaceProject = useCallback(
    (nextMeta: ProjectMeta, nextSlides: SlideModel[]) => {
      const normalizedSlides = (nextSlides.length ? nextSlides : [createBlankSlide('页面 1')]).map(normalizeSlide);
      const firstSlide = normalizedSlides[0];
      setMeta(nextMeta);
      setSlides(normalizedSlides);
      setCurrentSlideId(firstSlide.id);
      setDirty(false);
      slidesRef.current = normalizedSlides;
      metaRef.current = nextMeta;
      currentSlideIdRef.current = firstSlide.id;
      if (nextMeta.documentMode) {
        setGridEnabled(false);
        gridEnabledRef.current = false;
        setCanvasFitMode('width');
        canvasFitModeRef.current = 'width';
      }
      loadSlideIntoEditor(firstSlide);
    },
    [loadSlideIntoEditor]
  );

  useEffect(() => {
    if (!editorHostRef.current) return;

    const editor = grapesjs.init({
      container: editorHostRef.current,
      height: '100%',
      width: '100%',
      fromElement: false,
      storageManager: false,
      panels: { defaults: [] },
      blockManager: { appendTo: '#blocks-panel' },
      layerManager: { appendTo: '#layers-panel' },
      traitManager: { appendTo: '#traits-panel' },
      selectorManager: { appendTo: '#hidden-gjs-panel' },
      styleManager: {
        appendTo: '#style-manager-panel',
        sectors: STYLE_SECTORS as never
      },
      canvas: {
        styles: [],
        scripts: [],
        scrollableCanvas: true
      },
      deviceManager: {
        default: CURRENT_DEVICE_ID,
        devices: [
          {
            id: CURRENT_DEVICE_ID,
            name: '当前页面',
            width: `${DEFAULT_CANVAS_WIDTH}px`,
            height: `${DEFAULT_CANVAS_HEIGHT}px`,
            widthMedia: `${DEFAULT_CANVAS_WIDTH}px`
          }
        ]
      },
      plugins: [basicBlocks],
      dragMode: 'absolute'
    });

    editorRef.current = editor;
    registerEditorBlocks(editor);

    const installSelectionBridge = () => {
      const frameDocs = [editor.Canvas.getDocument(), editor.Canvas.getFrameEl()?.contentDocument].filter(
        (doc, index, docs): doc is Document => Boolean(doc) && docs.indexOf(doc) === index
      );

      frameDocs.forEach((frameDoc) => {
        if ((frameDoc as Document & { __htmlDemoSelectionBridge?: boolean }).__htmlDemoSelectionBridge) return;

        (frameDoc as Document & { __htmlDemoSelectionBridge?: boolean }).__htmlDemoSelectionBridge = true;
        frameDoc.addEventListener(
          'click',
          (event) => {
            const component = getGrapesComponentFromElement(editor, event.target);
            if (!component) return;

            setContextMenu(null);
            editor.select(component);
            setRightTab('style');
            setSelectedSummary(summarizeSelected(editor));
          },
          true
        );
        frameDoc.addEventListener(
          'contextmenu',
          (event) => {
            const component = getGrapesComponentFromElement(editor, event.target);
            if (!component) {
              setContextMenu(null);
              return;
            }

            event.preventDefault();
            editor.select(component);
            setRightTab('style');
            setSelectedSummary(summarizeSelected(editor));

            const frameEl = editor.Canvas.getFrameEl();
            const frameRect = frameEl?.getBoundingClientRect();
            const frameWindow = frameDoc.defaultView;
            const scaleX = frameRect && frameWindow?.innerWidth ? frameRect.width / frameWindow.innerWidth : zoomRef.current / 100;
            const scaleY = frameRect && frameWindow?.innerHeight ? frameRect.height / frameWindow.innerHeight : zoomRef.current / 100;
            const left = (frameRect?.left ?? 0) + event.clientX * scaleX;
            const top = (frameRect?.top ?? 0) + event.clientY * scaleY;
            const summary = summarizeSelected(editor);

            setContextMenu({
              x: Math.max(8, Math.min(window.innerWidth - 230, left)),
              y: Math.max(8, Math.min(window.innerHeight - 260, top)),
              label: summary?.label || '元素',
              isImage: summary?.isImage || false,
              canEditText: isTextLikeComponent(component)
            });
          },
          true
        );
      });
    };

    editor.on('load', () => {
      loadSlideIntoEditor(slidesRef.current[0]);
      syncCanvasHelpers();
      installSelectionBridge();
    });

    editor.on('update', () => {
      if (!loadingSlideRef.current) setDirty(true);
    });
    editor.on('component:selected component:update component:styleUpdate', () => {
      setSelectedSummary(summarizeSelected(editor));
    });
    editor.on('component:selected', () => {
      setRightTab('style');
    });
    editor.on('component:deselected', () => setSelectedSummary(null));
    editor.on('canvas:frame:load', () => {
      syncCanvasHelpers();
      installSelectionBridge();
    });
    editor.on('canvas:frame:load:body', installSelectionBridge);
    window.setTimeout(() => loadSlideIntoEditor(slidesRef.current[0]), 0);
    window.setTimeout(installSelectionBridge, 0);

    return () => {
      editor.destroy();
      editorRef.current = null;
    };
  }, [loadSlideIntoEditor, syncCanvasHelpers]);

  useEffect(() => {
    syncCanvasHelpers();
  }, [gridEnabled, syncCanvasHelpers]);

  const confirmDiscard = useCallback(() => {
    if (!dirty) return true;
    return window.confirm('当前项目有未保存修改，确定要继续吗？');
  }, [dirty]);

  const materializeHtml = useCallback(() => {
    const nextSlides = commitCurrentSlide();
    return {
      slides: nextSlides,
      html: buildExportHtml(nextSlides, metaRef.current)
    };
  }, [commitCurrentSlide]);

  const handleNewProject = useCallback(() => {
    if (!confirmDiscard()) return;
    const project = createDefaultProject();
    replaceProject(project.meta, project.slides);
  }, [confirmDiscard, replaceProject]);

  const openImportedProject = useCallback(
    (result: { html: string; name: string; filePath: string; baseDir: string }) => {
      const parsed = parseHtmlProject(result.html, result.name, result.filePath, result.baseDir);
      replaceProject(parsed.meta, parsed.slides);
      notify(`已打开 ${result.name}`);
    },
    [notify, replaceProject]
  );

  const handleOpenFile = useCallback(async () => {
    if (!confirmDiscard()) return;
    const result = await window.desktopBridge.openHtmlFile();
    if (!result) return;
    openImportedProject(result);
  }, [confirmDiscard, openImportedProject]);

  const handleOpenFolder = useCallback(async () => {
    if (!confirmDiscard()) return;
    const result = await window.desktopBridge.openProjectFolder();
    if (!result) return;
    openImportedProject(result);
  }, [confirmDiscard, openImportedProject]);

  useEffect(() => {
    let dragDepth = 0;

    const isFileDrag = (event: DragEvent) => Array.from(event.dataTransfer?.types || []).includes('Files');

    const handleDragEnter = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      dragDepth += 1;
      setDropActive(true);
    };

    const handleDragOver = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      setDropActive(true);
    };

    const handleDragLeave = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) setDropActive(false);
    };

    const handleDrop = async (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      dragDepth = 0;
      setDropActive(false);

      const file = event.dataTransfer?.files?.[0];
      const filePath = file ? window.desktopBridge.getPathForFile(file) : '';
      if (!filePath) {
        notify('没有拿到文件路径，请用“打开”按钮选择 HTML');
        return;
      }
      if (!confirmDiscard()) return;

      const result = await window.desktopBridge.openPath(filePath);
      if (result) openImportedProject(result);
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, [confirmDiscard, notify, openImportedProject]);

  const handleSave = useCallback(async () => {
    try {
      const { html } = materializeHtml();
      const result = await window.desktopBridge.saveProject({
        filePath: metaRef.current.filePath,
        html,
        defaultName: safeDefaultName(metaRef.current.title),
        sourceBaseDir: metaRef.current.baseDir,
        assetPaths: collectReferencedAssetPaths(html)
      });
      if (!result) return;

      setMeta((current) => ({
        ...current,
        filePath: result.filePath,
        baseDir: dirnameFromPath(result.filePath),
        sourceName: result.filePath.split(/[\\/]/).pop()
      }));
      setDirty(false);
      notify(`已保存到 ${result.filePath.split(/[\\/]/).pop()}`);
    } catch (error) {
      console.error(error);
      notify('保存失败，请检查文件权限或路径');
    }
  }, [materializeHtml, notify]);

  const handleSaveAs = useCallback(async () => {
    try {
      const { html } = materializeHtml();
      const result = await window.desktopBridge.saveProjectAs({
        html,
        defaultName: safeDefaultName(metaRef.current.title),
        sourceBaseDir: metaRef.current.baseDir,
        assetPaths: collectReferencedAssetPaths(html)
      });
      if (!result) return;

      setMeta((current) => ({
        ...current,
        filePath: result.filePath,
        baseDir: dirnameFromPath(result.filePath),
        sourceName: result.filePath.split(/[\\/]/).pop()
      }));
      setDirty(false);
      notify(`已另存为 ${result.filePath.split(/[\\/]/).pop()}`);
    } catch (error) {
      console.error(error);
      notify('另存失败，请检查文件权限或路径');
    }
  }, [materializeHtml, notify]);

  const handleExport = useCallback(async () => {
    try {
      const { html } = materializeHtml();
      const result = await window.desktopBridge.exportPackage({
        html,
        sourceBaseDir: metaRef.current.baseDir,
        assetPaths: collectReferencedAssetPaths(html)
      });
      if (result) notify(`已导出到 ${result.filePath}`);
    } catch (error) {
      console.error(error);
      notify('导出失败，请检查目标文件夹权限');
    }
  }, [materializeHtml, notify]);

  const handlePresent = useCallback(async () => {
    try {
      const { html } = materializeHtml();
      await window.desktopBridge.presentProject({
        html,
        baseDir: metaRef.current.baseDir,
        fullscreen: true
      });
      notify('已用当前修改进入演示');
    } catch (error) {
      console.error(error);
      notify('演示打开失败，请重试');
    }
  }, [materializeHtml, notify]);

  const handlePreviewWindow = useCallback(async () => {
    try {
      const { html } = materializeHtml();
      await window.desktopBridge.presentProject({
        html,
        baseDir: metaRef.current.baseDir,
        fullscreen: false
      });
      notify('已用当前修改打开预览');
    } catch (error) {
      console.error(error);
      notify('预览打开失败，请重试');
    }
  }, [materializeHtml, notify]);

  const handleUndo = useCallback(() => {
    editorRef.current?.UndoManager.undo();
  }, []);

  const handleRedo = useCallback(() => {
    editorRef.current?.UndoManager.redo();
  }, []);

  const handleFitCanvas = useCallback(() => {
    const shell = editorShellRef.current;
    if (!shell) return;
    const current = slidesRef.current.find((slide) => slide.id === currentSlideIdRef.current) ?? slidesRef.current[0];
    const normalized = current ? normalizeSlide(current) : createBlankSlide();
    if (metaRef.current.documentMode) {
      updateCanvasDevice(normalized);
      setZoom(100);
      return;
    }
    const bounds = shell.getBoundingClientRect();
    const width = getSlideCanvasWidth(normalized);
    const height = getSlideCanvasHeight(normalized);
    const availableWidth = Math.max(320, bounds.width - 4);
    const availableHeight = Math.max(240, bounds.height - 4);
    const fit =
      normalized.presentationMode === 'scroll' || canvasFitModeRef.current === 'width'
        ? Math.floor((availableWidth / width) * 100)
        : Math.floor(Math.min(availableWidth / width, availableHeight / height) * 100);
    setZoom(Math.max(10, Math.min(220, fit)));
  }, [updateCanvasDevice]);

  useEffect(() => {
    const timer = window.setTimeout(handleFitCanvas, 80);
    return () => window.clearTimeout(timer);
  }, [canvasFitMode, currentSlideId, handleFitCanvas, slides.length]);

  useEffect(() => {
    const handleResize = () => handleFitCanvas();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [handleFitCanvas]);

  const handleSelectSlide = useCallback(
    (slideId: string) => {
      if (slideId === currentSlideIdRef.current) return;
      const updated = commitCurrentSlide();
      const target = updated.find((slide) => slide.id === slideId);
      if (!target) return;
      setCurrentSlideId(slideId);
      currentSlideIdRef.current = slideId;
      loadSlideIntoEditor(target);
    },
    [commitCurrentSlide, loadSlideIntoEditor]
  );

  const handleAddSlide = useCallback(() => {
    const updated = commitCurrentSlide();
    const slide = createBlankSlide(`页面 ${updated.length + 1}`);
    const next = [...updated, slide];
    setSlides(next);
    slidesRef.current = next;
    setMeta((current) => ({ ...current, documentMode: false }));
    metaRef.current = { ...metaRef.current, documentMode: false };
    setCurrentSlideId(slide.id);
    currentSlideIdRef.current = slide.id;
    setDirty(true);
    loadSlideIntoEditor(slide);
  }, [commitCurrentSlide, loadSlideIntoEditor]);

  const handleDuplicateSlide = useCallback(
    (slideId: string) => {
      const updated = commitCurrentSlide();
      const source = updated.find((slide) => slide.id === slideId);
      if (!source) return;

      const id = makeSlideId();
      const cloneName = `${source.name} 副本`;
      const clone: SlideModel = {
        ...source,
        id,
        name: cloneName,
        components: renameSlideMarkup(source.components, id, cloneName)
      };
      const sourceIndex = updated.findIndex((slide) => slide.id === slideId);
      const next = [...updated.slice(0, sourceIndex + 1), clone, ...updated.slice(sourceIndex + 1)];
      setSlides(next);
      slidesRef.current = next;
      setCurrentSlideId(id);
      currentSlideIdRef.current = id;
      setDirty(true);
      loadSlideIntoEditor(clone);
    },
    [commitCurrentSlide, loadSlideIntoEditor]
  );

  const handleDeleteSlide = useCallback(
    (slideId: string) => {
      const updated = commitCurrentSlide();
      if (updated.length <= 1) {
        const blank = createBlankSlide('新页面');
        const nextMeta = { ...metaRef.current, documentMode: false };
        setMeta(nextMeta);
        metaRef.current = nextMeta;
        setSlides([blank]);
        slidesRef.current = [blank];
        setCurrentSlideId(blank.id);
        currentSlideIdRef.current = blank.id;
        setDirty(true);
        loadSlideIntoEditor(blank);
        notify('最后一页已清空为空白页');
        return;
      }

      const next = updated.filter((slide) => slide.id !== slideId);
      const nextCurrent = slideId === currentSlideIdRef.current ? next[Math.max(0, updated.findIndex((s) => s.id === slideId) - 1)] : null;
      setSlides(next);
      slidesRef.current = next;
      setDirty(true);
      if (nextCurrent) {
        setCurrentSlideId(nextCurrent.id);
        currentSlideIdRef.current = nextCurrent.id;
        loadSlideIntoEditor(nextCurrent);
      }
    },
    [commitCurrentSlide, loadSlideIntoEditor, notify]
  );

  const handleRenameSlide = useCallback((slideId: string, name: string) => {
    const next = slidesRef.current.map((slide) =>
      slide.id === slideId
        ? {
            ...slide,
            name,
            components: renameSlideMarkup(slide.components, slide.id, name)
          }
        : slide
    );
    setSlides(next);
    slidesRef.current = next;
    setDirty(true);
  }, []);

  const handleDropSlide = useCallback(
    (targetId: string) => {
      if (!draggedSlideId || draggedSlideId === targetId) return;
      const updated = commitCurrentSlide();
      const from = updated.findIndex((slide) => slide.id === draggedSlideId);
      const to = updated.findIndex((slide) => slide.id === targetId);
      if (from < 0 || to < 0) return;
      const next = [...updated];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      setSlides(next);
      slidesRef.current = next;
      setDraggedSlideId(null);
      setDirty(true);
    },
    [commitCurrentSlide, draggedSlideId]
  );

  const handleDeleteSelection = useCallback(() => {
    const selected = editorRef.current?.getSelected();
    if (!selected) return;
    selected.remove();
    setSelectedSummary(null);
    setContextMenu(null);
    setDirty(true);
  }, []);

  const handleDuplicateSelection = useCallback(() => {
    const selected = editorRef.current?.getSelected();
    if (!selected) return;
    const parent = selected.parent();
    if (!parent) return;
    const clone = selected.clone();
    parent.append(clone);
    editorRef.current?.select(clone);
    setContextMenu(null);
    setDirty(true);
  }, []);

  const handleEditSelectedText = useCallback(() => {
    const editor = editorRef.current;
    const selected = editor?.getSelected();
    const element = selected?.getEl?.();
    if (!editor || !selected || !element || element.nodeType !== Node.ELEMENT_NODE || !isTextLikeComponent(selected)) return;

    setContextMenu(null);
    const target = element as HTMLElement;
    editor.select(selected);
    (editor as unknown as { runCommand?: (id: string, options?: unknown) => void }).runCommand?.('core:component-edit', {
      component: selected
    });
    target.dispatchEvent(
      new MouseEvent('dblclick', {
        bubbles: true,
        cancelable: true,
        view: target.ownerDocument.defaultView
      })
    );
    target.focus({ preventScroll: true });
  }, []);

  const handleMoveSelectionLayer = useCallback((placement: 'front' | 'back') => {
    const editor = editorRef.current;
    const selected = editor?.getSelected();
    if (!editor || !selected) return;

    const style = selected.getStyle();
    selected.addStyle({
      position: stringStyleValue(style.position) || 'relative',
      'z-index': placement === 'front' ? '999' : '0'
    });
    setSelectedSummary(summarizeSelected(editor));
    setContextMenu(null);
    setDirty(true);
  }, []);

  const handleReplaceImage = useCallback(async () => {
    const editor = editorRef.current;
    const selected = editor?.getSelected();
    if (!editor || !selected) return;
    const image = await window.desktopBridge.selectImage();
    if (!image) return;

    const tagName = String(selected.get('tagName') || '').toLowerCase();
    if (tagName === 'img' || selected.is('image')) {
      selected.addAttributes({ src: image.dataUrl });
    } else {
      selected.addStyle({
        'background-image': `url("${image.dataUrl}")`,
        'background-size': 'cover',
        'background-position': 'center'
      });
    }
    editor.AssetManager.add(image.dataUrl);
    setSelectedSummary(summarizeSelected(editor));
    setContextMenu(null);
    setDirty(true);
  }, []);

  const handleImageFit = useCallback((fit: 'cover' | 'contain') => {
    const selected = editorRef.current?.getSelected();
    if (!selected) return;
    selected.addStyle({ 'object-fit': fit });
    setDirty(true);
  }, []);

  const applySelectedStyles = useCallback((styles: Record<string, string>) => {
    const editor = editorRef.current;
    const selected = editor?.getSelected();
    if (!editor || !selected) return;

    selected.addStyle(styles);
    setSelectedSummary(summarizeSelected(editor));
    setDirty(true);
  }, []);

  const handleQuickStyleChange = useCallback(
    (property: string, value: string) => {
      applySelectedStyles({ [property]: normalizeCssValue(property, value) });
    },
    [applySelectedStyles]
  );

  const handleContextFontSizeStep = useCallback(
    (delta: number) => {
      const editor = editorRef.current;
      const selected = editor?.getSelected();
      if (!editor || !selected) return;

      const style = selected.getStyle();
      const currentSize = cssNumber(stringStyleValue(style['font-size']) || selectedSummary?.fontSize, 24);
      const nextSize = Math.max(8, Math.min(220, Math.round(currentSize + delta)));
      applySelectedStyles({ 'font-size': `${nextSize}px` });
    },
    [applySelectedStyles, selectedSummary?.fontSize]
  );

  const handleToggleTextStyle = useCallback(
    (styleName: 'bold' | 'italic' | 'underline') => {
      const editor = editorRef.current;
      const selected = editor?.getSelected();
      if (!editor || !selected) return;

      const style = selected.getStyle();
      if (styleName === 'bold') {
        applySelectedStyles({ 'font-weight': isBoldValue(stringStyleValue(style['font-weight'])) ? '400' : '700' });
        return;
      }
      if (styleName === 'italic') {
        applySelectedStyles({ 'font-style': stringStyleValue(style['font-style']) === 'italic' ? 'normal' : 'italic' });
        return;
      }
      const current = stringStyleValue(style['text-decoration']) || '';
      applySelectedStyles({ 'text-decoration': current.includes('underline') ? 'none' : 'underline' });
    },
    [applySelectedStyles]
  );

  const openCodeView = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    flushEditorState(editor);
    setCodeHtml(formatLooseHtml(editor.getHtml()));
    setCodeCss(editor.getCss() ?? '');
    setCodeOpen(true);
  }, []);

  const applyCodeView = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    loadingSlideRef.current = true;
    editor.setComponents(codeHtml);
    editor.setStyle(codeCss);
    window.setTimeout(() => {
      loadingSlideRef.current = false;
      syncCanvasHelpers();
      commitCurrentSlide();
      setDirty(true);
      setCodeOpen(false);
    }, 0);
  }, [codeCss, codeHtml, commitCurrentSlide, syncCanvasHelpers]);

  const currentSlideIndex = slides.findIndex((slide) => slide.id === currentSlideId);
  const selectedSlide = slides[currentSlideIndex] ?? slides[0];
  const contextFontSize = cssNumber(selectedSummary?.fontSize, 24);
  const contextTextColor = cssColorInputValue(selectedSummary?.color, '#111827');
  const contextFillColor = cssColorInputValue(selectedSummary?.backgroundColor, '#ffffff');
  const contextFontValue = FONT_OPTIONS.some((option) => option.value === selectedSummary?.fontFamily) ? selectedSummary?.fontFamily : '';
  const contextBoldActive = isBoldValue(selectedSummary?.fontWeight);
  const contextItalicActive = selectedSummary?.fontStyle === 'italic';
  const contextUnderlineActive = (selectedSummary?.textDecoration || '').includes('underline');

  const applyCurrentSlideCanvasPatch = useCallback(
    (patch: Partial<Pick<SlideModel, 'canvasWidth' | 'canvasHeight' | 'presentationMode'>>, reload = false) => {
      const currentId = currentSlideIdRef.current;
      const source = slidesRef.current.find((slide) => slide.id === currentId);
      if (!source) return;

      const target = normalizeSlide({
        ...source,
        ...patch,
        canvasWidth: clampCanvasInput(patch.canvasWidth ?? source.canvasWidth, DEFAULT_CANVAS_WIDTH),
        canvasHeight: clampCanvasInput(patch.canvasHeight ?? source.canvasHeight, DEFAULT_CANVAS_HEIGHT),
        presentationMode: patch.presentationMode ?? source.presentationMode
      });
      const next = slidesRef.current.map((slide) => (slide.id === currentId ? target : slide));
      slidesRef.current = next;
      setSlides(next);
      setDirty(true);

      if (reload) {
        loadSlideIntoEditor(target);
        return;
      }

      updateCanvasDevice(target);
      const editor = editorRef.current;
      const root = editor?.getWrapper()?.find('.deck-slide')[0];
      root?.addAttributes({
        'data-canvas-width': String(target.canvasWidth),
        'data-canvas-height': String(target.canvasHeight),
        'data-presentation-mode': target.presentationMode
      });
      root?.addStyle({
        '--htmlppt-slide-width': `${target.canvasWidth}px`,
        '--htmlppt-slide-height': `${target.canvasHeight}px`
      });
    },
    [loadSlideIntoEditor, updateCanvasDevice]
  );

  const updateCurrentSlideSettings = useCallback(
    (patch: Partial<Pick<SlideModel, 'canvasWidth' | 'canvasHeight' | 'presentationMode'>>) => {
      const updated = commitCurrentSlide();
      const currentId = currentSlideIdRef.current;
      const next = updated.map((slide) => {
        if (slide.id !== currentId) return slide;
        return normalizeSlide({
          ...slide,
          ...patch,
          canvasWidth: clampCanvasInput(patch.canvasWidth ?? slide.canvasWidth, DEFAULT_CANVAS_WIDTH),
          canvasHeight: clampCanvasInput(patch.canvasHeight ?? slide.canvasHeight, DEFAULT_CANVAS_HEIGHT),
          presentationMode: patch.presentationMode ?? slide.presentationMode
        });
      });
      const target = next.find((slide) => slide.id === currentId);
      setSlides(next);
      slidesRef.current = next;
      setDirty(true);
      if (target) loadSlideIntoEditor(target);
    },
    [commitCurrentSlide, loadSlideIntoEditor]
  );

  const handleCanvasResizeStart = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      const source = slidesRef.current.find((slide) => slide.id === currentSlideIdRef.current);
      if (!source) return;
      const startX = event.clientX;
      const startY = event.clientY;
      const startWidth = getSlideCanvasWidth(source);
      const startHeight = getSlideCanvasHeight(source);
      const scale = Math.max(0.1, zoomRef.current / 100);

      const handleMove = (moveEvent: MouseEvent) => {
        const nextWidth = clampCanvasInput(startWidth + (moveEvent.clientX - startX) / scale, DEFAULT_CANVAS_WIDTH);
        const nextHeight = clampCanvasInput(startHeight + (moveEvent.clientY - startY) / scale, DEFAULT_CANVAS_HEIGHT);
        applyCurrentSlideCanvasPatch({ canvasWidth: nextWidth, canvasHeight: nextHeight }, false);
      };

      const handleUp = () => {
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('mouseup', handleUp);
      };

      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleUp);
    },
    [applyCurrentSlideCanvasPatch]
  );

  const applyPagePreset = useCallback(
    (preset: 'slide' | 'wide' | 'scroll') => {
      if (preset === 'slide') {
        updateCurrentSlideSettings({
          canvasWidth: DEFAULT_CANVAS_WIDTH,
          canvasHeight: DEFAULT_CANVAS_HEIGHT,
          presentationMode: 'fit'
        });
      }
      if (preset === 'wide') {
        updateCurrentSlideSettings({
          canvasWidth: 1920,
          canvasHeight: 1080,
          presentationMode: 'fit'
        });
      }
      if (preset === 'scroll') {
        updateCurrentSlideSettings({
          canvasWidth: DEFAULT_SCROLL_CANVAS_WIDTH,
          canvasHeight: DEFAULT_SCROLL_CANVAS_HEIGHT,
          presentationMode: 'scroll'
        });
      }
    },
    [updateCurrentSlideSettings]
  );

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">H</div>
          <div>
            <strong>HTML Demo Editor</strong>
            <span>{meta.sourceName || '本地演示材料'}</span>
          </div>
        </div>

        <nav className="toolbar" aria-label="主工具栏">
          <ToolbarButton label="新建" onClick={handleNewProject}>
            <FilePlus2 size={16} />
          </ToolbarButton>
          <ToolbarButton label="打开" onClick={handleOpenFile}>
            <FolderOpen size={16} />
          </ToolbarButton>
          <ToolbarButton label="文件夹" onClick={handleOpenFolder}>
            <PanelLeft size={16} />
          </ToolbarButton>
          <ToolbarButton label="保存" onClick={handleSave}>
            <Save size={16} />
          </ToolbarButton>
          <ToolbarButton label="另存" onClick={handleSaveAs}>
            <Scissors size={16} />
          </ToolbarButton>
          <span className="toolbar-divider" />
          <ToolbarButton label="撤销" onClick={handleUndo}>
            <Undo2 size={16} />
          </ToolbarButton>
          <ToolbarButton label="重做" onClick={handleRedo}>
            <Redo2 size={16} />
          </ToolbarButton>
          <ToolbarButton label="代码" onClick={openCodeView} active={codeOpen}>
            <Code2 size={16} />
          </ToolbarButton>
          <span className="toolbar-divider" />
          <ToolbarButton label="预览" onClick={handlePreviewWindow}>
            <Play size={16} />
          </ToolbarButton>
          <ToolbarButton label="演示" onClick={handlePresent}>
            <MonitorPlay size={16} />
          </ToolbarButton>
          <ToolbarButton label="导出" onClick={handleExport}>
            <Download size={16} />
          </ToolbarButton>
        </nav>
      </header>

      <main className="workspace">
        <aside className="left-pane">
          <div className="pane-tabs">
            <button className={leftTab === 'slides' ? 'is-active' : ''} type="button" onClick={() => setLeftTab('slides')}>
              页面
            </button>
            <button className={leftTab === 'blocks' ? 'is-active' : ''} type="button" onClick={() => setLeftTab('blocks')}>
              组件
            </button>
          </div>

          <div className={`slides-pane${leftTab !== 'slides' ? ' is-hidden' : ''}`}>
            <div className="slides-header">
              <span>{slides.length} 页</span>
              <button type="button" title="新增页面" onClick={handleAddSlide}>
                <Plus size={16} />
              </button>
            </div>
            <div className="slide-list">
              {slides.map((slide, index) => (
                <article
                  className={`slide-row${slide.id === currentSlideId ? ' is-active' : ''}`}
                  draggable
                  key={slide.id}
                  onClick={() => handleSelectSlide(slide.id)}
                  onDragStart={() => setDraggedSlideId(slide.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => handleDropSlide(slide.id)}
                >
                  <div className="slide-number">{index + 1}</div>
                  <div className="slide-thumb">
                    <iframe
                      title={slide.name}
                      srcDoc={buildSlidePreviewDoc(slide, meta)}
                      sandbox=""
                      style={{
                        width: `${getSlideCanvasWidth(slide)}px`,
                        height: `${getSlideCanvasHeight(slide)}px`,
                        transform: `scale(${Math.min(184 / getSlideCanvasWidth(slide), 110 / getSlideCanvasHeight(slide))})`
                      }}
                    />
                  </div>
                  <input
                    value={slide.name}
                    onChange={(event) => handleRenameSlide(slide.id, event.target.value)}
                    onClick={(event) => event.stopPropagation()}
                  />
                  <div className="slide-actions">
                    <button
                      type="button"
                      title="复制页面"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDuplicateSlide(slide.id);
                      }}
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      type="button"
                      title="删除页面"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDeleteSlide(slide.id);
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className={`blocks-pane${leftTab !== 'blocks' ? ' is-hidden' : ''}`}>
            <div id="blocks-panel" />
          </div>
        </aside>

        <section className="canvas-region">
          <div className="canvas-toolbar">
            <div>
              <strong>{selectedSlide?.name || '页面'}</strong>
              <span>
                {projectModeLabel(meta.documentMode)} ·{' '}
                {meta.documentMode
                  ? '浏览器自适应'
                  : selectedSlide
                    ? `${getSlideCanvasWidth(selectedSlide)}×${getSlideCanvasHeight(selectedSlide)} · ${presentationModeLabel(selectedSlide.presentationMode)}`
                    : '页面'} ·{' '}
                {currentSlideIndex + 1 || 1}/{slides.length}
              </span>
            </div>
            <div className="canvas-tools">
              <label className="toggle-row">
                <input
                  checked={gridEnabled && !meta.documentMode}
                  disabled={meta.documentMode}
                  type="checkbox"
                  onChange={(event) => setGridEnabled(event.target.checked)}
                />
                网格
              </label>
              <button
                className={canvasFitMode === 'width' ? 'is-active' : ''}
                type="button"
                title="铺满宽度"
                onClick={() => {
                  setCanvasFitMode('width');
                  window.setTimeout(handleFitCanvas, 0);
                }}
              >
                宽
              </button>
              <button
                className={canvasFitMode === 'fit' ? 'is-active' : ''}
                type="button"
                title="适配整屏"
                onClick={() => {
                  setCanvasFitMode('fit');
                  window.setTimeout(handleFitCanvas, 0);
                }}
              >
                全
              </button>
              <button type="button" title="缩小" onClick={() => setZoom((value) => Math.max(10, value - 10))}>
                <ZoomOut size={16} />
              </button>
              <span className="zoom-value">{zoom}%</span>
              <button type="button" title="放大" onClick={() => setZoom((value) => Math.min(200, value + 10))}>
                <ZoomIn size={16} />
              </button>
              <button type="button" title="适配画布" onClick={handleFitCanvas}>
                <Maximize2 size={16} />
              </button>
            </div>
          </div>
          <div ref={editorShellRef} className="editor-shell">
            <div ref={editorHostRef} className={`editor-host${meta.documentMode ? ' is-document-mode' : ''}`} />
          </div>
        </section>

        <aside className="right-pane">
          <div className="pane-tabs">
            <button className={rightTab === 'style' ? 'is-active' : ''} type="button" onClick={() => setRightTab('style')}>
              样式
            </button>
            <button className={rightTab === 'layers' ? 'is-active' : ''} type="button" onClick={() => setRightTab('layers')}>
              图层
            </button>
            <button className={rightTab === 'page' ? 'is-active' : ''} type="button" onClick={() => setRightTab('page')}>
              页面
            </button>
          </div>

          <div className={`inspector-pane${rightTab !== 'style' ? ' is-hidden' : ''}`}>
            <section className="selection-card">
              <div className="selection-title">
                <PanelRight size={16} />
                <strong>{selectedSummary ? selectedSummary.label : '未选择元素'}</strong>
              </div>
              {selectedSummary ? (
                <>
                  <dl className="selection-meta">
                    <div>
                      <dt>位置</dt>
                      <dd>
                        {selectedSummary.left || '-'} / {selectedSummary.top || '-'}
                      </dd>
                    </div>
                    <div>
                      <dt>尺寸</dt>
                      <dd>
                        {selectedSummary.width || '-'} / {selectedSummary.height || '-'}
                      </dd>
                    </div>
                    {selectedSummary.classes && (
                      <div>
                        <dt>Class</dt>
                        <dd>{selectedSummary.classes}</dd>
                      </div>
                    )}
	                  </dl>
	                  <div className="quick-style-grid">
	                    <QuickField label="X" value={selectedSummary.left} onChange={(value) => handleQuickStyleChange('left', value)} />
	                    <QuickField label="Y" value={selectedSummary.top} onChange={(value) => handleQuickStyleChange('top', value)} />
	                    <QuickField label="W" value={selectedSummary.width} onChange={(value) => handleQuickStyleChange('width', value)} />
	                    <QuickField label="H" value={selectedSummary.height} onChange={(value) => handleQuickStyleChange('height', value)} />
	                    <QuickField
	                      label="字号"
	                      value={selectedSummary.fontSize}
	                      onChange={(value) => handleQuickStyleChange('font-size', value)}
	                    />
	                    <QuickField
	                      label="字重"
	                      value={selectedSummary.fontWeight}
	                      onChange={(value) => handleQuickStyleChange('font-weight', value)}
	                    />
	                    <QuickField label="文字色" value={selectedSummary.color} onChange={(value) => handleQuickStyleChange('color', value)} />
	                    <QuickField
	                      label="背景"
	                      value={selectedSummary.backgroundColor}
	                      onChange={(value) => handleQuickStyleChange('background-color', value)}
	                    />
	                    <QuickField
	                      label="圆角"
	                      value={selectedSummary.borderRadius}
	                      onChange={(value) => handleQuickStyleChange('border-radius', value)}
	                    />
	                    <QuickField label="透明" value={selectedSummary.opacity} onChange={(value) => handleQuickStyleChange('opacity', value)} />
	                    <QuickField label="层级" value={selectedSummary.zIndex} onChange={(value) => handleQuickStyleChange('z-index', value)} />
	                  </div>
	                  <div className="quick-actions">
                    <button type="button" onClick={handleDuplicateSelection} title="复制元素">
                      <Copy size={15} />
                      复制
                    </button>
                    <button type="button" onClick={handleDeleteSelection} title="删除元素">
                      <Trash2 size={15} />
                      删除
                    </button>
                    <button type="button" onClick={handleReplaceImage} title="替换图片或设置背景图">
                      <Image size={15} />
                      图片
                    </button>
                    {selectedSummary.isImage && (
                      <>
                        <button type="button" onClick={() => handleImageFit('cover')} title="图片填充">
                          <Maximize2 size={15} />
                          填充
                        </button>
                        <button type="button" onClick={() => handleImageFit('contain')} title="图片适应">
                          <PanelLeft size={15} />
                          适应
                        </button>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <p>无选中对象</p>
	              )}
	            </section>
	            <div id="style-manager-panel" className={`manager-panel${selectedSummary ? '' : ' is-hidden'}`} />
	            <div id="traits-panel" className={`manager-panel${selectedSummary ? '' : ' is-hidden'}`} />
	          </div>

          <div className={`layers-pane${rightTab !== 'layers' ? ' is-hidden' : ''}`}>
            <div id="layers-panel" />
          </div>

          <div className={`page-pane${rightTab !== 'page' ? ' is-hidden' : ''}`}>
            <label>
              项目标题
              <input value={meta.title} onChange={(event) => setMeta((current) => ({ ...current, title: event.target.value }))} />
            </label>
            <label>
              项目模式
              <select
                value={meta.documentMode ? 'document' : 'slides'}
                onChange={(event) => {
                  const documentMode = event.target.value === 'document';
                  setMeta((current) => {
                    const next = {
                      ...current,
                      documentMode
                    };
                    metaRef.current = next;
                    return next;
                  });
                  if (documentMode) {
                    setGridEnabled(false);
                    gridEnabledRef.current = false;
                    setCanvasFitMode('width');
                    canvasFitModeRef.current = 'width';
                  }
                  window.setTimeout(() => {
                    const current = slidesRef.current.find((slide) => slide.id === currentSlideIdRef.current);
                    if (current) updateCanvasDevice(current);
                    syncCanvasHelpers();
                    handleFitCanvas();
                  }, 0);
                  setDirty(true);
                }}
              >
                <option value="document">大 HTML 文档，可滚动</option>
                <option value="slides">分页演示，按页切换</option>
              </select>
            </label>
            <label>
              {meta.documentMode ? '文档名称' : '当前页面'}
              <input
                value={selectedSlide?.name || ''}
                onChange={(event) => selectedSlide && handleRenameSlide(selectedSlide.id, event.target.value)}
              />
            </label>
            <div className="page-control-grid">
              <label>
                画布宽
                <input
                  type="number"
                  min={320}
                  max={12000}
                  value={selectedSlide ? getSlideCanvasWidth(selectedSlide) : DEFAULT_CANVAS_WIDTH}
                  onChange={(event) => updateCurrentSlideSettings({ canvasWidth: Number(event.target.value) })}
                />
              </label>
              <label>
                画布高
                <input
                  type="number"
                  min={320}
                  max={12000}
                  value={selectedSlide ? getSlideCanvasHeight(selectedSlide) : DEFAULT_CANVAS_HEIGHT}
                  onChange={(event) => updateCurrentSlideSettings({ canvasHeight: Number(event.target.value) })}
                />
              </label>
            </div>
            <label>
              演示方式
              <select
                value={selectedSlide?.presentationMode || 'fit'}
                onChange={(event) => updateCurrentSlideSettings({ presentationMode: event.target.value as PresentationMode })}
              >
                <option value="fit">适配整页</option>
                <option value="scroll">宽度填充，可滚动</option>
              </select>
            </label>
            <div className="preset-actions" aria-label="画布预设">
              <button type="button" onClick={() => applyPagePreset('slide')}>
                16:9
              </button>
              <button type="button" onClick={() => applyPagePreset('wide')}>
                1920×1080
              </button>
              <button type="button" onClick={() => applyPagePreset('scroll')}>
                长页
              </button>
            </div>
            <div className="page-facts">
              <div>
                <span>画布</span>
                <strong>
                  {selectedSlide ? `${getSlideCanvasWidth(selectedSlide)} × ${getSlideCanvasHeight(selectedSlide)}` : '尚未选择'}
                </strong>
              </div>
              <div>
                <span>演示</span>
                <strong>{meta.documentMode ? '原生滚动网页' : selectedSlide ? presentationModeLabel(selectedSlide.presentationMode) : '-'}</strong>
              </div>
              <div>
                <span>模式</span>
                <strong>{projectModeLabel(meta.documentMode)}</strong>
              </div>
              <div>
                <span>路径</span>
                <strong>{meta.filePath || '尚未保存'}</strong>
              </div>
              <div>
                <span>状态</span>
                <strong>{dirty ? '未保存' : '已保存'}</strong>
              </div>
            </div>
          </div>
        </aside>
      </main>

      <footer className="statusbar">
        <span>{dirty ? '有未保存修改' : '已保存'}</span>
        <span>
          HTML/CSS · {selectedSlide ? `${getSlideCanvasWidth(selectedSlide)}×${getSlideCanvasHeight(selectedSlide)}` : '页面'} · 本地文件
        </span>
      </footer>

      <div id="hidden-gjs-panel" hidden />

      {dropActive && (
        <div className="drop-overlay" aria-label="拖拽打开文件">
          <div>
            <strong>释放打开 HTML</strong>
            <span>支持 .html 文件或包含 index.html 的文件夹</span>
          </div>
        </div>
      )}

      {contextMenu && (
        <div
          className="context-menu"
          role="menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <strong>{contextMenu.label}</strong>
          <div className="context-style-panel" aria-label="快捷格式">
            <div className="context-control-row">
              <label className="context-select">
                <Type size={14} />
                <select value={contextFontValue} onChange={(event) => handleQuickStyleChange('font-family', event.target.value)}>
                  <option value="">字体</option>
                  {FONT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="context-size-control" aria-label="字号">
                <button type="button" title="减小字号" onClick={() => handleContextFontSizeStep(-2)}>
                  -
                </button>
                <input
                  aria-label="字号"
                  min={8}
                  max={220}
                  type="number"
                  value={contextFontSize}
                  onChange={(event) => handleQuickStyleChange('font-size', event.target.value)}
                />
                <button type="button" title="增大字号" onClick={() => handleContextFontSizeStep(2)}>
                  +
                </button>
              </div>
            </div>
            <div className="context-icon-row" aria-label="文字样式">
              <button
                className={contextBoldActive ? 'is-active' : ''}
                type="button"
                title="加粗"
                onClick={() => handleToggleTextStyle('bold')}
              >
                <Bold size={15} />
              </button>
              <button
                className={contextItalicActive ? 'is-active' : ''}
                type="button"
                title="斜体"
                onClick={() => handleToggleTextStyle('italic')}
              >
                <Italic size={15} />
              </button>
              <button
                className={contextUnderlineActive ? 'is-active' : ''}
                type="button"
                title="下划线"
                onClick={() => handleToggleTextStyle('underline')}
              >
                <Underline size={15} />
              </button>
            </div>
            <div className="context-color-group">
              <div className="context-color-title">
                <Palette size={14} />
                <span>文字</span>
                <input
                  aria-label="文字颜色"
                  type="color"
                  value={contextTextColor}
                  onChange={(event) => handleQuickStyleChange('color', event.target.value)}
                />
              </div>
              <div className="context-swatch-row">
                {TEXT_COLOR_SWATCHES.map((color) => (
                  <button
                    key={color}
                    aria-label={`文字颜色 ${color}`}
                    className="context-swatch"
                    style={{ backgroundColor: color }}
                    type="button"
                    onClick={() => handleQuickStyleChange('color', color)}
                  />
                ))}
              </div>
            </div>
            <div className="context-color-group">
              <div className="context-color-title">
                <PaintBucket size={14} />
                <span>背景</span>
                <input
                  aria-label="背景颜色"
                  type="color"
                  value={contextFillColor}
                  onChange={(event) => handleQuickStyleChange('background-color', event.target.value)}
                />
              </div>
              <div className="context-swatch-row">
                {FILL_COLOR_SWATCHES.map((color) => (
                  <button
                    key={color}
                    aria-label={`背景颜色 ${color}`}
                    className="context-swatch"
                    style={{ backgroundColor: color }}
                    type="button"
                    onClick={() => handleQuickStyleChange('background-color', color)}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="context-menu-separator" />
          <button type="button" role="menuitem" disabled={!contextMenu.canEditText} onClick={handleEditSelectedText}>
            <Type size={15} />
            编辑文字
          </button>
          <button type="button" role="menuitem" onClick={handleDuplicateSelection}>
            <Copy size={15} />
            复制
          </button>
          <button type="button" role="menuitem" onClick={handleDeleteSelection}>
            <Trash2 size={15} />
            删除
          </button>
          <button type="button" role="menuitem" onClick={handleReplaceImage}>
            <Image size={15} />
            {contextMenu.isImage ? '替换图片' : '设置背景图'}
          </button>
          <div className="context-menu-separator" />
          <button type="button" role="menuitem" onClick={() => handleMoveSelectionLayer('front')}>
            <BringToFront size={15} />
            置于顶层
          </button>
          <button type="button" role="menuitem" onClick={() => handleMoveSelectionLayer('back')}>
            <SendToBack size={15} />
            置于底层
          </button>
        </div>
      )}

      {toast && (
        <div className="app-toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}

      {codeOpen && (
        <div className="code-modal" role="dialog" aria-modal="true" aria-label="代码视图">
          <div className="code-dialog">
            <header>
              <div>
                <strong>高级代码视图</strong>
                <span>当前页面 HTML / CSS</span>
              </div>
              <button type="button" onClick={() => setCodeOpen(false)}>
                关闭
              </button>
            </header>
            <div className="code-grid">
              <label>
                HTML
                <textarea value={codeHtml} spellCheck={false} onChange={(event) => setCodeHtml(event.target.value)} />
              </label>
              <label>
                CSS
                <textarea value={codeCss} spellCheck={false} onChange={(event) => setCodeCss(event.target.value)} />
              </label>
            </div>
            <footer>
              <button type="button" onClick={() => setCodeHtml((value) => formatLooseHtml(value))}>
                格式化 HTML
              </button>
              <button type="button" className="primary" onClick={applyCodeView}>
                应用到当前页
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
