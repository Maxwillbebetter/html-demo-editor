export type PresentationMode = 'fit' | 'scroll';

export interface SlideModel {
  id: string;
  name: string;
  components: string;
  css: string;
  canvasWidth: number;
  canvasHeight: number;
  presentationMode: PresentationMode;
}

export interface ProjectMeta {
  title: string;
  filePath?: string;
  baseDir?: string;
  assetBaseUrl?: string;
  sourceName?: string;
  headExtras: string;
  bodyTemplates: string;
  bodyScripts: string;
  htmlAttributes?: Record<string, string>;
  bodyAttributes?: Record<string, string>;
  documentMode?: boolean;
}

export interface ParsedProject {
  meta: ProjectMeta;
  slides: SlideModel[];
}

export const DEFAULT_CANVAS_WIDTH = 1280;
export const DEFAULT_CANVAS_HEIGHT = 720;
export const DEFAULT_SCROLL_CANVAS_WIDTH = 1440;
export const DEFAULT_SCROLL_CANVAS_HEIGHT = 1600;

export const CANVAS_BASE_CSS = `
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
  background: #ffffff;
}
.deck-slide * {
  box-sizing: border-box;
}
.deck-slide[data-presentation-mode="fit"] {
  height: var(--htmlppt-slide-height, ${DEFAULT_CANVAS_HEIGHT}px);
  overflow: hidden;
}
.deck-slide[data-presentation-mode="scroll"] {
  height: auto;
  overflow: visible;
}
`;

export const EXPORT_BASE_CSS = `
:root {
  --deck-scale: 1;
}
html,
body {
  width: 100%;
  height: 100%;
  margin: 0;
}
body.htmlppt-deck {
  background: var(--htmlppt-stage-background, #111111);
}
body.htmlppt-deck.is-fit-mode {
  overflow: hidden;
}
body.htmlppt-deck.is-scroll-mode {
  height: auto;
  min-height: 100%;
  overflow: auto;
}
body.htmlppt-deck > .deck-slide {
  box-sizing: border-box;
  display: block;
  width: var(--htmlppt-slide-width, ${DEFAULT_CANVAS_WIDTH}px);
  min-height: var(--htmlppt-slide-height, ${DEFAULT_CANVAS_HEIGHT}px);
  margin: 0;
  opacity: 0;
  pointer-events: none;
  visibility: hidden;
  transition: opacity 250ms ease;
}
body.htmlppt-deck > .deck-slide.is-active {
  display: block;
  opacity: 1;
  pointer-events: auto;
  visibility: visible;
}
body.htmlppt-deck.is-fit-mode > .deck-slide.is-active {
  pointer-events: auto;
}
body.htmlppt-deck.is-fit-mode > .deck-slide {
  position: fixed;
  left: 50%;
  top: 50%;
  height: var(--htmlppt-slide-height, ${DEFAULT_CANVAS_HEIGHT}px);
  overflow: hidden;
  transform: translate(-50%, -50%) scale(var(--deck-scale));
  transform-origin: center center;
}
body.htmlppt-deck.is-scroll-mode > .deck-slide {
  position: fixed;
  left: -200vw;
  top: 0;
  height: auto;
  overflow: visible;
  transform: translateX(-50%) scale(var(--deck-scale));
  transform-origin: top center;
}
body.htmlppt-deck.is-scroll-mode > .deck-slide.is-active {
  position: relative;
  left: 50%;
  top: 0;
  height: auto;
  overflow: visible;
  transform: translateX(-50%) scale(var(--deck-scale));
  transform-origin: top center;
}
body.htmlppt-deck > .deck-slide * {
  box-sizing: border-box;
}
.presenter-hud {
  position: fixed;
  left: 50%;
  bottom: 18px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 8px;
  background: rgba(15, 18, 24, 0.72);
  color: #ffffff;
  font: 13px/1.2 "Segoe UI", Arial, sans-serif;
  opacity: 0;
  pointer-events: none;
  transition: opacity 160ms ease;
  z-index: 1000;
}
.htmlppt-controls-active .presenter-hud,
.presenter-hud:hover,
.presenter-hud:focus-within {
  opacity: 1;
  pointer-events: auto;
}
.presenter-hud button {
  min-width: 30px;
  height: 28px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
  cursor: pointer;
}
.presenter-hud button:hover {
  background: rgba(255, 255, 255, 0.22);
}
.presenter-hud select {
  height: 28px;
  border: 0;
  border-radius: 6px;
  padding: 0 7px;
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
  font: inherit;
}
.presenter-hud select option {
  color: #111827;
}
.presenter-scale-label {
  min-width: 44px;
  text-align: center;
}
.presenter-blank {
  position: fixed;
  inset: 0;
  display: none;
  z-index: 999;
}
.presenter-blank.is-black {
  display: block;
  background: #000000;
}
.presenter-blank.is-white {
  display: block;
  background: #ffffff;
}
.presenter-laser-dot {
  position: fixed;
  left: 0;
  top: 0;
  z-index: 998;
  display: none;
  width: 18px;
  height: 18px;
  margin: -9px 0 0 -9px;
  border-radius: 999px;
  background: rgba(239, 68, 68, 0.94);
  box-shadow: 0 0 0 8px rgba(239, 68, 68, 0.18), 0 0 22px rgba(239, 68, 68, 0.72);
  pointer-events: none;
}
.presenter-ink-canvas {
  position: fixed;
  inset: 0;
  z-index: 997;
  pointer-events: none;
}
body.htmlppt-pointer-hidden,
body.htmlppt-pointer-hidden *,
body.htmlppt-pointer-laser,
body.htmlppt-pointer-laser *,
body.htmlppt-pointer-auto.htmlppt-pointer-idle,
body.htmlppt-pointer-auto.htmlppt-pointer-idle * {
  cursor: none !important;
}
body.htmlppt-pointer-pen,
body.htmlppt-pointer-pen * {
  cursor: crosshair !important;
}
.presenter-hud,
.presenter-hud * {
  cursor: default !important;
}
body.htmlppt-pointer-laser .presenter-laser-dot {
  display: block;
}
`;

