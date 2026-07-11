import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import grapesjs, { type Component, type Editor, type ResizerOptions } from 'grapesjs';
import basicBlocks from 'grapesjs-blocks-basic';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceBetween,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceBetween,
  Bold,
  BringToFront,
  Code2,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileCode2,
  FileClock,
  FilePlus2,
  FolderOpen,
  FolderTree,
  Group,
  Hand,
  Image,
  Italic,
  Layers2,
  Maximize2,
  MousePointer2,
  PaintBucket,
  PanelLeft,
  PanelRight,
  Palette,
  Play,
  Plus,
  Presentation,
  Redo2,
  Save,
  SaveAll,
  SendToBack,
  Trash2,
  Type,
  Undo2,
  Ungroup,
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
import type { AutoSaveRecord, OpenProjectResult } from './types';

const CURRENT_DEVICE_ID = 'current-page';
const ELEMENT_RESIZER_OPTIONS: ResizerOptions = {
  tl: true,
  tc: true,
  tr: true,
  cl: true,
  cr: true,
  bl: true,
  bc: true,
  br: true,
  minDim: 8,
  step: 1,
  currentUnit: true,
  updateOnMove: true,
  keepAutoHeight: true,
  keepAutoWidth: true
};
const TEXT_COLOR_SWATCHES = ['#1d1d1f', '#515154', '#ffffff', '#007aff', '#34c759', '#5e5ce6', '#ff9f0a', '#ff3b30'];
const FILL_COLOR_SWATCHES = ['#ffffff', '#f5f5f7', '#eaf3ff', '#fff4e5', '#edf7ee', '#f2eeff', '#1d1d1f', '#007aff'];
const FONT_OPTIONS = [
  { label: 'Segoe UI', value: '"Segoe UI", Arial, sans-serif' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: '微软雅黑', value: '"Microsoft YaHei", "Segoe UI", sans-serif' },
  { label: '宋体', value: 'SimSun, serif' },
  { label: '等宽', value: '"Cascadia Code", Consolas, monospace' }
];
const SNAP_THRESHOLD = 6;
const RECENT_FILE_LIMIT = 8;

type LeftTab = 'slides' | 'blocks';
type RightTab = 'style' | 'layers' | 'page';
type CanvasFitMode = 'fit' | 'width';
type CanvasInteractionMode = 'edit' | 'interact';
type AlignAction = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
type DistributeAction = 'horizontal' | 'vertical';
type GuideMatch = { diff: number; target: keyof BoxMetrics; value: number };

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
  summary: SelectedSummary;
}

interface ComponentSelectionItem {
  key: string;
  label: string;
}

interface LayerItem {
  key: string;
  label: string;
  tag: string;
  depth: number;
  hidden: boolean;
  group: boolean;
}

interface RecentFile {
  filePath: string;
  name: string;
  baseDir: string;
  openedAt: string;
}

