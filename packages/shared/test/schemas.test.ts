import { describe, expect, it } from 'vitest';
import { createJobSchema, getStylePreset, ASSET_TYPE_META, STYLE_PRESETS } from '../src/index.js';

describe('createJobSchema', () => {
  it('applies defaults for optional numeric fields', () => {
    const parsed = createJobSchema.parse({
      brief: '一把火焰魔法剑',
      assetType: 'icon',
      style: 'pixel-art',
      provider: 'mock',
    });
    expect(parsed.count).toBe(1);
    expect(parsed.width).toBe(1024);
    expect(parsed.maxRetries).toBe(1);
  });

  it('rejects out-of-range count', () => {
    const result = createJobSchema.safeParse({
      brief: '一把火焰魔法剑',
      assetType: 'icon',
      style: 'pixel-art',
      provider: 'mock',
      count: 99,
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty brief', () => {
    const result = createJobSchema.safeParse({
      brief: ' ',
      assetType: 'icon',
      style: 'pixel-art',
      provider: 'mock',
    });
    expect(result.success).toBe(false);
  });

  it('accepts postprocess variants and output format', () => {
    const parsed = createJobSchema.parse({
      brief: '一把火焰魔法剑',
      assetType: 'icon',
      style: 'pixel-art',
      provider: 'mock',
      postprocess: { variants: [0.5, 2], format: 'webp' },
    });
    expect(parsed.postprocess).toEqual({ variants: [0.5, 2], format: 'webp' });
  });

  it('normalizes draft postprocess fields for compatibility', () => {
    const parsed = createJobSchema.parse({
      brief: '一把火焰魔法剑',
      assetType: 'icon',
      style: 'pixel-art',
      provider: 'mock',
      postprocess: { scales: [0.5], webp: true },
    });
    expect(parsed.postprocess).toEqual({ variants: [0.5], format: 'webp' });
  });

  it('accepts audio jobs with sfx/bgm asset types', () => {
    const parsed = createJobSchema.parse({
      brief: '金属剑刃挥砍声',
      kind: 'audio',
      assetType: 'sfx',
      style: 'game-audio',
      provider: 'mock-audio',
      durationSeconds: 2,
    });
    expect(parsed.kind).toBe('audio');
    expect(parsed.assetType).toBe('sfx');
  });

  it('rejects audio kind with an image asset type', () => {
    const result = createJobSchema.safeParse({
      brief: '金属剑刃挥砍声',
      kind: 'audio',
      assetType: 'sprite',
      style: 'game-audio',
      provider: 'mock-audio',
    });
    expect(result.success).toBe(false);
  });

  it('rejects image kind with an audio asset type', () => {
    const result = createJobSchema.safeParse({
      brief: '一把火焰魔法剑',
      kind: 'image',
      assetType: 'bgm',
      style: 'pixel-art',
      provider: 'mock',
    });
    expect(result.success).toBe(false);
  });

  it('defaults kind to image', () => {
    const parsed = createJobSchema.parse({
      brief: '一把火焰魔法剑',
      assetType: 'icon',
      style: 'pixel-art',
      provider: 'mock',
    });
    expect(parsed.kind).toBe('image');
  });
});

describe('presets', () => {
  it('every style preset has keywords and negatives', () => {
    for (const preset of STYLE_PRESETS) {
      expect(preset.keywords.length).toBeGreaterThan(0);
      expect(preset.negative.length).toBeGreaterThan(0);
    }
  });

  it('getStylePreset returns undefined for unknown id', () => {
    expect(getStylePreset('does-not-exist')).toBeUndefined();
  });

  it('asset type meta covers prompt templates with {desc} slot', () => {
    for (const meta of Object.values(ASSET_TYPE_META)) {
      expect(meta.promptTemplate).toContain('{desc}');
    }
  });
});