const DEFAULT_SLIDE_CSS = `
.deck-slide {
  background: #ffffff;
}
.cover-kicker {
  position: absolute;
  left: 72px;
  top: 68px;
  padding: 8px 12px;
  border-radius: 6px;
  background: #eaf3ff;
  color: #0068d9;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0;
}
.cover-title {
  position: absolute;
  left: 72px;
  top: 136px;
  width: 760px;
  margin: 0;
  color: #18202b;
  font-size: 64px;
  line-height: 1.05;
  font-weight: 800;
}
.cover-subtitle {
  position: absolute;
  left: 76px;
  top: 312px;
  width: 660px;
  margin: 0;
  color: #54606f;
  font-size: 26px;
  line-height: 1.42;
}
.cover-panel {
  position: absolute;
  right: 72px;
  top: 92px;
  width: 330px;
  height: 500px;
  padding: 34px;
  border: 1px solid #dce3ea;
  border-radius: 8px;
  background: #f8fafb;
}
.cover-panel strong {
  display: block;
  color: #18202b;
  font-size: 56px;
  line-height: 1;
}
.cover-panel span {
  display: block;
  margin-top: 14px;
  color: #5d6876;
  font-size: 22px;
  line-height: 1.36;
}
.metric-grid {
  position: absolute;
  left: 72px;
  right: 72px;
  top: 188px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 22px;
}
.metric-card {
  min-height: 250px;
  padding: 28px;
  border: 1px solid #dbe3ea;
  border-radius: 8px;
  background: #ffffff;
}
.metric-card b {
  display: block;
  color: #007aff;
  font-size: 56px;
  line-height: 1;
}
.metric-card span {
  display: block;
  margin-top: 16px;
  color: #586474;
  font-size: 22px;
  line-height: 1.4;
}
.slide-heading {
  position: absolute;
  left: 72px;
  top: 58px;
  margin: 0;
  color: #18202b;
  font-size: 48px;
  line-height: 1.12;
}
.two-col-text {
  position: absolute;
  left: 72px;
  top: 168px;
  width: 1090px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 34px;
}
.text-block {
  padding: 28px;
  border-left: 6px solid #ff9f0a;
  background: #fbf7f0;
  color: #384250;
  font-size: 24px;
  line-height: 1.45;
}
`;

function uid(prefix = 'slide'): string {
  if (crypto.randomUUID) return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replaceAll('"', '&quot;');
}

