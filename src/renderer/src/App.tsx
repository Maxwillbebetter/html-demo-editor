import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import grapesjs, { type Component, type Editor } from 'grapesjs';
import basicBlocks from 'grapesjs-blocks-basic';
import {
  Code2,
  Copy,
  Download,
  FilePlus2,
  FolderOpen,
  Image,
  Maximize2,
  MonitorPlay,
  PanelLeft,
  PanelRight,
  Play,
  Plus,
  Redo2,
  Save,
  Scissors,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { registerEditorBlocks, STYLE_SECTORS } from './editorBlocks';
import {
  buildExportHtml,
  buildSlidePreviewDoc,
  CANVAS_BASE_CSS,
  createBlankSlide,
  createDefaultProject,
  formatLooseHtml,
  parseHtmlProject,
  type ProjectMeta,
  type SlideModel
} from './project';

type LeftTab = 'slides' | 'blocks';
type RightTab = 'style' | 'layers' | 'page';

interface SelectedSummary {
  label: string;
  id?: string;
  classes?: string;
  width?: string;
  height?: string;
  left?: string;
  top?: string;
  zIndex?: string;
  fontSize?: string;
  fontWeight?: string;
  color?: string;
  backgroundColor?: string;
  borderRadius?: string;
  opacity?: string;
  isImage: boolean;
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
    fontSize: stringStyleValue(style['font-size']),
    fontWeight: stringStyleValue(style['font-weight']),
    color: stringStyleValue(style.color),
    backgroundColor: stringStyleValue(style['background-color']),
    borderRadius: stringStyleValue(style['border-radius']),
    opacity: stringStyleValue(style.opacity),
    isImage: tagName === 'img' || selected.is('image')
  };
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
  if (!(target instanceof Node)) return null;
  const element = target.nodeType === Node.TEXT_NODE ? target.parentElement : target;
  return element instanceof HTMLElement ? element : null;
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
  const [gridEnabled, setGridEnabled] = useState(true);
  const [draggedSlideId, setDraggedSlideId] = useState<string | null>(null);

  const editorHostRef = useRef<HTMLDivElement | null>(null);
  const editorShellRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const loadingSlideRef = useRef(false);
  const slidesRef = useRef(slides);
  const metaRef = useRef(meta);
  const currentSlideIdRef = useRef(currentSlideId);
  const gridEnabledRef = useRef(gridEnabled);
  const zoomRef = useRef(zoom);

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
    zoomRef.current = zoom;
    editorRef.current?.Canvas.setZoom(zoom);
  }, [zoom]);

  const syncCanvasHelpers = useCallback(() => {
    const editor = editorRef.current;
    const doc = editor?.Canvas.getDocument();
    if (!doc) return;

    let helperStyle = doc.getElementById('html-demo-editor-canvas-style') as HTMLStyleElement | null;
    if (!helperStyle) {
      helperStyle = doc.createElement('style');
      helperStyle.id = 'html-demo-editor-canvas-style';
      doc.head.appendChild(helperStyle);
    }

    helperStyle.textContent = `
      .deck-slide {
        outline: 1px solid rgba(41, 52, 66, 0.16);
        box-shadow: 0 26px 60px rgba(30, 41, 59, 0.14);
      }
      ${
        gridEnabledRef.current
          ? `.deck-slide {
              background-image:
                linear-gradient(rgba(15, 118, 110, 0.08) 1px, transparent 1px),
                linear-gradient(90deg, rgba(15, 118, 110, 0.08) 1px, transparent 1px);
              background-size: 24px 24px;
            }`
          : ''
      }
    `;
  }, []);

  const loadSlideIntoEditor = useCallback(
    (slide: SlideModel) => {
      const editor = editorRef.current;
      if (!editor) return;

      loadingSlideRef.current = true;
      editor.setComponents(slide.components);
      editor.setStyle(`${CANVAS_BASE_CSS}\n${slide.css}`);
      editor.Canvas.setZoom(zoomRef.current);
      (editor as unknown as { setDragMode?: (mode: string) => void }).setDragMode?.('absolute');
      setSelectedSummary(null);

      window.setTimeout(() => {
        syncCanvasHelpers();
        loadingSlideRef.current = false;
      }, 0);
    },
    [syncCanvasHelpers]
  );

  const commitCurrentSlide = useCallback(() => {
    const editor = editorRef.current;
    const currentId = currentSlideIdRef.current;
    if (!editor || !currentId || loadingSlideRef.current) return slidesRef.current;

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
      const firstSlide = nextSlides[0] ?? createBlankSlide('页面 1');
      setMeta(nextMeta);
      setSlides(nextSlides.length ? nextSlides : [firstSlide]);
      setCurrentSlideId(firstSlide.id);
      setDirty(false);
      slidesRef.current = nextSlides.length ? nextSlides : [firstSlide];
      metaRef.current = nextMeta;
      currentSlideIdRef.current = firstSlide.id;
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
        default: 'slide-16-9',
        devices: [
          {
            id: 'slide-16-9',
            name: '16:9 Slide',
            width: '1280px',
            height: '720px',
            widthMedia: '1280px'
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

            editor.select(component);
            setRightTab('style');
            setSelectedSummary(summarizeSelected(editor));
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

  const handleOpenFile = useCallback(async () => {
    if (!confirmDiscard()) return;
    const result = await window.desktopBridge.openHtmlFile();
    if (!result) return;
    const parsed = parseHtmlProject(result.html, result.name, result.filePath, result.baseDir);
    replaceProject(parsed.meta, parsed.slides);
  }, [confirmDiscard, replaceProject]);

  const handleOpenFolder = useCallback(async () => {
    if (!confirmDiscard()) return;
    const result = await window.desktopBridge.openProjectFolder();
    if (!result) return;
    const parsed = parseHtmlProject(result.html, result.name, result.filePath, result.baseDir);
    replaceProject(parsed.meta, parsed.slides);
  }, [confirmDiscard, replaceProject]);

  const handleSave = useCallback(async () => {
    const { html } = materializeHtml();
    const result = await window.desktopBridge.saveProject({
      filePath: metaRef.current.filePath,
      html,
      defaultName: safeDefaultName(metaRef.current.title)
    });
    if (!result) return;

    setMeta((current) => ({
      ...current,
      filePath: result.filePath,
      baseDir: dirnameFromPath(result.filePath),
      sourceName: result.filePath.split(/[\\/]/).pop()
    }));
    setDirty(false);
  }, [materializeHtml]);

  const handleSaveAs = useCallback(async () => {
    const { html } = materializeHtml();
    const result = await window.desktopBridge.saveProjectAs({
      html,
      defaultName: safeDefaultName(metaRef.current.title)
    });
    if (!result) return;

    setMeta((current) => ({
      ...current,
      filePath: result.filePath,
      baseDir: dirnameFromPath(result.filePath),
      sourceName: result.filePath.split(/[\\/]/).pop()
    }));
    setDirty(false);
  }, [materializeHtml]);

  const handleExport = useCallback(async () => {
    const { html } = materializeHtml();
    await window.desktopBridge.exportPackage({
      html,
      sourceBaseDir: metaRef.current.baseDir
    });
  }, [materializeHtml]);

  const handlePresent = useCallback(async () => {
    const { html } = materializeHtml();
    await window.desktopBridge.presentProject({
      html,
      baseDir: metaRef.current.baseDir,
      fullscreen: true
    });
  }, [materializeHtml]);

  const handlePreviewWindow = useCallback(async () => {
    const { html } = materializeHtml();
    await window.desktopBridge.presentProject({
      html,
      baseDir: metaRef.current.baseDir,
      fullscreen: false
    });
  }, [materializeHtml]);

  const handleUndo = useCallback(() => {
    editorRef.current?.UndoManager.undo();
  }, []);

  const handleRedo = useCallback(() => {
    editorRef.current?.UndoManager.redo();
  }, []);

  const handleFitCanvas = useCallback(() => {
    const shell = editorShellRef.current;
    if (!shell) return;
    const bounds = shell.getBoundingClientRect();
    const fit = Math.floor(Math.min((bounds.width - 220) / 1280, (bounds.height - 100) / 720) * 100);
    setZoom(Math.max(35, Math.min(100, fit)));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(handleFitCanvas, 80);
    return () => window.clearTimeout(timer);
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
      if (slidesRef.current.length <= 1) return;
      const updated = commitCurrentSlide();
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
    [commitCurrentSlide, loadSlideIntoEditor]
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
    setDirty(true);
  }, []);

  const handleImageFit = useCallback((fit: 'cover' | 'contain') => {
    const selected = editorRef.current?.getSelected();
    if (!selected) return;
    selected.addStyle({ 'object-fit': fit });
    setDirty(true);
  }, []);

  const handleQuickStyleChange = useCallback((property: string, value: string) => {
    const editor = editorRef.current;
    const selected = editor?.getSelected();
    if (!editor || !selected) return;

    selected.addStyle({ [property]: normalizeCssValue(property, value) });
    setSelectedSummary(summarizeSelected(editor));
    setDirty(true);
  }, []);

  const openCodeView = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    setCodeHtml(formatLooseHtml(editor.getHtml()));
    setCodeCss(editor.getCss() ?? '');
    setCodeOpen(true);
  }, []);

  const applyCodeView = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    loadingSlideRef.current = true;
    editor.setComponents(codeHtml);
    editor.setStyle(`${CANVAS_BASE_CSS}\n${codeCss}`);
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
                    <iframe title={slide.name} srcDoc={buildSlidePreviewDoc(slide)} sandbox="" />
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
                      disabled={slides.length <= 1}
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
              <span>16:9 · {currentSlideIndex + 1 || 1}/{slides.length}</span>
            </div>
            <div className="canvas-tools">
              <label className="toggle-row">
                <input checked={gridEnabled} type="checkbox" onChange={(event) => setGridEnabled(event.target.checked)} />
                网格
              </label>
              <button type="button" title="缩小" onClick={() => setZoom((value) => Math.max(35, value - 10))}>
                <ZoomOut size={16} />
              </button>
              <span className="zoom-value">{zoom}%</span>
              <button type="button" title="放大" onClick={() => setZoom((value) => Math.min(140, value + 10))}>
                <ZoomIn size={16} />
              </button>
              <button type="button" title="适配画布" onClick={handleFitCanvas}>
                <Maximize2 size={16} />
              </button>
            </div>
          </div>
          <div ref={editorShellRef} className="editor-shell">
            <div ref={editorHostRef} className="editor-host" />
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
              当前页面
              <input
                value={selectedSlide?.name || ''}
                onChange={(event) => selectedSlide && handleRenameSlide(selectedSlide.id, event.target.value)}
              />
            </label>
            <div className="page-facts">
              <div>
                <span>画布</span>
                <strong>1280 × 720</strong>
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
        <span>{dirty ? '有未保存修改' : '已同步'}</span>
        <span>HTML/CSS · 16:9 · 本地文件</span>
      </footer>

      <div id="hidden-gjs-panel" hidden />

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
