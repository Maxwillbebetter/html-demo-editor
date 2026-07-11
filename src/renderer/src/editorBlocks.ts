import type { Editor } from 'grapesjs';

export const STYLE_SECTORS = [
  {
    name: '布局',
    open: true,
    properties: [
      { property: 'position' },
      { property: 'left' },
      { property: 'top' },
      { property: 'width' },
      { property: 'height' },
      { property: 'z-index' },
      { property: 'display' },
      { property: 'align-items' },
      { property: 'justify-content' }
    ]
  },
  {
    name: '文字',
    open: true,
    properties: [
      { property: 'font-family' },
      { property: 'font-size' },
      { property: 'font-weight' },
      { property: 'line-height' },
      { property: 'letter-spacing' },
      { property: 'color' },
      { property: 'text-align' },
      { property: 'text-decoration' }
    ]
  },
  {
    name: '外观',
    open: true,
    properties: [
      { property: 'background-color' },
      { property: 'border' },
      { property: 'border-radius' },
      { property: 'box-shadow' },
      { property: 'opacity' }
    ]
  },
  {
    name: '间距',
    open: false,
    properties: [
      { property: 'padding' },
      { property: 'padding-top' },
      { property: 'padding-right' },
      { property: 'padding-bottom' },
      { property: 'padding-left' },
      { property: 'margin' },
      { property: 'margin-top' },
      { property: 'margin-right' },
      { property: 'margin-bottom' },
      { property: 'margin-left' }
    ]
  }
];