function baseDirToFileHref(baseDir?: string): string | null {
  if (!baseDir) return null;
  const normalized = baseDir.replace(/\\/g, '/');
  const withSlash = normalized.endsWith('/') ? normalized : `${normalized}/`;
  if (/^[a-zA-Z]:\//.test(withSlash)) return `file:///${encodeURI(withSlash)}`;
  if (withSlash.startsWith('/')) return `file://${encodeURI(withSlash)}`;
  return null;
}

function clampCanvasSize(value: number | undefined, fallback: number, min = 320): number {
  if (!value || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(12000, Math.round(value)));
}

export function normalizeSlide(slide: SlideModel): SlideModel {
  const presentationMode = slide.presentationMode || 'fit';
  const minWidth = presentationMode === 'fit' ? DEFAULT_CANVAS_WIDTH : 320;
  const minHeight = presentationMode === 'fit' ? DEFAULT_CANVAS_HEIGHT : 320;
  return {
    ...slide,
    canvasWidth: clampCanvasSize(slide.canvasWidth, DEFAULT_CANVAS_WIDTH, minWidth),
    canvasHeight: clampCanvasSize(slide.canvasHeight, DEFAULT_CANVAS_HEIGHT, minHeight),
    presentationMode
  };
}

export function getSlideCanvasWidth(slide: SlideModel): number {
  return normalizeSlide(slide).canvasWidth;
}

export function getSlideCanvasHeight(slide: SlideModel): number {
  return normalizeSlide(slide).canvasHeight;
}

function styleVarsForSlide(slide: SlideModel): string {
  return `--htmlppt-slide-width:${getSlideCanvasWidth(slide)}px;--htmlppt-slide-height:${getSlideCanvasHeight(slide)}px;`;
}

function mergeStyleVars(existingStyle: string | null, vars: string): string {
  const cleaned = (existingStyle || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !part.startsWith('--htmlppt-slide-width') && !part.startsWith('--htmlppt-slide-height'))
    .join(';');

  return cleaned ? `${vars}${cleaned};` : vars;
}

function applySlideAttributes(element: HTMLElement, slide: SlideModel, index: number): void {
  const normalized = normalizeSlide(slide);
  element.classList.add('deck-slide');
  element.classList.remove('is-active');
  element.setAttribute('data-slide-id', normalized.id);
  element.setAttribute('aria-label', normalized.name || `页面 ${index + 1}`);
  element.setAttribute('data-canvas-width', String(normalized.canvasWidth));
  element.setAttribute('data-canvas-height', String(normalized.canvasHeight));
  element.setAttribute('data-presentation-mode', normalized.presentationMode);
  element.setAttribute('style', mergeStyleVars(element.getAttribute('style'), styleVarsForSlide(normalized)));
}

function applyDocumentRootAttributes(element: HTMLElement, slide: SlideModel): void {
  const normalized = normalizeSlide(slide);
  element.classList.remove('deck-slide', 'is-active');
  element.setAttribute('data-htmlppt-document-root', 'true');
  element.setAttribute('data-slide-id', normalized.id);
  element.setAttribute('data-canvas-width', String(normalized.canvasWidth));
  element.setAttribute('data-canvas-height', String(normalized.canvasHeight));
  element.setAttribute('data-presentation-mode', normalized.presentationMode);
}

function removeRuntimeNodes(root: ParentNode): void {
  root.querySelectorAll('[data-htmlppt-runtime], .presenter-hud, .presenter-blank').forEach((node) => node.remove());
}

function removeScripts(root: ParentNode): void {
  root.querySelectorAll('script').forEach((node) => node.remove());
}

function removeTemplates(root: ParentNode): void {
  root.querySelectorAll('template').forEach((node) => node.remove());
}

function collectHeadExtras(doc: Document): string {
  return Array.from(doc.head.children)
    .filter((node) => {
      const tag = node.tagName.toLowerCase();
      return !['title', 'style', 'script', 'base'].includes(tag) && !node.hasAttribute('data-htmlppt-runtime');
    })
    .map((node) => node.outerHTML)
    .join('\n');
}

function collectStyles(doc: Document): string {
  return Array.from(doc.querySelectorAll('style'))
    .filter((node) => !node.hasAttribute('data-htmlppt-runtime'))
    .map((node) => node.textContent ?? '')
    .join('\n');
}

function collectScripts(doc: Document): string {
  return Array.from(doc.querySelectorAll('script'))
    .filter((node) => !node.hasAttribute('data-htmlppt-runtime'))
    .map((node) => node.outerHTML)
    .join('\n');
}

function collectBodyTemplates(doc: Document): string {
  return Array.from(doc.body.querySelectorAll('template'))
    .filter((node) => !node.hasAttribute('data-htmlppt-runtime'))
    .map((node) => node.outerHTML)
    .join('\n');
}

function collectAttributes(element: Element): Record<string, string> {
  return Array.from(element.attributes).reduce<Record<string, string>>((attributes, attr) => {
    if (attr.name.startsWith('data-htmlppt-')) return attributes;
    attributes[attr.name] = attr.value;
    return attributes;
  }, {});
}

function resolveImportedDocument(rawHtml: string): { document: Document; fallbackTitle: string } {
  let document = new DOMParser().parseFromString(rawHtml, 'text/html');
  const fallbackTitle = document.title?.trim() || '';

  // Some AI/visualization exports use a tiny host page whose only content is
  // the real document encoded in iframe[srcdoc]. GrapesJS cannot edit that
  // nested browsing context reliably, so import the embedded document itself.
  for (let depth = 0; depth < 3; depth += 1) {
    const bodyChildren = Array.from(document.body.children).filter(
      (element) => !element.hasAttribute('data-htmlppt-runtime')
    );
    if (bodyChildren.length !== 1) break;

    const iframe = bodyChildren[0];
    if (iframe.tagName.toLowerCase() !== 'iframe') break;

    const srcdoc = iframe.getAttribute('srcdoc')?.trim();
    if (!srcdoc) break;

    const embedded = new DOMParser().parseFromString(srcdoc, 'text/html');
    if (!embedded.body.children.length && !embedded.body.textContent?.trim()) break;
    document = embedded;
  }

  return { document, fallbackTitle };
}

function serializeAttributes(attributes: Record<string, string> | undefined, extraClass = ''): string {
  if (!attributes && !extraClass) return '';
  const merged = { ...(attributes ?? {}) };
  const classes = [merged.class, extraClass].filter(Boolean).join(' ').trim();
  if (classes) merged.class = Array.from(new Set(classes.split(/\s+/))).join(' ');

  return Object.entries(merged)
    .filter(([name]) => name.toLowerCase() !== 'data-htmlppt-runtime')
    .map(([name, value]) => `${name}="${escapeAttr(value)}"`)
    .join(' ');
}

function serializeHtmlAttributes(attributes: Record<string, string> | undefined): string {
  return serializeAttributes({ lang: 'zh-CN', ...(attributes ?? {}) });
}

function parsePixelDimension(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const match = value.match(/(-?\d+(?:\.\d+)?)px/i);
  if (!match) return undefined;
  return Number(match[1]);
}

function dimensionFromInlineStyle(element: HTMLElement, property: 'width' | 'height' | 'min-height'): number | undefined {
  return parsePixelDimension(element.style.getPropertyValue(property));
}

function dimensionFromCss(css: string, element: HTMLElement, property: 'width' | 'height' | 'min-height'): number | undefined {
  const selectors = [
    element.id ? `#${element.id}` : '',
    ...Array.from(element.classList).map((className) => `.${className}`),
    element.tagName.toLowerCase()
  ].filter(Boolean);

  for (const selector of selectors) {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const ruleRegex = new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, 'gi');
    let match: RegExpExecArray | null;
    while ((match = ruleRegex.exec(css))) {
      const declarationRegex = new RegExp(`${property}\\s*:\\s*([^;]+)`, 'i');
      const declaration = match[1].match(declarationRegex);
      const parsed = parsePixelDimension(declaration?.[1]);
      if (parsed) return parsed;
    }
  }

  return undefined;
}