interface BoxMetrics {
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
  centerX: number;
  centerY: number;
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

function applyEditorCanvasZoom(editor: Editor | null, value: number): number {
  const next = Math.max(10, Math.min(220, Math.round(value)));
  if (!editor) return next;

  const canvas = editor.Canvas;
  const current = canvas.getZoom();
  if (Number.isFinite(current) && Math.abs(current - next) < 0.001) {
    canvas.setZoom(next + 0.01);
  }
  canvas.setZoom(next);
  return next;
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

function pickStyleValue(inlineValue: unknown, computedValue: string, fallback = ''): string | undefined {
  const value = stringStyleValue(inlineValue);
  if (value && value !== 'auto') return value;
  if (computedValue && computedValue !== 'auto' && computedValue !== 'normal') return computedValue;
  return fallback || undefined;
}

function summarizeComponent(component: Component): SelectedSummary {
  const attrs = component.getAttributes();
  const style = component.getStyle();
  const element = component.getEl?.() as HTMLElement | undefined;
  const win = element?.ownerDocument.defaultView;
  const computed = element && win ? win.getComputedStyle(element) : null;
  const rect = element?.getBoundingClientRect();
  const parentRect = element?.offsetParent instanceof HTMLElement ? element.offsetParent.getBoundingClientRect() : null;
  const tagName = String(component.get('tagName') || component.getName() || 'element').toLowerCase();
  const classes = component.getClasses().join(' ');
  const left = pickStyleValue(
    style.left,
    computed?.left || '',
    rect && parentRect ? `${Math.round(rect.left - parentRect.left)}px` : ''
  );
  const top = pickStyleValue(
    style.top,
    computed?.top || '',
    rect && parentRect ? `${Math.round(rect.top - parentRect.top)}px` : ''
  );

  return {
    label: tagName,
    id: attrs.id,
    classes,
    width: pickStyleValue(style.width, computed?.width || '', rect ? `${Math.round(rect.width)}px` : ''),
    height: pickStyleValue(style.height, computed?.height || '', rect ? `${Math.round(rect.height)}px` : ''),
    left,
    top,
    zIndex: pickStyleValue(style['z-index'], computed?.zIndex || ''),
    fontFamily: pickStyleValue(style['font-family'], computed?.fontFamily || ''),
    fontSize: pickStyleValue(style['font-size'], computed?.fontSize || ''),
    fontWeight: pickStyleValue(style['font-weight'], computed?.fontWeight || ''),
    fontStyle: pickStyleValue(style['font-style'], computed?.fontStyle || ''),
    color: pickStyleValue(style.color, computed?.color || ''),
    backgroundColor: pickStyleValue(style['background-color'], computed?.backgroundColor || ''),
    textDecoration: pickStyleValue(style['text-decoration'], computed?.textDecorationLine || computed?.textDecoration || ''),
    borderRadius: pickStyleValue(style['border-radius'], computed?.borderRadius || ''),
    opacity: pickStyleValue(style.opacity, computed?.opacity || ''),
    isImage: tagName === 'img' || component.is('image')
  };
}

function summarizeSelected(editor: Editor): SelectedSummary | null {
  const selected = editor.getSelected();
  return selected ? summarizeComponent(selected) : null;
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

function componentKey(component: Component): string {
  const model = component as Component & { ccid?: string; cid?: string };
  return model.ccid || model.cid || component.getId() || component.getName();
}

function componentContains(parent: Component | null | undefined, child: Component | null | undefined): boolean {
  if (!parent || !child || parent === child) return false;
  try {
    return parent.contains(child);
  } catch {
    return false;
  }
}

function isRootLikeComponent(component: Component | null | undefined): boolean {
  if (!component) return true;
  if (typeof component.get !== 'function') return true;
  const tagName = String(component.get('tagName') || component.getName() || '').toLowerCase();
  const element = component.getEl?.();
  return component.get('type') === 'wrapper' || tagName === 'body' || element?.classList?.contains('deck-slide') === true;
}

function componentDisplayName(component: Component): string {
  const attrs = component.getAttributes();
  const tagName = String(component.get('tagName') || component.getName() || 'element').toLowerCase();
  const explicitName = String(component.getName?.({ noCustom: false }) || '').trim();
  const aria = typeof attrs['aria-label'] === 'string' ? attrs['aria-label'].trim() : '';
  const text = component
    .getEl?.()
    ?.textContent?.replace(/\s+/g, ' ')
    .trim()
    .slice(0, 26);
  if (aria && aria !== tagName) return aria;
  if (explicitName && explicitName !== tagName && !/^div$/i.test(explicitName)) return explicitName;
  if (text) return text;
  if (attrs.id) return `#${attrs.id}`;
  const classes = component.getClasses().slice(0, 2).join('.');
  return classes ? `${tagName}.${classes}` : tagName;
}

function getCanvasRootElement(editor: Editor): HTMLElement | null {
  const doc = editor.Canvas.getDocument();
  return (
    (doc?.querySelector('.deck-slide') as HTMLElement | null) ||
    (doc?.querySelector('[data-htmlppt-document-root]') as HTMLElement | null) ||
    doc?.body ||
    null
  );
}

function getComponentBox(component: Component, rootEl: HTMLElement): BoxMetrics | null {
  const element = component.getEl?.();
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  const rootRect = rootEl.getBoundingClientRect();
  const left = rect.left - rootRect.left;
  const top = rect.top - rootRect.top;
  const width = rect.width;
  const height = rect.height;
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    centerX: left + width / 2,
    centerY: top + height / 2
  };
}

function selectionBounds(boxes: BoxMetrics[]): BoxMetrics | null {
  if (!boxes.length) return null;
  const left = Math.min(...boxes.map((box) => box.left));
  const top = Math.min(...boxes.map((box) => box.top));
  const right = Math.max(...boxes.map((box) => box.right));
  const bottom = Math.max(...boxes.map((box) => box.bottom));
  const width = right - left;
  const height = bottom - top;
  return {
    left,
    top,
    width,
    height,
    right,
    bottom,
    centerX: left + width / 2,
    centerY: top + height / 2
  };
}

function setComponentSlidePosition(component: Component, rootEl: HTMLElement, left: number, top: number): void {
  const element = component.getEl?.();
  const win = element?.ownerDocument.defaultView;
  if (!element || !win) return;

  const computed = win.getComputedStyle(element);
  const offsetParent = element.offsetParent instanceof HTMLElement ? element.offsetParent : rootEl;
  const parentRect = offsetParent.getBoundingClientRect();
  const rootRect = rootEl.getBoundingClientRect();
  const nextLeft = left + rootRect.left - parentRect.left;
  const nextTop = top + rootRect.top - parentRect.top;

  component.addStyle({
    position: computed.position === 'static' ? 'absolute' : computed.position || 'absolute',
    left: `${Math.round(nextLeft)}px`,
    top: `${Math.round(nextTop)}px`
  });
}

function getActionableSelection(editor: Editor): Component[] {
  const selected = editor.getSelectedAll?.() ?? [];
  const fallback = editor.getSelected();
  const candidates = selected.length ? selected : fallback ? [fallback] : [];
  const unique = new Map<string, Component>();
  candidates.forEach((component) => {
    if (!component) return;
    if (isRootLikeComponent(component)) return;
    unique.set(componentKey(component), component);
  });

  const components = Array.from(unique.values());
  return components.filter((component) => !components.some((other) => componentContains(other, component)));
}

function normalizeComponentSelection(components: Component[]): Component[] {
  const unique = new Map<string, Component>();
  components.forEach((component) => {
    if (!component || isRootLikeComponent(component) || !component.getEl?.()?.isConnected) return;
    unique.set(componentKey(component), component);
  });
  const selected = Array.from(unique.values());
  return selected.filter((component) => !selected.some((other) => componentContains(other, component)));
}

function selectComponents(editor: Editor, components: Component[]): Component[] {
  const actionable = components.filter((component) => !isRootLikeComponent(component));
  if (!actionable.length) {
    editor.select();
    return [];
  }
  editor.select(actionable[0]);
  actionable.slice(1).forEach((component) => editor.selectAdd(component));
  return actionable;
}

function nudgeComponents(editor: Editor, components: Component[], dx: number, dy: number): boolean {
  const rootEl = getCanvasRootElement(editor);
  if (!rootEl || !components.length) return false;
  components.forEach((component) => {
    const box = getComponentBox(component, rootEl);
    if (box) setComponentSlidePosition(component, rootEl, box.left + dx, box.top + dy);
  });
  return true;
}

function clearSmartGuides(editor: Editor): void {
  editor.Canvas.getDocument()?.querySelectorAll('[data-html-demo-guide], [data-html-demo-marquee]').forEach((node) => node.remove());
}

function drawSmartGuides(editor: Editor, guides: Array<{ axis: 'x' | 'y'; value: number }>): void {
  const doc = editor.Canvas.getDocument();
  const rootEl = getCanvasRootElement(editor);
  if (!doc || !rootEl) return;
  doc.querySelectorAll('[data-html-demo-guide]').forEach((node) => node.remove());
  const rootRect = rootEl.getBoundingClientRect();

  guides.forEach((guide) => {
    const line = doc.createElement('div');
    line.setAttribute('data-html-demo-guide', guide.axis);
    Object.assign(line.style, {
      position: 'absolute',
      pointerEvents: 'none',
      zIndex: '2147483646',
      background: '#007aff',
      boxShadow: '0 0 0 1px rgba(0,122,255,0.16)'
    });
    if (guide.axis === 'x') {
      line.style.left = `${Math.round(rootRect.left + guide.value)}px`;
      line.style.top = `${Math.round(rootRect.top)}px`;
      line.style.width = '1px';
      line.style.height = `${Math.round(rootRect.height)}px`;
    } else {
      line.style.left = `${Math.round(rootRect.left)}px`;
      line.style.top = `${Math.round(rootRect.top + guide.value)}px`;
      line.style.width = `${Math.round(rootRect.width)}px`;
      line.style.height = '1px';
    }
    doc.body.appendChild(line);
  });
}

function updateSmartGuides(editor: Editor, component?: Component, snap = false, gridSnap = false): void {
  const target = component || editor.getSelected();
  const rootEl = getCanvasRootElement(editor);
  if (!target || !rootEl || isRootLikeComponent(target)) return;

  const targetBox = getComponentBox(target, rootEl);
  if (!targetBox) return;
  const siblings = target
    .parent()
    ?.components()
    .filter((item: Component) => item !== target && !isRootLikeComponent(item)) as Component[] | undefined;
  const rootBox: BoxMetrics = {
    left: 0,
    top: 0,
    width: rootEl.getBoundingClientRect().width,
    height: rootEl.getBoundingClientRect().height,
    right: rootEl.getBoundingClientRect().width,
    bottom: rootEl.getBoundingClientRect().height,
    centerX: rootEl.getBoundingClientRect().width / 2,
    centerY: rootEl.getBoundingClientRect().height / 2
  };
  const referenceBoxes = [rootBox, ...(siblings || []).map((item) => getComponentBox(item, rootEl)).filter(Boolean) as BoxMetrics[]];
  let bestX: GuideMatch | null = null;
  let bestY: GuideMatch | null = null;

  referenceBoxes.forEach((box) => {
    (['left', 'centerX', 'right'] as const).forEach((edge) => {
      (['left', 'centerX', 'right'] as const).forEach((targetEdge) => {
        const diff = box[edge] - targetBox[targetEdge];
        if (Math.abs(diff) <= SNAP_THRESHOLD && (!bestX || Math.abs(diff) < Math.abs(bestX.diff))) {
          bestX = { diff, target: targetEdge, value: box[edge] };
        }
      });
    });
    (['top', 'centerY', 'bottom'] as const).forEach((edge) => {
      (['top', 'centerY', 'bottom'] as const).forEach((targetEdge) => {
        const diff = box[edge] - targetBox[targetEdge];
        if (Math.abs(diff) <= SNAP_THRESHOLD && (!bestY || Math.abs(diff) < Math.abs(bestY.diff))) {
          bestY = { diff, target: targetEdge, value: box[edge] };
        }
      });
    });
  });

  const snapX = bestX as GuideMatch | null;
  const snapY = bestY as GuideMatch | null;
  const guides: Array<{ axis: 'x' | 'y'; value: number }> = [];
  if (snapX) guides.push({ axis: 'x', value: snapX.value });
  if (snapY) guides.push({ axis: 'y', value: snapY.value });
  drawSmartGuides(editor, guides);

  if (snap && (snapX || snapY || gridSnap)) {
    let nextLeft = targetBox.left + (snapX?.diff || 0);
    let nextTop = targetBox.top + (snapY?.diff || 0);
    if (gridSnap) {
      const gridSize = 24;
      nextLeft = Math.round(nextLeft / gridSize) * gridSize;
      nextTop = Math.round(nextTop / gridSize) * gridSize;
    }
    setComponentSlidePosition(target, rootEl, nextLeft, nextTop);
  }
}

function collectLayerItems(editor: Editor): LayerItem[] {
  const root =
    editor.getWrapper()?.find('.deck-slide')[0] ||
    editor.getWrapper()?.find('[data-htmlppt-document-root]')[0] ||
    editor.getWrapper();
  if (!root) return [];
  const items: LayerItem[] = [];

  const walk = (component: Component, depth: number) => {
    component.components().forEach((child: Component) => {
      if (isRootLikeComponent(child)) return;
      const style = child.getStyle();
      const hidden = stringStyleValue(style.display) === 'none' || stringStyleValue(style.visibility) === 'hidden';
      items.push({
        key: componentKey(child),
        label: componentDisplayName(child),
        tag: String(child.get('tagName') || child.getName() || 'element').toLowerCase(),
        depth,
        hidden,
        group: child.getAttributes()['data-html-demo-group'] === 'true'
      });
      if (depth < 1) walk(child, depth + 1);
    });
  };

  walk(root, 0);
  return items;
}

function findComponentByKey(editor: Editor, key: string): Component | null {
  const root = editor.getWrapper();
  if (!root) return null;
  const all = [root, ...root.find('*')];
  return all.find((component) => componentKey(component) === key) || null;
}

function componentHtmlForGroup(component: Component, box: BoxMetrics, bounds: BoxMetrics): string {
  const element = component.getEl?.();
  if (!element) return component.toHTML();

  const clone = element.cloneNode(true) as HTMLElement;
  clone.classList.remove('gjs-selected', 'gjs-hovered');
  clone.removeAttribute('data-html-demo-multi-selected');
  clone.querySelectorAll('[data-html-demo-multi-selected], .gjs-selected, .gjs-hovered').forEach((node) => {
    (node as HTMLElement).classList.remove('gjs-selected', 'gjs-hovered');
    (node as HTMLElement).removeAttribute('data-html-demo-multi-selected');
  });
  clone.querySelectorAll('[data-gjs-highlightable], [data-gjs-type]').forEach((node) => {
    (node as HTMLElement).removeAttribute('data-gjs-highlightable');
    (node as HTMLElement).removeAttribute('data-gjs-type');
  });
  clone.removeAttribute('data-gjs-highlightable');
  clone.removeAttribute('data-gjs-type');
  clone.removeAttribute('draggable');
  clone.style.position = 'absolute';
  clone.style.left = `${Math.round(box.left - bounds.left)}px`;
  clone.style.top = `${Math.round(box.top - bounds.top)}px`;
  clone.style.margin = clone.style.margin || '0';
  return clone.outerHTML;
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

function isEditableShortcutTarget(target: EventTarget | null): boolean {
  const element = getClickElement(target);
  if (!element) return false;
  const tagName = element.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select' || element.isContentEditable;
}

function nudgeSelectedComponent(editor: Editor, dx: number, dy: number): boolean {
  const selected = editor.getSelected();
  const element = selected?.getEl?.() as HTMLElement | undefined;
  const win = element?.ownerDocument.defaultView;
  if (!selected || !element || !win) return false;

  const computed = win.getComputedStyle(element);
  const style = selected.getStyle();
  const currentLeft =
    Number.parseFloat(stringStyleValue(style.left) || '') ||
    Number.parseFloat(computed.left) ||
    (element.offsetParent instanceof HTMLElement ? element.getBoundingClientRect().left - element.offsetParent.getBoundingClientRect().left : 0);
  const currentTop =
    Number.parseFloat(stringStyleValue(style.top) || '') ||
    Number.parseFloat(computed.top) ||
    (element.offsetParent instanceof HTMLElement ? element.getBoundingClientRect().top - element.offsetParent.getBoundingClientRect().top : 0);

  selected.addStyle({
    position: computed.position === 'static' ? 'relative' : computed.position || 'relative',
    left: `${Math.round(currentLeft + dx)}px`,
    top: `${Math.round(currentTop + dy)}px`
  });
  return true;
}

function enableComponentResize(component: Component | null | undefined): void {
  if (!component) return;
  const tagName = String(component.get('tagName') || component.getName() || '').toLowerCase();
  if (tagName === 'body' || component.get('type') === 'wrapper') return;

  component.set({
    resizable: ELEMENT_RESIZER_OPTIONS
  });
  component.components().forEach((child: Component) => enableComponentResize(child));
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
  active = false,
  variant = 'default'
}: {
  label: string;
  title?: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
  variant?: 'default' | 'primary';
}) {
  return (
    <button
      className={`toolbar-button toolbar-button--${variant}${active ? ' is-active' : ''}`}
      type="button"
      title={title || label}
      onClick={onClick}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}

export default function App() {
  const initialProject = useMemo(() => createDefaultProject(), []);
  const initialProjectHtml = useMemo(() => buildExportHtml(initialProject.slides, initialProject.meta), [initialProject]);
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
  const [canvasInteractionMode, setCanvasInteractionMode] = useState<CanvasInteractionMode>('edit');
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [lastAutoSavedAt, setLastAutoSavedAt] = useState<string | null>(null);
  const [selectionItems, setSelectionItems] = useState<ComponentSelectionItem[]>([]);
  const [layerItems, setLayerItems] = useState<LayerItem[]>([]);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);

  const editorHostRef = useRef<HTMLDivElement | null>(null);
  const editorShellRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const autoSaveTimerRef = useRef<number | null>(null);
  const dirtySyncTimerRef = useRef<number | null>(null);
  const autoSaveCheckedRef = useRef(false);
  const baselineOnLoadRef = useRef(true);
  const measuredDocumentWidthSlideRef = useRef<string | null>(null);
  const loadingSlideRef = useRef(false);
  const slidesRef = useRef(slides);
  const metaRef = useRef(meta);
  const currentSlideIdRef = useRef(currentSlideId);
  const gridEnabledRef = useRef(gridEnabled);
  const zoomRef = useRef(zoom);
  const canvasFitModeRef = useRef(canvasFitMode);
  const canvasInteractionModeRef = useRef<CanvasInteractionMode>('edit');
  const selectionItemsRef = useRef<ComponentSelectionItem[]>([]);
  const lastSelectionItemsRef = useRef<ComponentSelectionItem[]>([]);
  const lastSelectedComponentsRef = useRef<Component[]>([]);
  const persistedHtmlRef = useRef(initialProjectHtml);

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
    selectionItemsRef.current = selectionItems;
  }, [selectionItems]);

