import type { AssetType, ProviderCheckResult } from '@gaf/shared';
import type { ImageGenInput, ImageGenResult, ImageProvider } from '../types.js';

/**
 * Mock Provider：零依赖、零密钥的本地 SVG 占位素材生成器。
 * 作用：
 *  1. 让整条多智能体流水线在没有任何 API Key 的机器上可端到端跑通；
 *  2. 作为游戏原型阶段的占位素材（determinstic：同样的提示词得到同样的图）。
 */
export class MockProvider implements ImageProvider {
  readonly id = 'mock';
  readonly label = '内置占位生成器 (Mock)';
  readonly requires: string[] = [];
  readonly models = ['mock-svg-v1'];
  readonly defaultModel = 'mock-svg-v1';
  readonly supportsNegativePrompt = false;
  readonly outputFormat = 'svg';
  readonly note = '无需密钥，本地确定性生成 SVG 占位素材，用于体验流程与原型开发';

  isConfigured(): boolean {
    return true;
  }

  async generate(input: ImageGenInput): Promise<ImageGenResult> {
    const seed = input.seed ?? fnv1a(input.prompt);
    const svg = renderSvg(input.assetType ?? 'concept', input.width, input.height, seed);
    return { data: Buffer.from(svg, 'utf8'), format: 'svg', model: this.defaultModel };
  }

  async healthCheck(): Promise<ProviderCheckResult> {
    return { ok: true, message: '内置占位生成器随时可用（无需密钥）', latencyMs: 0 };
  }
}

// ---------- 确定性随机 ----------

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Palette {
  bg1: string;
  bg2: string;
  main: string;
  accent: string;
  light: string;
  dark: string;
}

function makePalette(rng: () => number): Palette {
  const hue = Math.floor(rng() * 360);
  const accentHue = (hue + 120 + Math.floor(rng() * 120)) % 360;
  return {
    bg1: `hsl(${hue}, 32%, 16%)`,
    bg2: `hsl(${(hue + 30) % 360}, 38%, 26%)`,
    main: `hsl(${hue}, 68%, 56%)`,
    accent: `hsl(${accentHue}, 72%, 60%)`,
    light: `hsl(${hue}, 60%, 78%)`,
    dark: `hsl(${hue}, 40%, 10%)`,
  };
}

// ---------- 分类型绘制 ----------

function renderSvg(type: AssetType, w: number, h: number, seed: number): string {
  const rng = mulberry32(seed);
  const p = makePalette(rng);
  const body = (() => {
    switch (type) {
      case 'sprite':
        return sprite(w, h, rng, p);
      case 'icon':
        return icon(w, h, rng, p);
      case 'texture':
        return texture(w, h, rng, p);
      case 'background':
        return background(w, h, rng, p);
      case 'ui':
        return ui(w, h, rng, p);
      case 'concept':
      default:
        return concept(w, h, rng, p);
    }
  })();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
}

/** 镜像随机网格 —— 经典 invader 风格的像素精灵 */
function sprite(w: number, h: number, rng: () => number, p: Palette): string {
  const grid = 12;
  const size = Math.min(w, h) * 0.72;
  const cell = size / grid;
  const ox = (w - size) / 2;
  const oy = (h - size) / 2;
  const cells: string[] = [];
  for (let y = 0; y < grid; y++) {
    for (let x = 0; x < grid / 2; x++) {
      const r = rng();
      if (r < 0.42) continue;
      const color = r > 0.85 ? p.accent : r > 0.6 ? p.main : p.light;
      const draw = (cx: number) =>
        cells.push(
          `<rect x="${(ox + cx * cell).toFixed(1)}" y="${(oy + y * cell).toFixed(1)}" width="${cell.toFixed(1)}" height="${cell.toFixed(1)}" fill="${color}"/>`,
        );
      draw(x);
      draw(grid - 1 - x);
    }
  }
  return [
    `<rect width="${w}" height="${h}" fill="${p.dark}"/>`,
    `<rect x="${ox - cell}" y="${oy - cell}" width="${size + cell * 2}" height="${size + cell * 2}" fill="${p.bg1}" rx="${cell}"/>`,
    ...cells,
  ].join('');
}