function inferDimensions(element: HTMLElement, sharedCss: string, mode: PresentationMode) {
  const width =
    dimensionFromInlineStyle(element, 'width') ||
    dimensionFromCss(sharedCss, element, 'width') ||
    (mode === 'scroll' ? DEFAULT_SCROLL_CANVAS_WIDTH : DEFAULT_CANVAS_WIDTH);
  const height =
    dimensionFromInlineStyle(element, 'height') ||
    dimensionFromInlineStyle(element, 'min-height') ||
    dimensionFromCss(sharedCss, element, 'height') ||
    dimensionFromCss(sharedCss, element, 'min-height') ||
    (mode === 'scroll' ? DEFAULT_SCROLL_CANVAS_HEIGHT : DEFAULT_CANVAS_HEIGHT);

  return {
    width: clampCanvasSize(width, mode === 'scroll' ? DEFAULT_SCROLL_CANVAS_WIDTH : DEFAULT_CANVAS_WIDTH),
    height: clampCanvasSize(height, mode === 'scroll' ? DEFAULT_SCROLL_CANVAS_HEIGHT : DEFAULT_CANVAS_HEIGHT)
  };
}

function firstNonEmptySelector(doc: Document, selectors: string[]): Element[] {
  for (const selector of selectors) {
    const matches = Array.from(doc.querySelectorAll(selector));
    if (matches.length > 0) return matches;
  }
  return [];
}

function getSlideCandidates(doc: Document): Element[] {
  const directMatches = firstNonEmptySelector(doc, [
    '.htmlppt-deck > .deck-slide',
    '.reveal .slides > section',
    'section[data-slide]',
    'section[data-slide-id]',
    'section.slide'
  ]);

  if (directMatches.length > 0) return directMatches;

  return [];
}

function normalizeSlideNode(node: Element, index: number, sharedCss: string): SlideModel {
  const clone = node.cloneNode(true) as HTMLElement;
  removeRuntimeNodes(clone);
  removeScripts(clone);
  removeTemplates(clone);

  const id = clone.getAttribute('data-slide-id') || uid();
  const name =
    clone.getAttribute('aria-label') ||
    clone.querySelector('h1,h2,h3')?.textContent?.trim() ||
    `页面 ${index + 1}`;
  const mode: PresentationMode = clone.getAttribute('data-presentation-mode') === 'scroll' ? 'scroll' : 'fit';
  const inferred = inferDimensions(clone, sharedCss, mode);
  const slide: SlideModel = {
    id,
    name,
    components: '',
    css: sharedCss,
    canvasWidth: inferred.width,
    canvasHeight: inferred.height,
    presentationMode: mode
  };

  applySlideAttributes(clone, slide, index);

  return {
    ...slide,
    components: clone.outerHTML,
  };
}

function normalizeBodyAsSingleSlide(doc: Document, sharedCss: string): SlideModel {
  const bodyClone = doc.body.cloneNode(true) as HTMLElement;
  removeRuntimeNodes(bodyClone);
  removeScripts(bodyClone);
  removeTemplates(bodyClone);

  const id = uid();
  const name = doc.querySelector('h1,h2,h3')?.textContent?.trim() || '页面 1';
  const rootChildren = Array.from(bodyClone.children).filter((child) => !child.hasAttribute('data-htmlppt-runtime'));
  const root =
    rootChildren.length === 1
      ? (rootChildren[0].cloneNode(true) as HTMLElement)
      : Object.assign(doc.createElement('section'), { innerHTML: bodyClone.innerHTML });
  if (rootChildren.length !== 1) root.setAttribute('data-htmlppt-synthetic-root', 'true');
  const inferred = inferDimensions(root, sharedCss, 'scroll');
  const slide: SlideModel = {
    id,
    name,
    components: '',
    css: sharedCss,
    canvasWidth: inferred.width,
    canvasHeight: inferred.height,
    presentationMode: 'scroll'
  };

  applyDocumentRootAttributes(root, slide);

  return {
    ...slide,
    components: root.outerHTML
  };
}

export function createBlankSlide(name = '新页面'): SlideModel {
  const id = uid();
  return {
    id,
    name,
    canvasWidth: DEFAULT_CANVAS_WIDTH,
    canvasHeight: DEFAULT_CANVAS_HEIGHT,
    presentationMode: 'fit',
    components: `<section class="deck-slide" data-slide-id="${id}" aria-label="${escapeAttr(name)}"></section>`,
    css: DEFAULT_SLIDE_CSS
  };
}

