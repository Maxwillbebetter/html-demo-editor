# HTML Demo Editor

面向 AI 生成汇报材料的本地 HTML 演示编辑器 MVP。

HTML Demo Editor 是一个开源的 Windows 桌面工具，目标是让 AI 生成的 HTML 汇报材料像 PPT 一样可编辑、可拖拽、可全屏播放。

## 技术路线

- Electron + React + TypeScript：Windows 11 桌面应用壳、本地文件读写、全屏演示窗口。
- GrapesJS：可视化选中、拖拽、文本编辑、块组件、样式面板、图层管理和 HTML/CSS 输出。
- 自定义 slide 运行时：导出标准 HTML，按 `section.deck-slide` 翻页播放，支持方向键、页码、黑屏/白屏。

## 已覆盖的 MVP 能力

- 新建项目、打开单个 HTML、打开包含 `index.html` 的文件夹。
- 自动识别 `section` / reveal.js 风格 slide / 已导出的 `deck-slide`。
- 页面缩略图列表、新增、复制、删除、重命名、拖拽排序。
- GrapesJS 画布中直接编辑文字、拖拽组件、调整样式。
- 左侧演示材料组件库：标题、正文、图片、卡片、三栏、指标卡、表格、引用、分割线、Logo、图文、时间线、柱状图占位。
- 右侧属性、图层、页面面板。
- 图片替换为 data URL，便于导出独立 HTML。
- 高级 HTML/CSS 代码视图。
- 保存为 HTML、另存为、导出独立文件夹。
- 全屏演示和窗口预览。

## 适合谁用

- 需要快速制作汇报材料的业务、市场、产品、战略人员。
- 会让 AI 生成 HTML 页面，但不想打开 VS Code 或 DevTools 修改的人。
- 想把 HTML 当作演示材料现场播放、现场微调的人。

## 最方便的 Windows 用法

如果只是给业务同事使用，优先发免安装版：

- `HTML-Demo-Editor-0.1.0-Portable.exe`：双击直接打开，不需要安装。
- `HTML-Demo-Editor-0.1.0-Setup.exe`：安装到 Windows 后再使用。

这两个文件都会在 Windows 打包后出现在 `release/` 目录。

## 一键打包给 Windows

### 方式 1：在 Windows 本机双击打包

先安装 [Node.js 22 LTS](https://nodejs.org/)，然后双击项目根目录里的：

```text
build-windows.bat
```

脚本会自动安装依赖、构建应用，并在 `release/` 输出安装版和免安装版。

### 方式 2：用 GitHub 自动打包

把项目上传到 GitHub 后，进入仓库的 `Actions` 页面，运行 `Build Windows` workflow。

构建完成后，在 workflow 结果页下载 `html-demo-editor-windows` artifact，里面就是 Windows 可用的安装包和免安装版。

这种方式最省心：本机不需要装 Electron 打包环境，也不需要手敲命令。

## 开发命令

```bash
npm install
npm run dev
```

## 验证命令

```bash
npm run typecheck
npm run build
npm audit --omit=dev
```

## Windows 打包

```bash
npm run dist:win
```

打包产物会输出到 `release/`，包含：

- `HTML-Demo-Editor-0.1.0-Setup.exe`
- `HTML-Demo-Editor-0.1.0-Portable.exe`

## 开源许可

本项目采用 MIT License。欢迎 fork、改进和二次开发。
