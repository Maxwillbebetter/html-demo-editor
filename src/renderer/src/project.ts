export interface SlideModel {
  id: string;
  name: string;
  components: string;
  css: string;
}

export interface ProjectMeta {
  title: string;
  filePath?: string;
  baseDir?: string;
  sourceName?: string;
  headExtras: string;
  bodyScripts: string;
}

export interface ParsedProject {
  meta: ProjectMeta;
  slides: SlideModel[];
}

export const CANVAS_BASE_CSS = `
body {
  margin: 0;
  background: #e7ebef;
  color: #1c2430;
  font-family: Inter, "Segoe UI", Arial, sans-serif;
}
.deck-slide {
  box-sizing: border-box;
  width: 1280px;
  height: 720px;
  min-height: 720px;
  position: relative;
  overflow: hidden;
  margin: 0 auto;
  background: #ffffff;
  color: #1c2430;
}
.deck-slide * {
  box-sizing: border-box;
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
  overflow: hidden;
  background: #111111;
}
.htmlppt-deck {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: #111111;
}
.htmlppt-deck .deck-slide {
  box-sizing: border-box;
  width: 1280px;
  height: 720px;
  min-height: 720px;
  position: absolute;
  left: 50%;
  top: 50%;
  margin: 0;
  overflow: hidden;
  transform: translate(-50%, -50%) scale(var(--deck-scale));
  transform-origin: center center;
  background: #ffffff;
  opacity: 0;
  pointer-events: none;
  visibility: hidden;
}
.htmlppt-deck .deck-slide.is-active {
  opacity: 1;
  pointer-events: auto;
  visibility: visible;
}
.htmlppt-deck .deck-slide * {
  box-sizing: border-box;
}
.presenter-hud {
  position: fixed;
  left: 50%;
  bottom: 18px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 8px;
  background: rgba(15, 18, 24, 0.72);
  color: #ffffff;
  font: 13px/1.2 "Segoe UI", Arial, sans-serif;
  opacity: 0;
  transition: opacity 160ms ease;
  z-index: 1000;
}
.presenter-hud:hover,
.presenter-hud:focus-within {
  opacity: 1;
}
.presenter-hud button {
  width: 30px;
  height: 28px;
  border: 0;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
  cursor: pointer;
}
.presenter-hud button:hover {
  background: rgba(255, 255, 255, 0.22);
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
`;

const DEFAULT_SLIDE_CSS = `
.cover-kicker {
  position: absolute;
  left: 72px;
  top: 68px;
  padding: 8px 12px;
  border-radius: 6px;
  background: #e8f4f2;
  color: #187365;
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
  color: #0f766e;
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
  border-left: 6px solid #d9852b;
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

function removeRuntimeNodes(root: ParentNode): void {
  root.querySelectorAll('[data-htmlppt-runtime], .presenter-hud, .presenter-blank').forEach((node) => node.remove());
}

function removeScripts(root: ParentNode): void {
  root.querySelectorAll('script').forEach((node) => node.remove());
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

  const bodySections = Array.from(doc.body.children).filter((node) => node.tagName.toLowerCase() === 'section');
  return bodySections.length > 1 ? bodySections : [];
}

function normalizeSlideNode(node: Element, index: number, sharedCss: string): SlideModel {
  const clone = node.cloneNode(true) as HTMLElement;
  removeRuntimeNodes(clone);
  removeScripts(clone);
  clone.classList.remove('is-active');
  clone.classList.add('deck-slide');

  const id = clone.getAttribute('data-slide-id') || uid();
  const name =
    clone.getAttribute('aria-label') ||
    clone.querySelector('h1,h2,h3')?.textContent?.trim() ||
    `页面 ${index + 1}`;

  clone.setAttribute('data-slide-id', id);
  clone.setAttribute('aria-label', name);

  return {
    id,
    name,
    components: clone.outerHTML,
    css: sharedCss
  };
}

function normalizeBodyAsSingleSlide(doc: Document, sharedCss: string): SlideModel {
  const bodyClone = doc.body.cloneNode(true) as HTMLElement;
  removeRuntimeNodes(bodyClone);
  removeScripts(bodyClone);

  const id = uid();
  const name = doc.querySelector('h1,h2,h3')?.textContent?.trim() || '页面 1';
  return {
    id,
    name,
    components: `<section class="deck-slide" data-slide-id="${id}" aria-label="${escapeAttr(name)}">${bodyClone.innerHTML}</section>`,
    css: sharedCss
  };
}

export function createBlankSlide(name = '新页面'): SlideModel {
  const id = uid();
  return {
    id,
    name,
    components: `<section class="deck-slide" data-slide-id="${id}" aria-label="${escapeAttr(name)}">
  <h1 class="slide-heading">${escapeHtml(name)}</h1>
  <div class="two-col-text">
    <div class="text-block">双击这里编辑正文内容。可以拖动模块、调整尺寸，并在右侧修改样式。</div>
    <div class="text-block">从左侧组件库拖入标题、图片、指标卡、表格或时间线。</div>
  </div>
