# Contributing

欢迎参与 HTML Demo Editor 的改进。

## 本地开发

```bash
npm install
npm run dev
```

## 提交前检查

```bash
npm run typecheck
npm run build
```

## 适合优先贡献的方向

- Windows 打包与安装体验
- HTML/AI 生成页面兼容性
- Slide 管理、缩略图和演示模式
- GrapesJS 组件与右侧属性面板
- 图片编辑、图表占位和模板库

## Pull Request 建议

- 一次 PR 尽量只解决一个明确问题。
- 涉及 UI 的改动请附截图或录屏。
- 涉及导入/导出的改动请提供一个可复现的 HTML 示例。
- 提交前请确认 `npm run typecheck` 和 `npm run build` 通过。
