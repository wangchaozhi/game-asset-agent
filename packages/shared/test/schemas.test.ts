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