export function createDefaultProject(): ParsedProject {
  const coverId = uid();
  const metricsId = uid();
  const planId = uid();

  return {
    meta: {
      title: '未命名 HTML 演示材料',
      headExtras: '',
      bodyTemplates: '',
      bodyScripts: '',
      htmlAttributes: { lang: 'zh-CN' },
      documentMode: false
    },
    slides: [
      {
        id: coverId,
        name: '封面',
        canvasWidth: DEFAULT_CANVAS_WIDTH,
        canvasHeight: DEFAULT_CANVAS_HEIGHT,
        presentationMode: 'fit',
        components: `<section class="deck-slide" data-slide-id="${coverId}" aria-label="封面">
  <div class="cover-kicker">HTML DEMO MATERIAL</div>
  <h1 class="cover-title">像 PPT 一样编辑 HTML 演示页</h1>
  <p class="cover-subtitle">打开 AI 生成的 HTML，直接改文字、图片、布局和样式，然后一键进入演示模式。</p>
  <div class="cover-panel">
    <strong>16:9</strong>
    <span>默认演示比例，适合大屏汇报、会议室投屏和本地播放。</span>
  </div>
</section>`,
        css: DEFAULT_SLIDE_CSS
      },
      {
        id: metricsId,
        name: '核心指标',
        canvasWidth: DEFAULT_CANVAS_WIDTH,
        canvasHeight: DEFAULT_CANVAS_HEIGHT,
        presentationMode: 'fit',
        components: `<section class="deck-slide" data-slide-id="${metricsId}" aria-label="核心指标">
  <h2 class="slide-heading">第一版 MVP 目标</h2>
  <div class="metric-grid">
    <div class="metric-card"><b>P0</b><span>打开、编辑、拖拽、保存、演示。</span></div>
    <div class="metric-card"><b>P1</b><span>组件库、属性面板、图片替换、代码视图。</span></div>
    <div class="metric-card"><b>P2</b><span>模板、AI 文案、图表数据和主题能力。</span></div>
  </div>
</section>`,
        css: DEFAULT_SLIDE_CSS
      },
      {
        id: planId,
        name: '说明页',
        canvasWidth: DEFAULT_CANVAS_WIDTH,
        canvasHeight: DEFAULT_CANVAS_HEIGHT,
        presentationMode: 'fit',
        components: `<section class="deck-slide" data-slide-id="${planId}" aria-label="说明页">
  <h2 class="slide-heading">开始编辑</h2>
  <div class="two-col-text">
    <div class="text-block">左侧切换页面或拖入组件；中间画布就是最终演示效果。</div>
    <div class="text-block">右侧调整选中元素的宽高、位置、颜色、圆角、阴影和层级。</div>
  </div>
</section>`,
        css: DEFAULT_SLIDE_CSS
      }
    ]
  };
}

export function parseHtmlProject(
  rawHtml: string,
  sourceName?: string,
  filePath?: string,
  baseDir?: string,
  assetBaseUrl?: string
): ParsedProject {
  const imported = resolveImportedDocument(rawHtml);
  const doc = imported.document;
  removeRuntimeNodes(doc);

  const title =
    doc.title?.trim() || imported.fallbackTitle || sourceName?.replace(/\.(html|htm)$/i, '') || '导入的 HTML 演示材料';
  const sharedCss = collectStyles(doc);
  const candidates = getSlideCandidates(doc);
  const slides =
    candidates.length > 0
      ? candidates.map((candidate, index) => normalizeSlideNode(candidate, index, sharedCss))
      : [normalizeBodyAsSingleSlide(doc, sharedCss)];
  const documentMode = candidates.length === 0;

  return {
    meta: {
      title,
      filePath,
      baseDir,
      assetBaseUrl,
      sourceName,
      headExtras: collectHeadExtras(doc),
      bodyTemplates: collectBodyTemplates(doc),
      bodyScripts: collectScripts(doc),
      htmlAttributes: collectAttributes(doc.documentElement),
      bodyAttributes: collectAttributes(doc.body),
      documentMode
    },
    slides
  };
}

export function ensureDeckSlideMarkup(components: string, slide: SlideModel, index: number): string {
  const normalized = normalizeSlide(slide);
  const doc = new DOMParser().parseFromString(components, 'text/html');
  const existing = doc.querySelector('.deck-slide') as HTMLElement | null;

  if (existing) {
    removeRuntimeNodes(existing);
    applySlideAttributes(existing, normalized, index);
    return existing.outerHTML;
  }

  const wrapper = doc.createElement('section');
  wrapper.innerHTML = components;
  applySlideAttributes(wrapper, normalized, index);
  return wrapper.outerHTML;
}

function uniqueCss(cssItems: string[]): string {
  const seen = new Set<string>();
  return cssItems
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    })
    .join('\n\n');
}

function cleanDocumentStyle(style: string | null): string {
  const cleaned = (style || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !part.startsWith('--htmlppt-slide-width') && !part.startsWith('--htmlppt-slide-height'))
    .join('; ');
  return cleaned ? `${cleaned};` : '';
}

function cleanDocumentMarkup(components: string): string {
  const doc = new DOMParser().parseFromString(components, 'text/html');
  removeRuntimeNodes(doc);
  const root = (doc.querySelector('[data-htmlppt-document-root]') || doc.querySelector('.deck-slide') || doc.body.firstElementChild) as HTMLElement | null;
  if (!root) return doc.body.innerHTML;

  const isSyntheticRoot = root.getAttribute('data-htmlppt-synthetic-root') === 'true';
  root.classList.remove('deck-slide', 'is-active');
  root.removeAttribute('data-slide-id');
  root.removeAttribute('data-canvas-width');
  root.removeAttribute('data-canvas-height');
  root.removeAttribute('data-presentation-mode');
  root.removeAttribute('data-htmlppt-synthetic-root');
  root.removeAttribute('data-htmlppt-document-root');

  if (root.classList.length === 0) root.removeAttribute('class');

  const cleanedStyle = cleanDocumentStyle(root.getAttribute('style'));
  if (cleanedStyle) root.setAttribute('style', cleanedStyle);
  else root.removeAttribute('style');

  return isSyntheticRoot ? root.innerHTML : root.outerHTML;
}