  useEffect(() => {
    zoomRef.current = zoom;
    applyEditorCanvasZoom(editorRef.current, zoom);
  }, [zoom]);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 2600);
  }, []);

  const refreshLayerItems = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    setLayerItems(collectLayerItems(editor));
  }, []);

  const syncSelectionState = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const selected = getActionableSelection(editor);
    const items = selected.map((component) => ({
      key: componentKey(component),
      label: componentDisplayName(component)
    }));
    selectionItemsRef.current = items;
    if (items.length) {
      lastSelectionItemsRef.current = items;
      lastSelectedComponentsRef.current = selected;
    }
    setSelectionItems(items);
    setSelectedSummary(selected.length === 1 ? summarizeSelected(editor) : null);

    const doc = editor.Canvas.getDocument();
    doc?.querySelectorAll('[data-html-demo-multi-selected]').forEach((node) => node.removeAttribute('data-html-demo-multi-selected'));
    selected.forEach((component) => component.getEl?.()?.setAttribute('data-html-demo-multi-selected', 'true'));
  }, []);

  const refreshRecentFiles = useCallback(async () => {
    try {
      if (!window.desktopBridge?.listRecentFiles) return;
      setRecentFiles(await window.desktopBridge.listRecentFiles());
    } catch (error) {
      console.error(error);
    }
  }, []);

  const applyManualSelectionState = useCallback((components: Component[]) => {
    const editor = editorRef.current;
    if (!editor) return [];

    const selected = normalizeComponentSelection(components);
    const items = selected.map((component) => ({
      key: componentKey(component),
      label: componentDisplayName(component)
    }));
    selectionItemsRef.current = items;
    if (items.length) {
      lastSelectionItemsRef.current = items;
      lastSelectedComponentsRef.current = selected;
    }
    setSelectionItems(items);
    setSelectedSummary(selected.length === 1 ? summarizeComponent(selected[0]) : null);

    const doc = editor.Canvas.getDocument();
    doc?.querySelectorAll('[data-html-demo-multi-selected]').forEach((node) => node.removeAttribute('data-html-demo-multi-selected'));
    selected.forEach((component) => component.getEl?.()?.setAttribute('data-html-demo-multi-selected', 'true'));
    return selected;
  }, []);

  const getCurrentSelection = useCallback((editor = editorRef.current): Component[] => {
    if (!editor) return [];
    const liveSelection = getActionableSelection(editor);
    const refSelection = selectionItemsRef.current
      .map((item) => findComponentByKey(editor, item.key))
      .filter((component): component is Component => Boolean(component) && !isRootLikeComponent(component));
    if (refSelection.length >= liveSelection.length && refSelection.length) return refSelection;
    const docSelection = Array.from(editor.Canvas.getDocument()?.querySelectorAll('[data-html-demo-multi-selected="true"]') || [])
      .map((element) => getGrapesComponentFromElement(editor, element))
      .filter((component): component is Component => Boolean(component) && !isRootLikeComponent(component));
    if (docSelection.length > liveSelection.length) return docSelection;
    if (liveSelection.length) return liveSelection;
    if (refSelection.length) return refSelection;
    const recentSelection = lastSelectionItemsRef.current
      .map((item) => findComponentByKey(editor, item.key))
      .filter((component): component is Component => Boolean(component) && !isRootLikeComponent(component));
    if (recentSelection.length) return recentSelection;
    const retainedSelection = lastSelectedComponentsRef.current.filter(
      (component) => component.getEl?.()?.isConnected && !isRootLikeComponent(component)
    );
    if (retainedSelection.length) return retainedSelection;

    return docSelection;
  }, []);

  const toggleCurrentSelection = useCallback(
    (component: Component) => {
      const editor = editorRef.current;
      if (!editor) return [];
      const current = getCurrentSelection(editor);
      const key = componentKey(component);
      const next = current.some((item) => componentKey(item) === key)
        ? current.filter((item) => componentKey(item) !== key)
        : [...current, component];
      selectComponents(editor, next);
      applyManualSelectionState(next);
      window.setTimeout(() => applyManualSelectionState(next), 0);
      return next;
    },
    [applyManualSelectionState, getCurrentSelection]
  );

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
      if (dirtySyncTimerRef.current) window.clearTimeout(dirtySyncTimerRef.current);
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
    doc.documentElement.classList.toggle('html-demo-editor-interact-mode', canvasInteractionModeRef.current === 'interact');

    const baseHref = metaRef.current.assetBaseUrl || baseDirToFileHref(metaRef.current.baseDir);
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
      [data-html-demo-multi-selected="true"] {
        outline: 2px solid rgba(0, 122, 255, 0.72) !important;
        outline-offset: 2px;
      }
      [data-html-demo-group="true"] {
        outline-offset: 2px;
      }
      html.html-demo-editor-grid body::after {
        content: "";
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 2147483647;
        background-image:
          linear-gradient(rgba(0, 122, 255, 0.13) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0, 122, 255, 0.13) 1px, transparent 1px);
        background-size: 24px 24px;
      }
      html.html-demo-editor-interact-mode [data-html-demo-multi-selected="true"] {
        outline: none !important;
      }
    `
      : `
      [data-html-demo-multi-selected="true"] {
        outline: 2px solid rgba(0, 122, 255, 0.72) !important;
        outline-offset: 2px;
      }
      [data-html-demo-group="true"] {
        outline-offset: 2px;
      }
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
          linear-gradient(rgba(0, 122, 255, 0.13) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0, 122, 255, 0.13) 1px, transparent 1px);
        background-size: 24px 24px;
      }
      html.html-demo-editor-interact-mode [data-html-demo-multi-selected="true"] {
        outline: none !important;
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

    if (isDocumentMode) {
      const syncDocumentSize = () => {
        if (!metaRef.current.documentMode) return;
        const activeSlide = slidesRef.current.find((slide) => slide.id === currentSlideIdRef.current) ?? slidesRef.current[0];
        if (!activeSlide) return;
        const root = doc.querySelector('[data-htmlppt-document-root]') as HTMLElement | null;
        const shouldMeasureWidth = measuredDocumentWidthSlideRef.current !== activeSlide.id;
        const measuredWidth = Math.ceil(
          Math.max(
            getSlideCanvasWidth(activeSlide),
            doc.documentElement.scrollWidth,
            doc.body.scrollWidth,
            root?.scrollWidth || 0,
            root?.getBoundingClientRect().width || 0
          )
        );
        const measuredHeight = Math.ceil(
          Math.max(
            getSlideCanvasHeight(activeSlide),
            doc.documentElement.scrollHeight,
            doc.body.scrollHeight,
            root?.scrollHeight || 0,
            root?.getBoundingClientRect().height || 0
          )
        );
        const device = editorRef.current?.Devices.get(CURRENT_DEVICE_ID);
        const currentWidth = Number.parseFloat(String(device?.get('width') || '0'));
        const currentHeight = Number.parseFloat(String(device?.get('height') || '0'));
        const targetWidth = shouldMeasureWidth ? measuredWidth : getSlideCanvasWidth(activeSlide);
        if (device && (Math.abs(currentWidth - targetWidth) > 1 || Math.abs(currentHeight - measuredHeight) > 1)) {
          device.set({
            width: `${targetWidth}px`,
            widthMedia: `${targetWidth}px`,
            height: `${measuredHeight}px`
          });
        }
        if (shouldMeasureWidth) measuredDocumentWidthSlideRef.current = activeSlide.id;
        if (targetWidth > getSlideCanvasWidth(activeSlide) + 1 || measuredHeight > getSlideCanvasHeight(activeSlide) + 1) {
          const nextSlides = slidesRef.current.map((slide) =>
            slide.id === activeSlide.id
              ? {
                  ...slide,
                  canvasWidth: Math.max(getSlideCanvasWidth(slide), targetWidth),
                  canvasHeight: Math.max(getSlideCanvasHeight(slide), measuredHeight)
                }
              : slide
          );
          slidesRef.current = nextSlides;
          setSlides(nextSlides);
        }
        const shellBounds = editorShellRef.current?.getBoundingClientRect();
        if (shellBounds) {
          const fit = Math.floor((Math.max(320, shellBounds.width - 4) / targetWidth) * 100);
          const nextZoom = applyEditorCanvasZoom(editorRef.current, fit);
          zoomRef.current = nextZoom;
          setZoom(nextZoom);
        }
      };

      window.setTimeout(syncDocumentSize, 0);
      window.setTimeout(syncDocumentSize, 300);
      window.setTimeout(syncDocumentSize, 1000);
    }
  }, []);

  const updateCanvasDevice = useCallback((slide: SlideModel) => {
    const editor = editorRef.current;
    if (!editor) return;
    const normalized = normalizeSlide(slide);
    const width = `${getSlideCanvasWidth(normalized)}px`;
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
      measuredDocumentWidthSlideRef.current = null;
      updateCanvasDevice(normalized);
      editor.setComponents(normalized.components);
      editor.setStyle(normalized.css);
      enableComponentResize(editor.getWrapper());
      applyEditorCanvasZoom(editor, zoomRef.current);
      window.requestAnimationFrame(() => applyEditorCanvasZoom(editor, zoomRef.current));
      (editor as unknown as { setDragMode?: (mode: string) => void }).setDragMode?.('absolute');
      setSelectedSummary(null);
      setSelectionItems([]);
      selectionItemsRef.current = [];
      lastSelectionItemsRef.current = [];
      lastSelectedComponentsRef.current = [];

      window.setTimeout(() => {
        syncCanvasHelpers();
        syncSelectionState();
        refreshLayerItems();
        loadingSlideRef.current = false;
        if (baselineOnLoadRef.current) {
          const finalizeBaseline = () => {
            if (!baselineOnLoadRef.current) return;
            const baselineSlides = slidesRef.current.map((item) =>
              item.id === normalized.id
                ? {
                    ...item,
                    components: editor.getHtml(),
                    css: editor.getCss() ?? ''
                  }
                : item
            );
            slidesRef.current = baselineSlides;
            setSlides(baselineSlides);
            persistedHtmlRef.current = buildExportHtml(baselineSlides, metaRef.current);
            baselineOnLoadRef.current = false;
            setDirty(false);
          };
          if (metaRef.current.documentMode) window.setTimeout(finalizeBaseline, 1100);
          else finalizeBaseline();
        }
      }, 0);
    },
    [refreshLayerItems, syncCanvasHelpers, syncSelectionState, updateCanvasDevice]
  );

  const commitCurrentSlide = useCallback((force = false) => {
    const editor = editorRef.current;
    const currentId = currentSlideIdRef.current;
    if (!editor || !currentId || (loadingSlideRef.current && !force)) return slidesRef.current;

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
      if (dirtySyncTimerRef.current) {
        window.clearTimeout(dirtySyncTimerRef.current);
        dirtySyncTimerRef.current = null;
      }
      const normalizedSlides = (nextSlides.length ? nextSlides : [createBlankSlide('页面 1')]).map(normalizeSlide);
      const firstSlide = normalizedSlides[0];
      setMeta(nextMeta);
      setSlides(normalizedSlides);
      setCurrentSlideId(firstSlide.id);
      setDirty(false);
      slidesRef.current = normalizedSlides;
      metaRef.current = nextMeta;
      currentSlideIdRef.current = firstSlide.id;
      persistedHtmlRef.current = buildExportHtml(normalizedSlides, nextMeta);
      baselineOnLoadRef.current = true;
      if (nextMeta.documentMode) {
        setGridEnabled(false);
        gridEnabledRef.current = false;
        setCanvasFitMode('width');
        canvasFitModeRef.current = 'width';
      }
      setCanvasInteractionMode('edit');
      canvasInteractionModeRef.current = 'edit';
      loadSlideIntoEditor(firstSlide);
    },
    [loadSlideIntoEditor]
  );

  const restoreAutoSaveIfAvailable = useCallback(async () => {
    if (autoSaveCheckedRef.current) return;
    autoSaveCheckedRef.current = true;
    if (!window.desktopBridge?.loadAutoSave) return;

    const record: AutoSaveRecord | null = await window.desktopBridge.loadAutoSave();
    if (!record?.html) return;

    const savedAt = record.savedAt ? new Date(record.savedAt).toLocaleString() : '上次编辑时';
    const shouldRestore = window.confirm(`发现 ${savedAt} 的自动保存草稿，是否恢复？`);
    if (!shouldRestore) return;

    const parsed = parseHtmlProject(
      record.html,
      record.sourceName || record.title || '自动恢复.html',
      record.filePath,
      record.baseDir,
      record.assetBaseUrl
    );
    replaceProject(parsed.meta, parsed.slides);
    baselineOnLoadRef.current = false;
    setDirty(true);
    notify('已恢复自动保存草稿');
  }, [notify, replaceProject]);

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
      layerManager: { appendTo: '#hidden-gjs-panel' },
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
          'mousedown',
          (event) => {
            if (canvasInteractionModeRef.current === 'interact') return;
            if (event.button !== 0 || isEditableShortcutTarget(event.target)) return;
            const component = getGrapesComponentFromElement(editor, event.target);
            if ((event.shiftKey || event.metaKey || event.ctrlKey) && component && !isRootLikeComponent(component)) {
              event.preventDefault();
              event.stopPropagation();
              event.stopImmediatePropagation();
              return;
            }
            const target = getClickElement(event.target);
            const isCanvasTarget =
              !target ||
              target === frameDoc.body ||
              target === frameDoc.documentElement ||
              target.classList.contains('deck-slide') ||
              target.hasAttribute('data-htmlppt-document-root');
            if (!isCanvasTarget) return;

            const startX = event.clientX;
            const startY = event.clientY;
            let marquee: HTMLDivElement | null = null;
            let active = false;

            const draw = (moveEvent: MouseEvent) => {
              const dx = moveEvent.clientX - startX;
              const dy = moveEvent.clientY - startY;
              if (!active && Math.hypot(dx, dy) < 6) return;
              if (!marquee) {
                marquee = frameDoc.createElement('div');
                marquee.setAttribute('data-html-demo-marquee', 'true');
                Object.assign(marquee.style, {
                  position: 'fixed',
                  pointerEvents: 'none',
                  zIndex: '2147483647',
                  border: '1px solid #007aff',
                  background: 'rgba(0, 122, 255, 0.1)'
                });
                frameDoc.body.appendChild(marquee);
              }
              active = true;
              marquee.style.left = `${Math.min(startX, moveEvent.clientX)}px`;
              marquee.style.top = `${Math.min(startY, moveEvent.clientY)}px`;
              marquee.style.width = `${Math.abs(dx)}px`;
              marquee.style.height = `${Math.abs(dy)}px`;
              event.preventDefault();
            };

            const finish = () => {
              frameDoc.removeEventListener('mousemove', draw);
              frameDoc.removeEventListener('mouseup', finish);
              if (!active || !marquee) {
                marquee?.remove();
                return;
              }

              const selectRect = marquee.getBoundingClientRect();
              marquee.remove();
              const root = editor.getWrapper();
              const hits = root
                ? root
                    .find('*')
                    .filter((component) => !isRootLikeComponent(component))
                    .filter((component) => {
                      const rect = component.getEl?.()?.getBoundingClientRect();
                      if (!rect || rect.width < 2 || rect.height < 2) return false;
                      return rect.left < selectRect.right && rect.right > selectRect.left && rect.top < selectRect.bottom && rect.bottom > selectRect.top;
                    })
                : [];
              const topLevelHits = hits.filter((component) => !hits.some((other) => componentContains(other, component)));
              if (topLevelHits.length) {
                selectComponents(editor, topLevelHits);
                applyManualSelectionState(topLevelHits);
                setRightTab('style');
              } else {
                editor.select();
                syncSelectionState();
              }
            };

            frameDoc.addEventListener('mousemove', draw);
            frameDoc.addEventListener('mouseup', finish);
          },
          true
        );
        frameDoc.addEventListener(
          'click',
          (event) => {
            if (canvasInteractionModeRef.current === 'interact') return;
            const component = getGrapesComponentFromElement(editor, event.target);
            if (!component) return;

            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            setContextMenu(null);
            if (event.shiftKey || event.metaKey || event.ctrlKey) {
              toggleCurrentSelection(component);
            } else {
              editor.select(component);
              applyManualSelectionState([component]);
            }
            setRightTab('style');
          },
          true
        );
        const handleFrameContextMenu = (event: MouseEvent) => {
            if (canvasInteractionModeRef.current === 'interact') return;
            const markedEvent = event as MouseEvent & { __htmlDemoContextHandled?: boolean };
            if (markedEvent.__htmlDemoContextHandled) return;
            markedEvent.__htmlDemoContextHandled = true;
            const component = getGrapesComponentFromElement(editor, event.target);
            if (!component) {
              setContextMenu(null);
              return;
            }

            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            const alreadySelected = getActionableSelection(editor).some((selected) => selected === component);
            if (!alreadySelected) editor.select(component);
            setRightTab('style');
            syncSelectionState();

            const frameEl = editor.Canvas.getFrameEl();
            const frameRect = frameEl?.getBoundingClientRect();
            const frameWindow = frameDoc.defaultView;
            const scaleX = frameRect && frameWindow?.innerWidth ? frameRect.width / frameWindow.innerWidth : zoomRef.current / 100;
            const scaleY = frameRect && frameWindow?.innerHeight ? frameRect.height / frameWindow.innerHeight : zoomRef.current / 100;
            const left = (frameRect?.left ?? 0) + event.clientX * scaleX;
            const top = (frameRect?.top ?? 0) + event.clientY * scaleY;
            const summary = summarizeComponent(component);

            setContextMenu({
              x: Math.max(8, Math.min(window.innerWidth - 230, left)),
              y: Math.max(8, Math.min(window.innerHeight - 260, top)),
              label: summary.label || '元素',
              isImage: summary.isImage || false,
              canEditText: isTextLikeComponent(component),
              summary
            });
        };
        frameDoc.defaultView?.addEventListener('contextmenu', handleFrameContextMenu, true);
        frameDoc.addEventListener('contextmenu', handleFrameContextMenu, true);
        frameDoc.addEventListener(
          'keydown',
          (event) => {
            if (canvasInteractionModeRef.current === 'interact') return;
            if (isEditableShortcutTarget(event.target)) return;
            const directionMap: Record<string, [number, number]> = {
              ArrowLeft: [-1, 0],
              ArrowRight: [1, 0],
              ArrowUp: [0, -1],
              ArrowDown: [0, 1]
            };
            const direction = directionMap[event.key];
            if (!direction) return;

            const step = event.shiftKey ? 10 : 1;
            const selected = getCurrentSelection(editor);
            if (nudgeComponents(editor, selected.length ? selected : [], direction[0] * step, direction[1] * step)) {
              event.preventDefault();
              event.stopPropagation();
              syncSelectionState();
              setDirty(true);
            }
          },
          true
        );
      });
    };

    editor.on('load', () => {
      loadSlideIntoEditor(slidesRef.current[0]);
      syncCanvasHelpers();
      installSelectionBridge();
      void restoreAutoSaveIfAvailable();
    });

    editor.on('update', () => {
      if (loadingSlideRef.current || baselineOnLoadRef.current) return;
      if (dirtySyncTimerRef.current) window.clearTimeout(dirtySyncTimerRef.current);
      dirtySyncTimerRef.current = window.setTimeout(() => {
        if (loadingSlideRef.current || baselineOnLoadRef.current) {
          dirtySyncTimerRef.current = null;
          return;
        }
        const currentId = currentSlideIdRef.current;
        const currentSlides = slidesRef.current.map((slide) =>
          slide.id === currentId
            ? {
                ...slide,
                components: editor.getHtml(),
                css: editor.getCss() ?? ''
              }
            : slide
        );
        const currentHtml = buildExportHtml(currentSlides, metaRef.current);
        setDirty(currentHtml !== persistedHtmlRef.current);
        dirtySyncTimerRef.current = null;
      }, 0);
    });
    editor.on('component:add', (component) => {
      enableComponentResize(component);
      refreshLayerItems();
    });
    editor.on('component:remove', () => {
      refreshLayerItems();
      syncSelectionState();
    });
    editor.on('component:resize:init', (options: { component?: Component; resizable?: boolean | ResizerOptions }) => {
      if (options.component) {
        options.resizable = ELEMENT_RESIZER_OPTIONS;
      }
    });
    editor.on('component:drag component:resize:move', (event: { target?: Component; component?: Component }) => {
      updateSmartGuides(editor, event.component || event.target);
    });
    editor.on('component:drag:end component:resize:end', (event: { target?: Component; component?: Component }) => {
      updateSmartGuides(editor, event.component || event.target, true, gridEnabledRef.current && !metaRef.current.documentMode);
      window.setTimeout(() => clearSmartGuides(editor), 220);
      syncSelectionState();
      refreshLayerItems();
    });
    editor.on('component:selected component:update component:styleUpdate', () => {
      syncSelectionState();
      refreshLayerItems();
    });
    editor.on('component:selected', () => {
      setRightTab('style');
    });
    editor.on('component:deselected', syncSelectionState);
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
  }, [
    applyManualSelectionState,
    getCurrentSelection,
    loadSlideIntoEditor,
    refreshLayerItems,
    restoreAutoSaveIfAvailable,
    syncCanvasHelpers,
    syncSelectionState,
    toggleCurrentSelection
  ]);

  useEffect(() => {
    syncCanvasHelpers();
  }, [gridEnabled, meta.assetBaseUrl, syncCanvasHelpers]);

  const confirmDiscard = useCallback(() => {
    if (!dirty) return true;
    return window.confirm('当前项目有未保存修改，确定要继续吗？');
  }, [dirty]);

  const materializeHtml = useCallback(() => {
    const nextSlides = commitCurrentSlide(true);
    return {
      slides: nextSlides,
      html: buildExportHtml(nextSlides, metaRef.current)
    };
  }, [commitCurrentSlide]);

  useEffect(() => {
    if (!dirty) return;
    if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current);

    autoSaveTimerRef.current = window.setTimeout(async () => {
      try {
        const { html } = materializeHtml();
        const result = await window.desktopBridge.autoSaveProject({
          html,
          title: metaRef.current.title,
          filePath: metaRef.current.filePath,
          baseDir: metaRef.current.baseDir,
          sourceName: metaRef.current.sourceName
        });
        setLastAutoSavedAt(result.savedAt);
      } catch (error) {
        console.error(error);
      }
    }, 30000);

    return () => {
      if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current);
    };
  }, [dirty, materializeHtml, slides, meta, currentSlideId]);

  const handleNewProject = useCallback(() => {
    if (!confirmDiscard()) return;
    const project = createDefaultProject();
    replaceProject(project.meta, project.slides);
  }, [confirmDiscard, replaceProject]);

  const openImportedProject = useCallback(
    (result: OpenProjectResult) => {
      const parsed = parseHtmlProject(result.html, result.name, result.filePath, result.baseDir, result.assetBaseUrl);
      replaceProject(parsed.meta, parsed.slides);
      notify(`已打开 ${result.name}`);
      void refreshRecentFiles();
    },
    [notify, refreshRecentFiles, replaceProject]
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

  const handleOpenRecentFile = useCallback(
    async (filePath: string) => {
      if (!confirmDiscard()) return;
      const result = await window.desktopBridge.openPath(filePath);
      if (result) openImportedProject(result);
      await refreshRecentFiles();
    },
    [confirmDiscard, openImportedProject, refreshRecentFiles]
  );

  useEffect(() => {
    void refreshRecentFiles();
    if (!window.desktopBridge?.onOpenPathRequested) return undefined;
    return window.desktopBridge.onOpenPathRequested(async (filePath) => {
      if (!confirmDiscard()) return;
      const result = await window.desktopBridge.openPath(filePath);
      if (result) openImportedProject(result);
    });
  }, [confirmDiscard, openImportedProject, refreshRecentFiles]);

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

      const nextMeta = {
        ...metaRef.current,
        filePath: result.filePath,
        baseDir: dirnameFromPath(result.filePath),
        assetBaseUrl: result.assetBaseUrl,
        sourceName: result.filePath.split(/[\\/]/).pop()
      };
      metaRef.current = nextMeta;
      setMeta(nextMeta);
      persistedHtmlRef.current = html;
      setLastAutoSavedAt(null);
      await window.desktopBridge.clearAutoSave();
      await refreshRecentFiles();
      setDirty(false);
      notify(`已保存到 ${result.filePath.split(/[\\/]/).pop()}`);
    } catch (error) {
      console.error(error);
      notify('保存失败，请检查文件权限或路径');
    }
  }, [materializeHtml, notify, refreshRecentFiles]);

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

      const nextMeta = {
        ...metaRef.current,
        filePath: result.filePath,
        baseDir: dirnameFromPath(result.filePath),
        assetBaseUrl: result.assetBaseUrl,
        sourceName: result.filePath.split(/[\\/]/).pop()
      };
      metaRef.current = nextMeta;
      setMeta(nextMeta);
      persistedHtmlRef.current = html;
      setLastAutoSavedAt(null);
      await window.desktopBridge.clearAutoSave();
      await refreshRecentFiles();
      setDirty(false);
      notify(`已另存为 ${result.filePath.split(/[\\/]/).pop()}`);
    } catch (error) {
      console.error(error);
      notify('另存失败，请检查文件权限或路径');
    }
  }, [materializeHtml, notify, refreshRecentFiles]);

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

  const handlePresent = useCallback(async (startSlideIndex = 0) => {
    try {
      const { html } = materializeHtml();
      await window.desktopBridge.presentProject({
        html,
        baseDir: metaRef.current.baseDir,
        fullscreen: true,
        startSlideIndex
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
    const bounds = shell.getBoundingClientRect();
    const width = getSlideCanvasWidth(normalized);
    const height = getSlideCanvasHeight(normalized);
    const availableWidth = Math.max(320, bounds.width - 4);
    const availableHeight = Math.max(240, bounds.height - 4);
    const fit =
      metaRef.current.documentMode || normalized.presentationMode === 'scroll' || canvasFitModeRef.current === 'width'
        ? Math.floor((availableWidth / width) * 100)
        : Math.floor(Math.min(availableWidth / width, availableHeight / height) * 100);
    const nextZoom = applyEditorCanvasZoom(editorRef.current, fit);
    zoomRef.current = nextZoom;
    setZoom(nextZoom);
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

  useEffect(() => {
    const shell = editorShellRef.current;
    if (!shell || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => handleFitCanvas());
    observer.observe(shell);
    return () => observer.disconnect();
  }, [handleFitCanvas]);

  const handleCanvasInteractionToggle = useCallback(() => {
    const next: CanvasInteractionMode = canvasInteractionModeRef.current === 'edit' ? 'interact' : 'edit';
    canvasInteractionModeRef.current = next;
    setCanvasInteractionMode(next);
    setContextMenu(null);
    if (next === 'interact') {
      editorRef.current?.select();
      setSelectionItems([]);
      selectionItemsRef.current = [];
      setSelectedSummary(null);
    }
    window.setTimeout(syncCanvasHelpers, 0);
  }, [syncCanvasHelpers]);

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

  const selectComponent = useCallback(
    (component: Component, additive = false) => {
      const editor = editorRef.current;
      if (!editor) return;
      if (additive) {
        toggleCurrentSelection(component);
      } else {
        editor.select(component);
        applyManualSelectionState([component]);
      }
      setRightTab('style');
    },
    [applyManualSelectionState, toggleCurrentSelection]
  );

  const handleSelectLayer = useCallback(
    (key: string, additive = false) => {
      const editor = editorRef.current;
      if (!editor) return;
      const component = findComponentByKey(editor, key);
      if (!component) return;
      selectComponent(component, additive);
    },
    [selectComponent]
  );

  const handleToggleLayerVisibility = useCallback(
    (key: string) => {
      const editor = editorRef.current;
      if (!editor) return;
      const component = findComponentByKey(editor, key);
      if (!component) return;
      const style = component.getStyle();
      const hidden = stringStyleValue(style.display) === 'none' || stringStyleValue(style.visibility) === 'hidden';
      component.addStyle(hidden ? { display: '', visibility: '' } : { display: 'none' });
      refreshLayerItems();
      setDirty(true);
    },
    [refreshLayerItems]
  );

  const handleMoveLayerOrder = useCallback(
    (key: string, direction: 'up' | 'down') => {
      const editor = editorRef.current;
      if (!editor) return;
      const component = findComponentByKey(editor, key);
      const parent = component?.parent();
      if (!component || !parent) return;
      const nextIndex = direction === 'up' ? Math.max(0, component.index() - 1) : component.index() + 1;
      component.move(parent, { at: nextIndex });
      selectComponent(component);
      refreshLayerItems();
      setDirty(true);
    },
    [refreshLayerItems, selectComponent]
  );

  const handleAlignSelection = useCallback(
    (action: AlignAction) => {
      const editor = editorRef.current;
      if (!editor) return;
      const rootEl = getCanvasRootElement(editor);
      const components = getCurrentSelection(editor);
      if (!rootEl || !components.length) return;

      const boxes = components.map((component) => getComponentBox(component, rootEl)).filter(Boolean) as BoxMetrics[];
      const target =
        components.length > 1
          ? selectionBounds(boxes)
          : {
              left: 0,
              top: 0,
              width: rootEl.getBoundingClientRect().width,
              height: rootEl.getBoundingClientRect().height,
              right: rootEl.getBoundingClientRect().width,
              bottom: rootEl.getBoundingClientRect().height,
              centerX: rootEl.getBoundingClientRect().width / 2,
              centerY: rootEl.getBoundingClientRect().height / 2
            };
      if (!target) return;

      components.forEach((component, index) => {
        const box = boxes[index];
        if (!box) return;
        const nextLeft =
          action === 'left'
            ? target.left
            : action === 'center'
              ? target.centerX - box.width / 2
              : action === 'right'
                ? target.right - box.width
                : box.left;
        const nextTop =
          action === 'top'
            ? target.top
            : action === 'middle'
              ? target.centerY - box.height / 2
              : action === 'bottom'
                ? target.bottom - box.height
                : box.top;
        setComponentSlidePosition(component, rootEl, nextLeft, nextTop);
      });
      syncSelectionState();
      refreshLayerItems();
      setDirty(true);
    },
    [refreshLayerItems, syncSelectionState]
  );

  const handleDistributeSelection = useCallback(
    (action: DistributeAction) => {
      const editor = editorRef.current;
      if (!editor) return;
      const rootEl = getCanvasRootElement(editor);
      const components = getCurrentSelection(editor);
      if (!rootEl || components.length < 3) return;
      const boxes = components
        .map((component) => ({ component, box: getComponentBox(component, rootEl) }))
        .filter((item): item is { component: Component; box: BoxMetrics } => Boolean(item.box));
      const ordered = boxes.sort((a, b) => (action === 'horizontal' ? a.box.centerX - b.box.centerX : a.box.centerY - b.box.centerY));
      const first = ordered[0];
      const last = ordered[ordered.length - 1];
      if (!first || !last) return;
      const start = action === 'horizontal' ? first.box.centerX : first.box.centerY;
      const end = action === 'horizontal' ? last.box.centerX : last.box.centerY;
      const step = (end - start) / (ordered.length - 1);
      ordered.forEach(({ component, box }, index) => {
        const center = start + step * index;
        setComponentSlidePosition(
          component,
          rootEl,
          action === 'horizontal' ? center - box.width / 2 : box.left,
          action === 'vertical' ? center - box.height / 2 : box.top
        );
      });
      syncSelectionState();
      refreshLayerItems();
      setDirty(true);
    },
    [refreshLayerItems, syncSelectionState]
  );

  const handleGroupSelection = useCallback(() => {
    const editor = editorRef.current;
    const rootEl = editor ? getCanvasRootElement(editor) : null;
    const components = getCurrentSelection(editor);
    if (!editor || !rootEl || components.length < 2) return;
    const parent = components[0].parent();
    if (!parent || components.some((component) => component.parent() !== parent)) {
      notify('暂时只能组合同一层级的对象');
      return;
    }

    const boxes = components.map((component) => getComponentBox(component, rootEl)).filter(Boolean) as BoxMetrics[];
    const bounds = selectionBounds(boxes);
    if (!bounds) return;
    const groupIndex = Math.min(...components.map((component) => component.index()));
    const childHtml = components.map((component, index) => componentHtmlForGroup(component, boxes[index], bounds)).join('');
    const [group] = parent.append(
      {
        tagName: 'div',
        attributes: { 'data-html-demo-group': 'true' },
        classes: ['html-demo-group'],
        style: {
          position: 'absolute',
          left: `${Math.round(bounds.left)}px`,
          top: `${Math.round(bounds.top)}px`,
          width: `${Math.round(bounds.width)}px`,
          height: `${Math.round(bounds.height)}px`
        },
        components: childHtml
      },
      { at: groupIndex }
    );
    components.forEach((component) => component.remove());
    if (group) {
      enableComponentResize(group);
      editor.select(group);
    }
    syncSelectionState();
    refreshLayerItems();
    setDirty(true);
  }, [notify, refreshLayerItems, syncSelectionState]);

  const handleUngroupSelection = useCallback(() => {
    const editor = editorRef.current;
    const rootEl = editor ? getCanvasRootElement(editor) : null;
    if (!editor || !rootEl) return;
    const groups = getCurrentSelection(editor).filter((component) => component.getAttributes()['data-html-demo-group'] === 'true');
    if (!groups.length) return;

    const ungrouped: Component[] = [];
    groups.forEach((group) => {
      const parent = group.parent();
      const groupBox = getComponentBox(group, rootEl);
      if (!parent || !groupBox) return;
      const at = group.index();
      const children = ((group.components() as unknown as { models?: Component[] }).models || []) as Component[];
      children.forEach((child, index) => {
        const childBox = getComponentBox(child, group.getEl?.() || rootEl);
        const clone = child.clone();
        clone.addStyle({
          position: 'absolute',
          left: `${Math.round(groupBox.left + (childBox?.left || 0))}px`,
          top: `${Math.round(groupBox.top + (childBox?.top || 0))}px`
        });
        const [added] = parent.append(clone, { at: at + index });
        if (added) ungrouped.push(added);
      });
      group.remove();
    });

    if (ungrouped.length) {
      editor.select(ungrouped[0]);
      ungrouped.slice(1).forEach((component) => editor.selectAdd(component));
    }
    syncSelectionState();
    refreshLayerItems();
    setDirty(true);
  }, [refreshLayerItems, syncSelectionState]);

  const handleDeleteSelection = useCallback(() => {
    const editor = editorRef.current;
    const selected = getCurrentSelection(editor);
    if (!selected.length) return;
    selected.forEach((component) => component.remove());
    setSelectedSummary(null);
    setSelectionItems([]);
    selectionItemsRef.current = [];
    lastSelectionItemsRef.current = [];
    lastSelectedComponentsRef.current = [];
    setContextMenu(null);
    refreshLayerItems();
    setDirty(true);
  }, [refreshLayerItems]);

  const handleDuplicateSelection = useCallback(() => {
    const editor = editorRef.current;
    const selected = getCurrentSelection(editor);
    if (!editor || !selected.length) return;
    const clones: Component[] = [];
    selected.forEach((component) => {
      const parent = component.parent();
      if (!parent) return;
      const clone = component.clone();
      const style = clone.getStyle();
      const left = cssNumber(stringStyleValue(style.left), Number.NaN);
      const top = cssNumber(stringStyleValue(style.top), Number.NaN);
      if (Number.isFinite(left) || Number.isFinite(top)) {
        clone.addStyle({
          left: Number.isFinite(left) ? `${Math.round(left + 24)}px` : stringStyleValue(style.left) || '',
          top: Number.isFinite(top) ? `${Math.round(top + 24)}px` : stringStyleValue(style.top) || ''
        });
      }
      const [added] = parent.append(clone, { at: component.index() + 1 });
      if (added) clones.push(added);
    });
    if (clones.length) {
      editor.select(clones[0]);
      clones.slice(1).forEach((component) => editor.selectAdd(component));
    }
    setContextMenu(null);
    syncSelectionState();
    refreshLayerItems();
    setDirty(true);
  }, [refreshLayerItems, syncSelectionState]);

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
    const selected = getCurrentSelection(editor);
    if (!editor || !selected.length) return;

    selected.forEach((component) => {
      const style = component.getStyle();
      component.addStyle({
        position: stringStyleValue(style.position) || 'relative',
        'z-index': placement === 'front' ? '999' : '0'
      });
    });
    syncSelectionState();
    refreshLayerItems();
    setContextMenu(null);
    setDirty(true);
  }, [refreshLayerItems, syncSelectionState]);

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
    const selected = getCurrentSelection(editor);
    if (!editor || !selected.length) return;

    selected.forEach((component) => component.addStyle(styles));
    const summary = summarizeSelected(editor);
    setSelectedSummary(summary);
    setContextMenu((current) =>
      current && summary
        ? {
            ...current,
            label: summary.label,
            isImage: summary.isImage,
            summary
          }
        : current
    );
    syncSelectionState();
    refreshLayerItems();
    setDirty(true);
  }, [refreshLayerItems, syncSelectionState]);

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
      const currentSize = cssNumber(stringStyleValue(style['font-size']) || contextMenu?.summary.fontSize || selectedSummary?.fontSize, 24);
      const nextSize = Math.max(8, Math.min(220, Math.round(currentSize + delta)));
      applySelectedStyles({ 'font-size': `${nextSize}px` });
    },
    [applySelectedStyles, contextMenu?.summary.fontSize, selectedSummary?.fontSize]
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
    loadingSlideRef.current = false;
    commitCurrentSlide(true);
    setDirty(true);
    setCodeOpen(false);
    window.setTimeout(syncCanvasHelpers, 0);
  }, [codeCss, codeHtml, commitCurrentSlide, syncCanvasHelpers]);

  const currentSlideIndex = slides.findIndex((slide) => slide.id === currentSlideId);
  const selectedSlide = slides[currentSlideIndex] ?? slides[0];
  const selectedKeys = useMemo(() => new Set(selectionItems.map((item) => item.key)), [selectionItems]);
  const selectedLayerItems = layerItems.filter((item) => selectedKeys.has(item.key));
  const selectedCount = selectionItems.length;
  const canGroupSelection = selectedCount >= 2;
  const canUngroupSelection = selectedLayerItems.some((item) => item.group);
  const canDistributeSelection = selectedCount >= 3;
  const activeContextSummary = contextMenu?.summary || selectedSummary;
  const contextFontSize = cssNumber(activeContextSummary?.fontSize, 24);
  const contextTextColor = cssColorInputValue(activeContextSummary?.color, '#111827');
  const contextFillColor = cssColorInputValue(activeContextSummary?.backgroundColor, '#ffffff');
  const contextFontValue = FONT_OPTIONS.some((option) => option.value === activeContextSummary?.fontFamily)
    ? activeContextSummary?.fontFamily
    : '';
  const customContextFont = activeContextSummary?.fontFamily && !contextFontValue ? activeContextSummary.fontFamily : '';
  const contextBoldActive = isBoldValue(activeContextSummary?.fontWeight);
  const contextItalicActive = activeContextSummary?.fontStyle === 'italic';
  const contextUnderlineActive = (activeContextSummary?.textDecoration || '').includes('underline');
  const saveStatusLabel = dirty ? '有未保存修改' : meta.filePath ? '已保存' : '尚未保存';
  const renderedCanvasWidth = selectedSlide ? getSlideCanvasWidth(selectedSlide) * (zoom / 100) : 0;
  const renderedCanvasHeight = selectedSlide ? getSlideCanvasHeight(selectedSlide) * (zoom / 100) : 0;

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

  useEffect(() => {
    const handleAppKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const isMod = event.metaKey || event.ctrlKey;

      if (key === 'f5') {
        event.preventDefault();
        handlePresent(event.shiftKey ? Math.max(0, currentSlideIndex) : 0);
        return;
      }

      if (!isMod) return;

      if (key === 's') {
        event.preventDefault();
        if (event.shiftKey) void handleSaveAs();
        else void handleSave();
        return;
      }
      if (isEditableShortcutTarget(event.target)) return;
      if (key === 'a') {
        event.preventDefault();
        const editor = editorRef.current;
        const root = editor?.getWrapper()?.find('.deck-slide')[0] || editor?.getWrapper()?.find('[data-htmlppt-document-root]')[0] || editor?.getWrapper();
        const components = root?.find('*').filter((component) => !isRootLikeComponent(component)) || [];
        const topLevel = components.filter((component) => !components.some((other) => componentContains(other, component)));
        if (editor && topLevel.length) {
          selectComponents(editor, topLevel);
          applyManualSelectionState(topLevel);
        }
        return;
      }
      if (key === 'g') {
        event.preventDefault();
        if (event.shiftKey) handleUngroupSelection();
        else handleGroupSelection();
        return;
      }
      if (key === 'o') {
        event.preventDefault();
        void handleOpenFile();
        return;
      }
      if (key === 'n') {
        event.preventDefault();
        handleNewProject();
        return;
      }
      if (key === 'm') {
        event.preventDefault();
        handleAddSlide();
        return;
      }
      if (key === 'd') {
        event.preventDefault();
        const editor = editorRef.current;
        if (editor && getCurrentSelection(editor).length) handleDuplicateSelection();
        else if (selectedSlide) handleDuplicateSlide(selectedSlide.id);
        return;
      }
    };

    window.addEventListener('keydown', handleAppKeyDown, true);
    return () => window.removeEventListener('keydown', handleAppKeyDown, true);
  }, [
    applyManualSelectionState,
    currentSlideIndex,
    handleAddSlide,
    handleDuplicateSelection,
    handleDuplicateSlide,
    handleGroupSelection,
    handleNewProject,
    handleOpenFile,
    handlePresent,
    handleSave,
    handleSaveAs,
    handleUngroupSelection,
    syncSelectionState,
    selectedSlide
  ]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <FileCode2 size={18} strokeWidth={1.8} />
          </div>
          <div className="brand-copy">
            <strong>HTML Demo Editor</strong>
            <div className="brand-subtitle">
              <span
                className={`document-state-dot${dirty ? ' is-dirty' : meta.filePath ? ' is-saved' : ' is-unsaved'}`}
                aria-hidden="true"
              />
              <span title={meta.filePath || meta.sourceName || '本地演示材料'}>{meta.sourceName || '本地演示材料'}</span>
            </div>
          </div>
        </div>

        <nav className="toolbar" aria-label="主工具栏">
          <div className="toolbar-group" aria-label="文件">
            <ToolbarButton label="新建" onClick={handleNewProject}>
              <FilePlus2 size={16} />
            </ToolbarButton>
            <ToolbarButton label="打开" onClick={handleOpenFile}>
              <FolderOpen size={16} />
            </ToolbarButton>
            <ToolbarButton label="文件夹" onClick={handleOpenFolder}>
              <FolderTree size={16} />
            </ToolbarButton>
          </div>
          <div className="toolbar-group" aria-label="保存">
            <ToolbarButton label="保存" onClick={handleSave}>
              <Save size={16} />
            </ToolbarButton>
            <ToolbarButton label="另存" onClick={handleSaveAs}>
              <SaveAll size={16} />
            </ToolbarButton>
          </div>
          <div className="toolbar-group" aria-label="编辑">
            <ToolbarButton label="撤销" onClick={handleUndo}>
              <Undo2 size={16} />
            </ToolbarButton>
            <ToolbarButton label="重做" onClick={handleRedo}>
              <Redo2 size={16} />
            </ToolbarButton>
            <ToolbarButton label="代码" onClick={openCodeView} active={codeOpen}>
              <Code2 size={16} />
            </ToolbarButton>
          </div>
          <div className="toolbar-group toolbar-group--output" aria-label="预览与导出">
            <ToolbarButton label="预览" onClick={handlePreviewWindow}>
              <Play size={16} />
            </ToolbarButton>
            <ToolbarButton label="演示" variant="primary" onClick={() => handlePresent(0)}>
              <Presentation size={16} />
            </ToolbarButton>
            <ToolbarButton label="导出" onClick={handleExport}>
              <Download size={16} />
            </ToolbarButton>
          </div>
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
            <div className="canvas-tools" onMouseDown={(event) => event.preventDefault()}>
              <span className={`selection-count${selectedCount ? ' has-selection' : ''}`}>
                {selectedCount ? `已选 ${selectedCount}` : '编辑画布'}
              </span>
              <div className={`selection-tools${selectedCount ? '' : ' is-hidden'}`} aria-label="对象排列">
                <button type="button" title="左对齐" disabled={!selectedCount} onClick={() => handleAlignSelection('left')}>
                  <AlignStartVertical size={16} />
                </button>
                <button type="button" title="水平居中" disabled={!selectedCount} onClick={() => handleAlignSelection('center')}>
                  <AlignCenterVertical size={16} />
                </button>
                <button type="button" title="右对齐" disabled={!selectedCount} onClick={() => handleAlignSelection('right')}>
                  <AlignEndVertical size={16} />
                </button>
                <button type="button" title="顶端对齐" disabled={!selectedCount} onClick={() => handleAlignSelection('top')}>
                  <AlignStartHorizontal size={16} />
                </button>
                <button type="button" title="垂直居中" disabled={!selectedCount} onClick={() => handleAlignSelection('middle')}>
                  <AlignCenterHorizontal size={16} />
                </button>
                <button type="button" title="底端对齐" disabled={!selectedCount} onClick={() => handleAlignSelection('bottom')}>
                  <AlignEndHorizontal size={16} />
                </button>
                <button type="button" title="水平分布" disabled={!canDistributeSelection} onClick={() => handleDistributeSelection('horizontal')}>
                  <AlignHorizontalSpaceBetween size={16} />
                </button>
                <button type="button" title="垂直分布" disabled={!canDistributeSelection} onClick={() => handleDistributeSelection('vertical')}>
                  <AlignVerticalSpaceBetween size={16} />
                </button>
                <button type="button" title="组合" disabled={!canGroupSelection} onClick={handleGroupSelection}>
                  <Group size={16} />
                </button>
                <button type="button" title="取消组合" disabled={!canUngroupSelection} onClick={handleUngroupSelection}>
                  <Ungroup size={16} />
                </button>
              </div>
              <span className="canvas-tools-divider" />
              <button
                className={canvasInteractionMode === 'interact' ? 'is-active' : ''}
                type="button"
                title={canvasInteractionMode === 'interact' ? '返回编辑模式' : '交互预览'}
                onClick={handleCanvasInteractionToggle}
              >
                {canvasInteractionMode === 'interact' ? <Hand size={16} /> : <MousePointer2 size={16} />}
              </button>
              <label className="toggle-row">
                <input
                  checked={gridEnabled && !meta.documentMode}
                  disabled={meta.documentMode}
                  type="checkbox"
                  onChange={(event) => setGridEnabled(event.target.checked)}
                />
                网格
              </label>
              <div className="canvas-control-cluster canvas-fit-segment" aria-label="画布适配方式">
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
              </div>
              <div className="canvas-control-cluster zoom-control" aria-label="画布缩放">
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
          </div>
          <div ref={editorShellRef} className="editor-shell">
            <div ref={editorHostRef} className={`editor-host${meta.documentMode ? ' is-document-mode' : ''}`} />
            {!meta.documentMode && selectedSlide?.presentationMode === 'fit' && (
              <button
                className="canvas-resize-handle"
                type="button"
                title="拖拽调整页面尺寸"
                style={{
                  left: Math.max(0, renderedCanvasWidth - 108),
                  top: Math.max(0, renderedCanvasHeight - 28)
                }}
                onMouseDown={handleCanvasResizeStart}
              >
                <span>
                  {getSlideCanvasWidth(selectedSlide)} × {getSlideCanvasHeight(selectedSlide)}
                </span>
              </button>
            )}
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
                <strong>{selectedSummary ? selectedSummary.label : selectedCount > 1 ? `已选择 ${selectedCount} 个对象` : '未选择元素'}</strong>
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
              ) : selectedCount > 1 ? (
                <>
                  <dl className="selection-meta">
                    {selectionItems.slice(0, 4).map((item) => (
                      <div key={item.key}>
                        <dt>对象</dt>
                        <dd>{item.label}</dd>
                      </div>
                    ))}
                    {selectionItems.length > 4 && (
                      <div>
                        <dt>更多</dt>
                        <dd>还有 {selectionItems.length - 4} 个对象</dd>
                      </div>
                    )}
                  </dl>
                  <div className="batch-actions" aria-label="多选批量操作">
                    <button type="button" onClick={() => handleAlignSelection('left')}>
                      左对齐
                    </button>
                    <button type="button" onClick={() => handleAlignSelection('center')}>
                      水平居中
                    </button>
                    <button type="button" onClick={() => handleAlignSelection('right')}>
                      右对齐
                    </button>
                    <button type="button" onClick={() => handleAlignSelection('top')}>
                      顶端
                    </button>
                    <button type="button" onClick={() => handleAlignSelection('middle')}>
                      垂直居中
                    </button>
                    <button type="button" onClick={() => handleAlignSelection('bottom')}>
                      底端
                    </button>
                    <button type="button" disabled={!canDistributeSelection} onClick={() => handleDistributeSelection('horizontal')}>
                      水平分布
                    </button>
                    <button type="button" disabled={!canDistributeSelection} onClick={() => handleDistributeSelection('vertical')}>
                      垂直分布
                    </button>
                    <button type="button" disabled={!canGroupSelection} onClick={handleGroupSelection}>
                      组合
                    </button>
                    <button type="button" disabled={!canUngroupSelection} onClick={handleUngroupSelection}>
                      取消组合
                    </button>
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
                    <button type="button" onClick={() => handleMoveSelectionLayer('front')} title="置于顶层">
                      <BringToFront size={15} />
                      顶层
                    </button>
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
            <div className="layer-panel">
              <div className="layer-panel-header">
                <Layers2 size={16} />
                <strong>对象图层</strong>
                <span>{layerItems.length}</span>
              </div>
              {layerItems.length ? (
                <div className="layer-list">
                  {layerItems.map((item) => (
                    <div
                      key={item.key}
                      className={`layer-row${selectedKeys.has(item.key) ? ' is-active' : ''}`}
                      role="button"
                      style={{ paddingLeft: `${10 + item.depth * 16}px` }}
                      tabIndex={0}
                      onClick={(event) => handleSelectLayer(item.key, event.shiftKey || event.metaKey || event.ctrlKey)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') handleSelectLayer(item.key, event.shiftKey || event.metaKey || event.ctrlKey);
                      }}
                    >
                      <span className="layer-row-main">
                        <strong>{item.label}</strong>
                        <small>
                          {item.group ? '组合' : item.tag}
                          {item.hidden ? ' · 已隐藏' : ''}
                        </small>
                      </span>
                      <span className="layer-row-actions" onClick={(event) => event.stopPropagation()}>
                        <button type="button" title={item.hidden ? '显示' : '隐藏'} onClick={() => handleToggleLayerVisibility(item.key)}>
                          {item.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                        <button type="button" title="上移图层" onClick={() => handleMoveLayerOrder(item.key, 'up')}>
                          ↑
                        </button>
                        <button type="button" title="下移图层" onClick={() => handleMoveLayerOrder(item.key, 'down')}>
                          ↓
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-note">当前页还没有可编辑对象</p>
              )}
            </div>
          </div>

          <div className={`page-pane${rightTab !== 'page' ? ' is-hidden' : ''}`}>
            <label>
              项目标题
              <input
                value={meta.title}
                onChange={(event) => {
                  setMeta((current) => ({ ...current, title: event.target.value }));
                  setDirty(true);
                }}
              />
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
                <strong>{saveStatusLabel}</strong>
              </div>
            </div>
            <section className="recent-files">
              <div className="recent-files-title">
                <FileClock size={15} />
                <strong>最近打开</strong>
              </div>
              {recentFiles.length ? (
                recentFiles.slice(0, RECENT_FILE_LIMIT).map((file) => (
                  <button key={file.filePath} type="button" title={file.filePath} onClick={() => handleOpenRecentFile(file.filePath)}>
                    <span>{file.name}</span>
                    <small>{file.filePath}</small>
                  </button>
                ))
              ) : (
                <p>保存或打开 HTML 后会显示在这里</p>
              )}
            </section>
          </div>
        </aside>
      </main>

      <footer className="statusbar">
        <span className={`statusbar-state${dirty ? ' is-dirty' : meta.filePath ? ' is-saved' : ' is-unsaved'}`}>
          <i aria-hidden="true" />
          <span>
            {saveStatusLabel}
            {lastAutoSavedAt ? ` · 已自动保存 ${new Date(lastAutoSavedAt).toLocaleTimeString()}` : ''}
          </span>
        </span>
        <span className="statusbar-tech">
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
                <select
                  value={contextFontValue || customContextFont}
                  onChange={(event) => handleQuickStyleChange('font-family', event.target.value)}
                >
                  <option value="">字体</option>
                  {customContextFont && <option value={customContextFont}>{customContextFont.split(',')[0].replaceAll('"', '')}</option>}
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
          <button type="button" role="menuitem" disabled={!selectedCount} onClick={() => handleAlignSelection('left')}>
            <AlignStartVertical size={15} />
            左对齐
          </button>
          <button type="button" role="menuitem" disabled={!selectedCount} onClick={() => handleAlignSelection('center')}>
            <AlignCenterVertical size={15} />
            水平居中
          </button>
          <button type="button" role="menuitem" disabled={!canGroupSelection} onClick={handleGroupSelection}>
            <Group size={15} />
            组合
          </button>
          <button type="button" role="menuitem" disabled={!canUngroupSelection} onClick={handleUngroupSelection}>
            <Ungroup size={15} />
            取消组合
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