</section>`,
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
      bodyScripts: ''
    },
    slides: [
      {
        id: coverId,
        name: '封面',
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

export function parseHtmlProject(rawHtml: string, sourceName?: string, filePath?: string, baseDir?: string): ParsedProject {
  const doc = new DOMParser().parseFromString(rawHtml, 'text/html');
  removeRuntimeNodes(doc);

  const title = doc.title?.trim() || sourceName?.replace(/\.(html|htm)$/i, '') || '导入的 HTML 演示材料';
  const sharedCss = `${CANVAS_BASE_CSS}\n${collectStyles(doc)}`;
  const candidates = getSlideCandidates(doc);
  const slides =
    candidates.length > 0
      ? candidates.map((candidate, index) => normalizeSlideNode(candidate, index, sharedCss))
      : [normalizeBodyAsSingleSlide(doc, sharedCss)];

  return {
    meta: {
      title,
      filePath,
      baseDir,
      sourceName,
      headExtras: collectHeadExtras(doc),
      bodyScripts: collectScripts(doc)
    },
    slides
  };
}

export function ensureDeckSlideMarkup(components: string, slide: SlideModel, index: number): string {
  const doc = new DOMParser().parseFromString(components, 'text/html');
  const existing = doc.querySelector('.deck-slide') as HTMLElement | null;

  if (existing) {
    removeRuntimeNodes(existing);
    existing.classList.remove('is-active');
    existing.classList.add('deck-slide');
    existing.setAttribute('data-slide-id', slide.id);
    existing.setAttribute('aria-label', slide.name || `页面 ${index + 1}`);
    return existing.outerHTML;
  }

  return `<section class="deck-slide" data-slide-id="${escapeAttr(slide.id)}" aria-label="${escapeAttr(
    slide.name || `页面 ${index + 1}`
  )}">${components}</section>`;
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

function presenterRuntime(): string {
  return `<script data-htmlppt-runtime>
(() => {
  const slides = Array.from(document.querySelectorAll('.htmlppt-deck .deck-slide'));
  const counter = document.querySelector('[data-page-counter]');
  const blank = document.querySelector('[data-presenter-blank]');
  let index = 0;

  function resize() {
    const scale = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
    document.documentElement.style.setProperty('--deck-scale', String(scale));
  }

  function show(nextIndex) {
    if (!slides.length) return;
    index = Math.max(0, Math.min(slides.length - 1, nextIndex));
    slides.forEach((slide, slideIndex) => slide.classList.toggle('is-active', slideIndex === index));
    if (counter) counter.textContent = String(index + 1) + ' / ' + String(slides.length);
    location.hash = '#/' + String(index + 1);
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

  document.querySelector('[data-prev-slide]')?.addEventListener('click', () => show(index - 1));
  document.querySelector('[data-next-slide]')?.addEventListener('click', () => show(index + 1));
  window.addEventListener('resize', resize);
  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
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
    if (key === 'home') show(0);
    if (key === 'end') show(slides.length - 1);
    if (key === 'b' || key === '.') toggleBlank('black');
    if (key === 'w' || key === ',') toggleBlank('white');
    if (key === 'escape') {
      if (document.fullscreenElement) document.exitFullscreen();
      else window.close();
    }
  });

  const hashMatch = location.hash.match(/#\\/(\\d+)/);
  resize();
  show(hashMatch ? Number(hashMatch[1]) - 1 : 0);
})();
</script>`;
}

export function buildExportHtml(slides: SlideModel[], meta: ProjectMeta): string {
  const body = slides.map((slide, index) => ensureDeckSlideMarkup(slide.components, slide, index)).join('\n');
  const css = uniqueCss([EXPORT_BASE_CSS, ...slides.map((slide) => slide.css)]);

  return `<!doctype html>
<html lang="zh-CN">
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
<body>
  <main class="htmlppt-deck" aria-label="${escapeAttr(meta.title || 'HTML 演示材料')}">
${body}
  </main>
  <div class="presenter-blank" data-presenter-blank></div>
  <div class="presenter-hud" data-htmlppt-runtime>
    <button type="button" data-prev-slide aria-label="上一页">‹</button>
    <span data-page-counter>1 / ${slides.length}</span>
    <button type="button" data-next-slide aria-label="下一页">›</button>
  </div>
  ${meta.bodyScripts || ''}
  ${presenterRuntime()}
</body>
</html>`;
}

export function buildSlidePreviewDoc(slide: SlideModel): string {
  const markup = ensureDeckSlideMarkup(slide.components, slide, 0);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <style>
    ${CANVAS_BASE_CSS}
    ${slide.css}
    html, body { width: 1280px; height: 720px; overflow: hidden; background: #ffffff; }
    .deck-slide { margin: 0; }
  </style>
</head>
<body>${markup}</body>
</html>`;
}

export function formatLooseHtml(input: string): string {
  return input
    .replace(/>\s+</g, '>\n<')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}