function buildDocumentHtml(slides: SlideModel[], meta: ProjectMeta): string {
  const firstSlide = normalizeSlide(slides[0] ?? createBlankSlide('页面 1'));
  const body = cleanDocumentMarkup(firstSlide.components);
  const css = uniqueCss([firstSlide.css]);
  const htmlAttrs = serializeHtmlAttributes(meta.htmlAttributes);
  const bodyAttrs = serializeAttributes(meta.bodyAttributes);

  return `<!doctype html>
<html ${htmlAttrs}>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="HTML Demo Editor">
  <title>${escapeHtml(meta.title || 'HTML 文档')}</title>
  ${meta.headExtras || ''}
  <style>
${css}
  </style>
</head>
<body ${bodyAttrs}>
${body}
  ${meta.bodyTemplates || ''}
  ${meta.bodyScripts || ''}
</body>
</html>`;
}

function presenterRuntime(): string {
  return `<script data-htmlppt-runtime>
(() => {
  const deck = document.body;
  const slides = Array.from(document.querySelectorAll('body.htmlppt-deck > .deck-slide'));
  const counter = document.querySelector('[data-page-counter]');
  const blank = document.querySelector('[data-presenter-blank]');
  const scaleLabel = document.querySelector('[data-scale-label]');
  const pointerSelect = document.querySelector('[data-pointer-mode]');
  const laser = document.querySelector('[data-presenter-laser]');
  const ink = document.querySelector('[data-presenter-ink]');
  const inkContext = ink?.getContext?.('2d');
  let index = 0;
  let scaleMode = 'auto';
  let manualScale = 1;
  let pointerMode = 'auto';
  let idleTimer = 0;
  let controlsTimer = 0;
  let pendingJump = '';
  let drawing = false;

  function slideSize(slide) {
    return {
      width: Number(slide.dataset.canvasWidth) || ${DEFAULT_CANVAS_WIDTH},
      height: Number(slide.dataset.canvasHeight) || ${DEFAULT_CANVAS_HEIGHT}
    };
  }

  function currentMode() {
    return slides[index]?.dataset.presentationMode === 'scroll' ? 'scroll' : 'fit';
  }

  function scaleFor(slide) {
    const mode = currentMode();
    const size = slideSize(slide);
    if (scaleMode === 'actual') return 1;
    if (scaleMode === 'manual') return manualScale;
    if (scaleMode === 'width') return window.innerWidth / size.width;
    if (mode === 'scroll') return window.innerWidth / size.width;
    return Math.min(window.innerWidth / size.width, window.innerHeight / size.height);
  }

  function setDeckMode() {
    const mode = currentMode();
    deck.classList.remove('is-fit-mode', 'is-scroll-mode');
    deck.classList.add(mode === 'scroll' ? 'is-scroll-mode' : 'is-fit-mode');
    deck.style.overflow = mode === 'scroll' ? 'auto' : 'hidden';
    deck.style.height = mode === 'scroll' ? 'auto' : '100%';
  }

  function resize() {
    const slide = slides[index];
    if (!slide) return;
    const mode = currentMode();
    const scale = Math.max(0.1, Math.min(4, scaleFor(slide)));
    document.documentElement.style.setProperty('--deck-scale', String(scale));
    if (scaleLabel) scaleLabel.textContent = String(Math.round(scale * 100)) + '%';
    if (mode === 'scroll') {
      const extra = Math.max(0, slide.scrollHeight * (scale - 1));
      slide.style.marginBottom = extra ? String(extra) + 'px' : '';
    } else {
      slide.style.marginBottom = '';
    }
  }

  function show(nextIndex) {
    if (!slides.length) return;
    index = Math.max(0, Math.min(slides.length - 1, nextIndex));
    setDeckMode();
    slides.forEach((slide, slideIndex) => slide.classList.toggle('is-active', slideIndex === index));
    if (counter) counter.textContent = String(index + 1) + ' / ' + String(slides.length);
    location.hash = '#/' + String(index + 1);
    window.scrollTo(0, 0);
    resize();
  }

  function setScaleMode(nextMode) {
    scaleMode = nextMode;
    resize();
  }

  function stepScale(delta) {
    const slide = slides[index];
    manualScale = Math.max(0.1, Math.min(4, scaleFor(slide) + delta));
    setScaleMode('manual');
  }

  function clearBlank() {
    blank?.classList.remove('is-black', 'is-white');
  }

  function toggleBlank(kind) {
    if (!blank) return;
    const className = kind === 'white' ? 'is-white' : 'is-black';
    const wasActive = blank.classList.contains(className);
    clearBlank();
    if (!wasActive) blank.classList.add(className);
  }

  function showControls() {
    deck.classList.add('htmlppt-controls-active');
    window.clearTimeout(controlsTimer);
    controlsTimer = window.setTimeout(() => {
      deck.classList.remove('htmlppt-controls-active');
    }, 2000);
  }

  function resizeInk() {
    if (!ink || !inkContext) return;
    const ratio = window.devicePixelRatio || 1;
    ink.width = Math.floor(window.innerWidth * ratio);
    ink.height = Math.floor(window.innerHeight * ratio);
    ink.style.width = window.innerWidth + 'px';
    ink.style.height = window.innerHeight + 'px';
    inkContext.setTransform(ratio, 0, 0, ratio, 0, 0);
    inkContext.lineWidth = 3;
    inkContext.lineCap = 'round';
    inkContext.lineJoin = 'round';
    inkContext.strokeStyle = '#ef4444';
  }

  function setPointerMode(mode) {
    pointerMode = mode;
    deck.classList.remove(
      'htmlppt-pointer-auto',
      'htmlppt-pointer-hidden',
      'htmlppt-pointer-laser',
      'htmlppt-pointer-pen',
      'htmlppt-pointer-idle'
    );
    deck.classList.add('htmlppt-pointer-' + pointerMode);
    if (laser) laser.style.display = pointerMode === 'laser' ? 'block' : '';
    if (pointerSelect) pointerSelect.value = pointerMode;
  }

  function markPointerActive() {
    if (pointerMode !== 'auto') return;
    deck.classList.remove('htmlppt-pointer-idle');
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => deck.classList.add('htmlppt-pointer-idle'), 1800);
  }

  document.querySelector('[data-prev-slide]')?.addEventListener('click', () => show(index - 1));
  document.querySelector('[data-next-slide]')?.addEventListener('click', () => show(index + 1));
  document.querySelector('[data-exit-presentation]')?.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    window.close();
  });
  document.querySelector('[data-scale-out]')?.addEventListener('click', () => stepScale(-0.1));
  document.querySelector('[data-scale-in]')?.addEventListener('click', () => stepScale(0.1));
  document.querySelector('[data-scale-fit]')?.addEventListener('click', () => setScaleMode('auto'));
  document.querySelector('[data-scale-width]')?.addEventListener('click', () => setScaleMode('width'));
  document.querySelector('[data-scale-actual]')?.addEventListener('click', () => setScaleMode('actual'));
  document.querySelector('[data-clear-ink]')?.addEventListener('click', () => inkContext?.clearRect(0, 0, ink?.width || 0, ink?.height || 0));
  pointerSelect?.addEventListener('change', (event) => setPointerMode(event.target.value));

  window.addEventListener('resize', () => {
    resize();
    resizeInk();
  });
  window.addEventListener('pointermove', (event) => {
    showControls();
    markPointerActive();
    if (laser) laser.style.transform = 'translate(' + event.clientX + 'px,' + event.clientY + 'px)';
    if (pointerMode === 'pen' && drawing && inkContext) {
      inkContext.lineTo(event.clientX, event.clientY);
      inkContext.stroke();
    }
  });
  window.addEventListener('pointerdown', (event) => {
    if (pointerMode !== 'pen' || !inkContext) return;
    drawing = true;
    inkContext.beginPath();
    inkContext.moveTo(event.clientX, event.clientY);
  });
  window.addEventListener('pointerup', () => {
    drawing = false;
  });
  window.addEventListener('click', (event) => {
    const target = event.target;
    if (target?.closest?.('.presenter-hud, a, button, input, select, textarea, [contenteditable="true"]')) return;
    if (pointerMode === 'pen') return;
    event.preventDefault();
    clearBlank();
    show(index + 1);
  });
  window.addEventListener('contextmenu', (event) => {
    const target = event.target;
    if (target?.closest?.('.presenter-hud, input, select, textarea')) return;
    event.preventDefault();
    clearBlank();
    show(index - 1);
  });
  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    const mode = currentMode();
    showControls();
    if (/^\\d$/.test(key)) {
      pendingJump = (pendingJump + key).slice(0, 4);
      event.preventDefault();
      return;
    }
    if (key === 'enter' && pendingJump) {
      event.preventDefault();
      show(Number(pendingJump) - 1);
      pendingJump = '';
      return;
    }
    if (key !== 'enter') pendingJump = '';
    if (mode === 'scroll' && ['arrowdown', 'pagedown', ' '].includes(key)) {
      event.preventDefault();
      clearBlank();
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (atBottom) show(index + 1);
      else window.scrollBy({ top: Math.max(240, window.innerHeight * 0.82), behavior: 'smooth' });
      return;
    }
    if (mode === 'scroll' && ['arrowup', 'pageup'].includes(key)) {
      event.preventDefault();
      clearBlank();
      if (window.scrollY <= 4) show(index - 1);
      else window.scrollBy({ top: -Math.max(240, window.innerHeight * 0.82), behavior: 'smooth' });
      return;
    }
    if (['arrowright', 'pagedown', ' '].includes(key)) {
      event.preventDefault();
      clearBlank();
      show(index + 1);
    }
    if (['arrowleft', 'pageup'].includes(key)) {
      event.preventDefault();
      clearBlank();
      show(index - 1);
    }
    if (key === 'backspace') {
      event.preventDefault();
      clearBlank();
      show(index - 1);
    }
    if (key === 'home') show(0);
    if (key === 'end') show(slides.length - 1);
    if (key === 'b' || key === '.') toggleBlank('black');
    if (key === 'w' || key === ',') toggleBlank('white');
    if ((event.metaKey || event.ctrlKey) && key === '=') stepScale(0.1);
    if ((event.metaKey || event.ctrlKey) && key === '-') stepScale(-0.1);
    if ((event.metaKey || event.ctrlKey) && key === '0') setScaleMode('actual');
    if (key === 'escape') {
      if (document.fullscreenElement) document.exitFullscreen();
      else window.close();
    }
  });

  const hashMatch = location.hash.match(/#\\/(\\d+)/);
  resizeInk();
  setPointerMode('auto');
  markPointerActive();
  showControls();
  show(hashMatch ? Number(hashMatch[1]) - 1 : 0);
})();
</script>`;
}