function placeholderImage(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
    <rect width="640" height="360" fill="#eef3f6"/>
    <rect x="44" y="42" width="552" height="276" rx="16" fill="#dfe8ee"/>
    <circle cx="176" cy="138" r="44" fill="#7db4aa"/>
    <path d="M92 286l132-116 86 74 62-52 176 94H92z" fill="#8aa1b2"/>
    <text x="320" y="326" text-anchor="middle" font-family="Segoe UI, Arial" font-size="24" fill="#536270">Replace Image</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function registerEditorBlocks(editor: Editor): void {
  const bm = editor.BlockManager;
  const imageSrc = placeholderImage();

  bm.add('demo-title', {
    label: '标题',
    category: '基础',
    content:
      '<h1 data-gjs-type="text" style="position:absolute;left:72px;top:72px;width:760px;margin:0;color:#18202b;font-size:56px;line-height:1.08;font-weight:800;">双击编辑标题</h1>'
  });

  bm.add('demo-paragraph', {
    label: '正文',
    category: '基础',
    content:
      '<p data-gjs-type="text" style="position:absolute;left:76px;top:160px;width:620px;margin:0;color:#4f5d6d;font-size:24px;line-height:1.45;">这里是一段正文说明，可以用于解释背景、结论或下一步行动。</p>'
  });

  bm.add('demo-image', {
    label: '图片',
    category: '媒体',
    content: `<img src="${imageSrc}" alt="图片" style="position:absolute;left:720px;top:120px;width:420px;height:250px;object-fit:cover;border-radius:8px;">`
  });

  bm.add('demo-card', {
    label: '卡片',
    category: '模块',
    content:
      '<div style="position:absolute;left:72px;top:210px;width:340px;min-height:210px;padding:28px;border:1px solid #dce4eb;border-radius:8px;background:#ffffff;box-shadow:0 14px 34px rgba(23,37,54,0.08);"><h3 data-gjs-type="text" style="margin:0 0 14px;color:#18202b;font-size:28px;line-height:1.2;">卡片标题</h3><p data-gjs-type="text" style="margin:0;color:#5d6876;font-size:20px;line-height:1.42;">描述一个观点、模块或阶段性结论。</p></div>'
  });

  bm.add('demo-three-columns', {
    label: '三栏布局',
    category: '模块',
    content:
      '<div style="position:absolute;left:72px;top:190px;width:1080px;display:grid;grid-template-columns:repeat(3,1fr);gap:22px;"><div style="padding:24px;border:1px solid #dce4eb;border-radius:8px;background:#ffffff;"><h3 data-gjs-type="text" style="margin:0 0 12px;font-size:25px;color:#18202b;">模块一</h3><p data-gjs-type="text" style="margin:0;color:#5d6876;font-size:19px;line-height:1.4;">填写说明文字。</p></div><div style="padding:24px;border:1px solid #dce4eb;border-radius:8px;background:#ffffff;"><h3 data-gjs-type="text" style="margin:0 0 12px;font-size:25px;color:#18202b;">模块二</h3><p data-gjs-type="text" style="margin:0;color:#5d6876;font-size:19px;line-height:1.4;">填写说明文字。</p></div><div style="padding:24px;border:1px solid #dce4eb;border-radius:8px;background:#ffffff;"><h3 data-gjs-type="text" style="margin:0 0 12px;font-size:25px;color:#18202b;">模块三</h3><p data-gjs-type="text" style="margin:0;color:#5d6876;font-size:19px;line-height:1.4;">填写说明文字。</p></div></div>'
  });

  bm.add('demo-metric', {
    label: '数据指标卡',
    category: '数据',
    content:
      '<div style="position:absolute;left:76px;top:210px;width:300px;padding:28px;border:1px solid #dce4eb;border-radius:8px;background:#f8fafb;"><div data-gjs-type="text" style="color:#007aff;font-size:58px;line-height:1;font-weight:800;">42%</div><div data-gjs-type="text" style="margin-top:12px;color:#596575;font-size:21px;line-height:1.35;">关键指标说明</div></div>'
  });

  bm.add('demo-table', {
    label: '表格',
    category: '数据',
    content:
      '<table style="position:absolute;left:72px;top:180px;width:760px;border-collapse:collapse;font-size:20px;color:#26313f;background:#ffffff;"><thead><tr style="background:#edf4f3;color:#145f56;"><th style="padding:16px;text-align:left;border:1px solid #d6e1e7;">项目</th><th style="padding:16px;text-align:left;border:1px solid #d6e1e7;">当前</th><th style="padding:16px;text-align:left;border:1px solid #d6e1e7;">目标</th></tr></thead><tbody><tr><td style="padding:16px;border:1px solid #d6e1e7;">指标 A</td><td style="padding:16px;border:1px solid #d6e1e7;">128</td><td style="padding:16px;border:1px solid #d6e1e7;">160</td></tr><tr><td style="padding:16px;border:1px solid #d6e1e7;">指标 B</td><td style="padding:16px;border:1px solid #d6e1e7;">76%</td><td style="padding:16px;border:1px solid #d6e1e7;">85%</td></tr></tbody></table>'
  });

  bm.add('demo-quote', {
    label: 'Quote 引用',
    category: '文本',
    content:
      '<blockquote style="position:absolute;left:112px;top:210px;width:880px;margin:0;padding:34px 42px;border-left:8px solid #ff9f0a;background:#fff7ed;color:#333f4e;font-size:30px;line-height:1.38;font-weight:650;">“把 HTML 的表现力留住，把编辑门槛降到 PPT 水平。”</blockquote>'
  });

  bm.add('demo-divider', {
    label: '分割线',
    category: '基础',
    content: '<div style="position:absolute;left:72px;top:360px;width:880px;height:2px;background:#d8e0e7;"></div>'
  });

  bm.add('demo-logo-row', {
    label: 'Logo 区',
    category: '模块',
    content:
      '<div style="position:absolute;left:72px;top:560px;width:720px;display:flex;gap:18px;align-items:center;"><div style="width:132px;height:54px;border:1px solid #dce4eb;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#667386;font-size:18px;background:#ffffff;">LOGO</div><div style="width:132px;height:54px;border:1px solid #dce4eb;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#667386;font-size:18px;background:#ffffff;">LOGO</div><div style="width:132px;height:54px;border:1px solid #dce4eb;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#667386;font-size:18px;background:#ffffff;">LOGO</div></div>'
  });

  bm.add('demo-media-text', {
    label: '图文组合',
    category: '媒体',
    content: `<div style="position:absolute;left:72px;top:160px;width:1080px;display:grid;grid-template-columns:460px 1fr;gap:36px;align-items:center;"><img src="${imageSrc}" alt="图片" style="width:460px;height:290px;object-fit:cover;border-radius:8px;"><div><h3 data-gjs-type="text" style="margin:0 0 16px;color:#18202b;font-size:36px;line-height:1.16;">图文组合标题</h3><p data-gjs-type="text" style="margin:0;color:#596575;font-size:22px;line-height:1.45;">替换图片后，配合右侧属性面板调整圆角、透明度和阴影。</p></div></div>`
  });

  bm.add('demo-timeline', {
    label: '时间线',
    category: '模块',
    content:
      '<div style="position:absolute;left:110px;top:190px;width:980px;display:grid;grid-template-columns:repeat(4,1fr);gap:0;"><div style="border-top:4px solid #007aff;padding-top:20px;"><b data-gjs-type="text" style="font-size:24px;color:#007aff;">Q1</b><p data-gjs-type="text" style="margin:10px 24px 0 0;color:#596575;font-size:19px;line-height:1.35;">需求验证</p></div><div style="border-top:4px solid #ff9f0a;padding-top:20px;"><b data-gjs-type="text" style="font-size:24px;color:#ff9f0a;">Q2</b><p data-gjs-type="text" style="margin:10px 24px 0 0;color:#596575;font-size:19px;line-height:1.35;">MVP 发布</p></div><div style="border-top:4px solid #8e8e93;padding-top:20px;"><b data-gjs-type="text" style="font-size:24px;color:#8e8e93;">Q3</b><p data-gjs-type="text" style="margin:10px 24px 0 0;color:#596575;font-size:19px;line-height:1.35;">模板扩展</p></div><div style="border-top:4px solid #5e5ce6;padding-top:20px;"><b data-gjs-type="text" style="font-size:24px;color:#5e5ce6;">Q4</b><p data-gjs-type="text" style="margin:10px 0 0 0;color:#596575;font-size:19px;line-height:1.35;">AI 辅助</p></div></div>'
  });

  bm.add('demo-bar-chart', {
    label: '柱状图占位',
    category: '数据',
    content:
      '<div style="position:absolute;left:90px;top:170px;width:720px;height:380px;padding:28px;border:1px solid #dce4eb;border-radius:8px;background:#ffffff;"><div data-gjs-type="text" style="font-size:24px;font-weight:700;color:#18202b;">简单柱状图</div><div style="position:absolute;left:54px;right:42px;bottom:46px;height:250px;display:flex;align-items:end;gap:22px;border-left:2px solid #cbd5df;border-bottom:2px solid #cbd5df;padding-left:24px;"><div style="width:72px;height:46%;background:#007aff;border-radius:6px 6px 0 0;"></div><div style="width:72px;height:72%;background:#ff9f0a;border-radius:6px 6px 0 0;"></div><div style="width:72px;height:58%;background:#8e8e93;border-radius:6px 6px 0 0;"></div><div style="width:72px;height:86%;background:#5e5ce6;border-radius:6px 6px 0 0;"></div></div></div>'
  });
}