function icon(w: number, h: number, rng: () => number, p: Palette): string {
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) * 0.32;
  const shapes = ['star', 'diamond', 'hex', 'circle'] as const;
  const shape = shapes[Math.floor(rng() * shapes.length)];
  let inner = '';
  if (shape === 'star') {
    inner = `<path d="${starPath(cx, cy, r, r * 0.45, 5)}" fill="${p.accent}" stroke="${p.light}" stroke-width="${r * 0.06}"/>`;
  } else if (shape === 'diamond') {
    inner = `<path d="M ${cx} ${cy - r} L ${cx + r * 0.75} ${cy} L ${cx} ${cy + r} L ${cx - r * 0.75} ${cy} Z" fill="${p.accent}" stroke="${p.light}" stroke-width="${r * 0.06}"/>`;
  } else if (shape === 'hex') {
    inner = `<path d="${polygonPath(cx, cy, r, 6)}" fill="${p.accent}" stroke="${p.light}" stroke-width="${r * 0.06}"/>`;
  } else {
    inner = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${p.accent}" stroke="${p.light}" stroke-width="${r * 0.06}"/>`;
  }
  const pad = Math.min(w, h) * 0.06;
  return [
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.bg2}"/><stop offset="1" stop-color="${p.bg1}"/></linearGradient></defs>`,
    `<rect x="${pad}" y="${pad}" width="${w - pad * 2}" height="${h - pad * 2}" rx="${Math.min(w, h) * 0.14}" fill="url(#g)" stroke="${p.main}" stroke-width="${pad * 0.5}"/>`,
    inner,
    `<circle cx="${cx - r * 0.35}" cy="${cy - r * 0.4}" r="${r * 0.16}" fill="#ffffff" opacity="0.55"/>`,
  ].join('');
}

function texture(w: number, h: number, rng: () => number, p: Palette): string {
  const cols = 8;
  const rows = 8;
  const cw = w / cols;
  const ch = h / rows;
  const useCircle = rng() > 0.5;
  const parts: string[] = [`<rect width="${w}" height="${h}" fill="${p.bg1}"/>`];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const even = (x + y) % 2 === 0;
      const fill = even ? p.bg2 : p.main;
      if (useCircle) {
        parts.push(
          `<circle cx="${(x + 0.5) * cw}" cy="${(y + 0.5) * ch}" r="${Math.min(cw, ch) * (even ? 0.34 : 0.22)}" fill="${fill}" opacity="0.9"/>`,
        );
      } else {
        const mx = (x + 0.5) * cw;
        const my = (y + 0.5) * ch;
        parts.push(
          `<path d="M ${mx} ${my - ch * 0.4} L ${mx + cw * 0.4} ${my} L ${mx} ${my + ch * 0.4} L ${mx - cw * 0.4} ${my} Z" fill="${fill}" opacity="0.9"/>`,
        );
      }
    }
  }
  return parts.join('');
}

function background(w: number, h: number, rng: () => number, p: Palette): string {
  const parts: string[] = [
    `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.bg2}"/><stop offset="1" stop-color="${p.bg1}"/></linearGradient></defs>`,
    `<rect width="${w}" height="${h}" fill="url(#sky)"/>`,
    `<circle cx="${w * (0.2 + rng() * 0.6)}" cy="${h * (0.15 + rng() * 0.2)}" r="${Math.min(w, h) * 0.09}" fill="${p.light}" opacity="0.9"/>`,
  ];
  // 三层山峦
  for (let layer = 0; layer < 3; layer++) {
    const baseY = h * (0.55 + layer * 0.14);
    const points: string[] = [`0,${h}`, `0,${baseY}`];
    const segments = 5 + layer * 2;
    for (let i = 1; i <= segments; i++) {
      const px = (w / segments) * i;
      const py = baseY - rng() * h * (0.18 - layer * 0.04);
      points.push(`${px.toFixed(0)},${py.toFixed(0)}`);
    }
    points.push(`${w},${h}`);
    const opacity = 0.5 + layer * 0.25;
    parts.push(
      `<polygon points="${points.join(' ')}" fill="${p.main}" opacity="${opacity.toFixed(2)}"/>`,
    );
  }
  parts.push(`<rect y="${h * 0.92}" width="${w}" height="${h * 0.08}" fill="${p.dark}"/>`);
  return parts.join('');
}