export function buildExportHtml(slides: SlideModel[], meta: ProjectMeta): string {
  if (meta.documentMode) return buildDocumentHtml(slides, meta);

  const normalizedSlides = slides.map(normalizeSlide);
  const body = normalizedSlides.map((slide, index) => ensureDeckSlideMarkup(slide.components, slide, index)).join('\n');
  const css = uniqueCss([EXPORT_BASE_CSS, ...normalizedSlides.map((slide) => slide.css)]);
  const htmlAttrs = serializeHtmlAttributes(meta.htmlAttributes);
  const bodyAttrs = serializeAttributes(meta.bodyAttributes, 'htmlppt-deck is-fit-mode');

  return `<!doctype html>
<html ${htmlAttrs}>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="HTML Demo Editor">
  <title>${escapeHtml(meta.title || 'HTML 演示材料')}</title>
  ${meta.headExtras || ''}
  <style data-htmlppt-runtime>
${css}
  </style>
</head>
<body ${bodyAttrs} aria-label="${escapeAttr(meta.title || 'HTML 演示材料')}">
${body}
  <div class="presenter-blank" data-presenter-blank></div>
  <div class="presenter-hud" data-htmlppt-runtime>
    <button type="button" data-prev-slide aria-label="上一页">‹</button>
    <span data-page-counter>1 / ${normalizedSlides.length}</span>
    <button type="button" data-next-slide aria-label="下一页">›</button>
    <button type="button" data-scale-out aria-label="缩小">-</button>
    <span class="presenter-scale-label" data-scale-label>100%</span>
    <button type="button" data-scale-in aria-label="放大">+</button>
    <button type="button" data-scale-width aria-label="适配宽度">宽</button>
    <button type="button" data-scale-fit aria-label="适配整屏">全</button>
    <button type="button" data-scale-actual aria-label="原始比例">100%</button>
    <select data-pointer-mode aria-label="指针">
      <option value="auto">自动</option>
      <option value="arrow">箭头</option>
      <option value="hidden">隐藏</option>
      <option value="laser">激光</option>
      <option value="pen">画笔</option>
    </select>
    <button type="button" data-clear-ink aria-label="清除笔迹">清除</button>
    <button type="button" data-exit-presentation aria-label="退出演示">退出</button>
  </div>
  <div class="presenter-laser-dot" data-presenter-laser data-htmlppt-runtime></div>
  <canvas class="presenter-ink-canvas" data-presenter-ink data-htmlppt-runtime></canvas>
  ${meta.bodyTemplates || ''}
  ${meta.bodyScripts || ''}
  ${presenterRuntime()}
</body>
</html>`;
}

