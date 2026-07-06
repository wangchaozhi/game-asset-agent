import type { AssetType } from './types.js';

/** 美术风格预设：提示词关键词 + 负向词，供提示词工程师智能体使用 */
export interface StylePreset {
  id: string;
  label: string;
  labelEn: string;
  keywords: string[];
  negative: string[];
}

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: 'pixel-art',
    label: '像素风',
    labelEn: 'Pixel Art',
    keywords: ['pixel art', '16-bit retro game style', 'crisp pixels', 'limited color palette'],
    negative: ['blurry', 'photorealistic', 'smooth gradients'],
  },
  {
    id: 'cartoon',
    label: '卡通',
    labelEn: 'Cartoon',
    keywords: ['cartoon style', 'bold outlines', 'vibrant flat colors', 'playful'],
    negative: ['photorealistic', 'gritty', 'muted colors'],
  },
  {
    id: 'chibi',
    label: 'Q版',
    labelEn: 'Chibi',
    keywords: ['chibi style', 'cute', 'big head small body', 'kawaii game art'],
    negative: ['realistic proportions', 'horror', 'gritty'],
  },
  {
    id: 'flat-vector',
    label: '扁平矢量',
    labelEn: 'Flat Vector',
    keywords: ['flat vector illustration', 'clean geometric shapes', 'minimal shading'],
    negative: ['3d render', 'photorealistic', 'noisy texture'],
  },
  {
    id: 'watercolor',
    label: '水彩',
    labelEn: 'Watercolor',
    keywords: ['watercolor painting', 'soft edges', 'hand painted', 'gentle color wash'],
    negative: ['hard outlines', '3d render', 'neon colors'],
  },
  {
    id: 'low-poly',
    label: '低多边形',
    labelEn: 'Low Poly',
    keywords: ['low poly 3d style', 'faceted geometry', 'stylized render'],
    negative: ['photorealistic', 'high detail texture', 'blurry'],
  },
  {
    id: 'dark-fantasy',
    label: '暗黑幻想',
    labelEn: 'Dark Fantasy',
    keywords: ['dark fantasy art', 'dramatic lighting', 'ominous atmosphere', 'detailed'],
    negative: ['cute', 'bright cheerful colors', 'flat shading'],
  },
  {
    id: 'cyberpunk',
    label: '赛博朋克',
    labelEn: 'Cyberpunk',
    keywords: ['cyberpunk style', 'neon lights', 'futuristic', 'high tech low life'],
    negative: ['medieval', 'pastel colors', 'watercolor'],
  },
  {
    id: 'hand-drawn',
    label: '手绘',
    labelEn: 'Hand Drawn',
    keywords: ['hand drawn illustration', 'sketchy linework', 'organic texture'],
    negative: ['3d render', 'photorealistic', 'vector clean lines'],
  },
  {
    id: 'realistic',
    label: '写实',
    labelEn: 'Realistic',
    keywords: ['realistic digital painting', 'detailed rendering', 'cinematic lighting'],
    negative: ['cartoon', 'pixel art', 'flat colors'],
  },
];

export function getStylePreset(id: string): StylePreset | undefined {
  return STYLE_PRESETS.find((p) => p.id === id);
}

/** 素材类型的展示信息与提示词模板 */
export interface AssetTypeMeta {
  label: string;
  labelEn: string;
  /** {desc} 会被替换为素材描述 */
  promptTemplate: string;
  extraNegative: string[];
  defaultSize: { width: number; height: number };
}

export const ASSET_TYPE_META: Record<AssetType, AssetTypeMeta> = {
  sprite: {
    label: '角色 / 物体精灵',
    labelEn: 'Sprite',
    promptTemplate:
      'game sprite of {desc}, full body, centered composition, plain solid background, game asset',
    extraNegative: ['cropped', 'cluttered background', 'multiple subjects'],
    defaultSize: { width: 1024, height: 1024 },
  },
  icon: {
    label: '图标',
    labelEn: 'Icon',
    promptTemplate:
      'game icon of {desc}, centered emblem, bold silhouette, simple background, game UI asset',
    extraNegative: ['text', 'watermark', 'cluttered detail'],
    defaultSize: { width: 512, height: 512 },
  },
  texture: {
    label: '无缝贴图',
    labelEn: 'Seamless Texture',
    promptTemplate:
      'seamless tileable texture of {desc}, top-down view, uniform lighting, repeating pattern, game texture',
    extraNegative: ['visible seams', 'vignette', 'perspective distortion'],
    defaultSize: { width: 1024, height: 1024 },
  },
  background: {
    label: '场景背景',
    labelEn: 'Background',
    promptTemplate:
      'game background environment of {desc}, wide establishing shot, layered depth, no characters',
    extraNegative: ['characters', 'text', 'UI elements'],
    defaultSize: { width: 1536, height: 1024 },
  },
  ui: {
    label: 'UI 元素',
    labelEn: 'UI Element',
    promptTemplate:
      'game UI element, {desc}, clean edges, polished game interface asset, simple background',
    extraNegative: ['photorealistic scene', 'busy background', 'text paragraphs'],
    defaultSize: { width: 768, height: 512 },
  },
  concept: {
    label: '概念原画',
    labelEn: 'Concept Art',
    promptTemplate:
      'game concept art of {desc}, detailed illustration, professional concept design',
    extraNegative: ['low effort', 'watermark'],
    defaultSize: { width: 1536, height: 1024 },
  },
};

export const ASSET_TYPES = Object.keys(ASSET_TYPE_META) as AssetType[];