function ui(w: number, h: number, rng: () => number, p: Palette): string {
  const pad = Math.min(w, h) * 0.08;
  const r = Math.min(w, h) * 0.12;
  const withRivets = rng() > 0.4;
  const parts = [
    `<rect width="${w}" height="${h}" fill="${p.dark}"/>`,
    `<defs><linearGradient id="panel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.bg2}"/><stop offset="1" stop-color="${p.bg1}"/></linearGradient></defs>`,
    `<rect x="${pad}" y="${pad}" width="${w - pad * 2}" height="${h - pad * 2}" rx="${r}" fill="url(#panel)" stroke="${p.main}" stroke-width="${pad * 0.45}"/>`,
    `<rect x="${pad * 2.2}" y="${pad * 2.2}" width="${(w - pad * 4.4) * 0.6}" height="${pad * 0.8}" rx="${pad * 0.4}" fill="${p.light}" opacity="0.8"/>`,
    `<rect x="${pad * 2.2}" y="${pad * 3.6}" width="${(w - pad * 4.4) * 0.85}" height="${pad * 0.5}" rx="${pad * 0.25}" fill="${p.main}" opacity="0.6"/>`,
  ];
  if (withRivets) {
    for (const [cx, cy] of [
      [pad * 1.6, pad * 1.6],
      [w - pad * 1.6, pad * 1.6],
      [pad * 1.6, h - pad * 1.6],
      [w - pad * 1.6, h - pad * 1.6],
    ]) {
      parts.push(`<circle cx="${cx}" cy="${cy}" r="${pad * 0.35}" fill="${p.accent}"/>`);
    }
  }
  return parts.join('');
}

function concept(w: number, h: number, rng: () => number, p: Palette): string {
  const parts = [
    `<defs><linearGradient id="cbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.bg1}"/><stop offset="1" stop-color="${p.bg2}"/></linearGradient></defs>`,
    `<rect width="${w}" height="${h}" fill="url(#cbg)"/>`,
  ];
  const blobs = 4 + Math.floor(rng() * 4);
  for (let i = 0; i < blobs; i++) {
    const cx = rng() * w;
    const cy = rng() * h;
    const r = Math.min(w, h) * (0.08 + rng() * 0.22);
    const color = [p.main, p.accent, p.light][Math.floor(rng() * 3)];
    parts.push(
      `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${r.toFixed(0)}" fill="${color}" opacity="${(0.18 + rng() * 0.3).toFixed(2)}"/>`,
    );
  }
  parts.push(
    `<path d="M 0 ${h * 0.75} Q ${w * 0.35} ${h * (0.55 + rng() * 0.2)} ${w * 0.6} ${h * 0.72} T ${w} ${h * 0.68} L ${w} ${h} L 0 ${h} Z" fill="${p.dark}" opacity="0.85"/>`,
  );
  return parts.join('');
}

// ---------- 几何工具 ----------

function starPath(cx: number, cy: number, outer: number, inner: number, points: number): string {
  const step = Math.PI / points;
  let d = '';
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const angle = i * step - Math.PI / 2;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    d += `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)} `;
  }
  return `${d}Z`;
}

function polygonPath(cx: number, cy: number, r: number, sides: number): string {
  let d = '';
  for (let i = 0; i < sides; i++) {
    const angle = (i * 2 * Math.PI) / sides - Math.PI / 2;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    d += `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)} `;
  }
  return `${d}Z`;
}