export function buildSlidePreviewDoc(slide: SlideModel, meta?: ProjectMeta): string {
  const normalized = normalizeSlide(slide);
  const width = getSlideCanvasWidth(normalized);
  const height = getSlideCanvasHeight(normalized);
  const bodyAttrs = serializeAttributes(meta?.bodyAttributes);
  const htmlAttrs = serializeHtmlAttributes(meta?.htmlAttributes);
  const baseHref = meta?.assetBaseUrl || baseDirToFileHref(meta?.baseDir);
  const documentMode = meta?.documentMode === true;
  const markup = documentMode ? normalized.components : ensureDeckSlideMarkup(normalized.components, normalized, 0);
  const helperCss = documentMode
    ? ''
    : `${CANVAS_BASE_CSS}
    html, body { width: ${width}px; height: ${height}px; overflow: hidden; background: #ffffff; }
    .deck-slide { margin: 0; }`;

  return `<!doctype html>
<html ${htmlAttrs}>
<head>
  <meta charset="UTF-8">
  ${baseHref ? `<base href="${escapeAttr(baseHref)}">` : ''}
  ${meta?.headExtras || ''}
  <style>
    ${normalized.css}
    ${helperCss}
  </style>
</head>
<body ${bodyAttrs}>${markup}</body>
</html>`;
}

function addAssetPath(paths: Set<string>, value: string | null | undefined): void {
  if (!value) return;
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('#')) return;
  if (/^(https?:|data:|blob:|mailto:|tel:|javascript:)/i.test(trimmed)) return;
  const withoutHash = trimmed.split('#')[0];
  const withoutQuery = withoutHash.split('?')[0];
  if (!withoutQuery || withoutQuery.startsWith('#')) return;
  paths.add(withoutQuery);
}

function collectCssAssetPaths(paths: Set<string>, css: string): void {
  const urlRegex = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
  let match: RegExpExecArray | null;
  while ((match = urlRegex.exec(css))) {
    addAssetPath(paths, match[2]);
  }
}

export function collectReferencedAssetPaths(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const paths = new Set<string>();

  doc.querySelectorAll('[src], [href], [poster]').forEach((element) => {
    addAssetPath(paths, element.getAttribute('src'));
    addAssetPath(paths, element.getAttribute('href'));
    addAssetPath(paths, element.getAttribute('poster'));
  });

  doc.querySelectorAll('[srcset]').forEach((element) => {
    const srcset = element.getAttribute('srcset') || '';
    srcset.split(',').forEach((candidate) => addAssetPath(paths, candidate.trim().split(/\s+/)[0]));
  });

  doc.querySelectorAll('style').forEach((style) => collectCssAssetPaths(paths, style.textContent || ''));
  doc.querySelectorAll('[style]').forEach((element) => collectCssAssetPaths(paths, element.getAttribute('style') || ''));

  return Array.from(paths);
}

export function formatLooseHtml(input: string): string {
  return input
    .replace(/>\s+</g, '>\n<')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}
