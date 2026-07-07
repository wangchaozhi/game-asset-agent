import { describe, expect, it } from 'vitest';
import { composeSpritesheet, getPostprocessStatus } from '../src/postprocess/index.js';

/** 生成一张纯色 PNG 供合成测试（不同颜色便于确认帧存在） */
async function solidPng(color: { r: number; g: number; b: number }, size = 32): Promise<Buffer> {
  const sharpMod = (await import('sharp')).default;
  return sharpMod({
    create: { width: size, height: size, channels: 4, background: { ...color, alpha: 1 } },
  })
    .png()
    .toBuffer();
}

describe('composeSpritesheet', () => {
  it('returns null for fewer than 2 frames', async () => {
    const status = await getPostprocessStatus();
    if (!status.available) return;
    const one = await solidPng({ r: 255, g: 0, b: 0 });
    expect(await composeSpritesheet([one], 'sheet.png')).toBeNull();
  });

  it('composes frames into a grid with a TexturePacker-style atlas', async () => {
    const status = await getPostprocessStatus();
    if (!status.available) return;
    const frames = await Promise.all([
      solidPng({ r: 255, g: 0, b: 0 }),
      solidPng({ r: 0, g: 255, b: 0 }),
      solidPng({ r: 0, g: 0, b: 255 }),
    ]);
    const result = await composeSpritesheet(frames, 'sheet.png');
    expect(result).not.toBeNull();
    expect(result!.frameCount).toBe(3);
    expect(result!.frameWidth).toBe(32);
    expect(result!.frameHeight).toBe(32);
    // 3 帧 → 2 列 2 行网格
    expect(result!.columns).toBe(2);
    expect(result!.rows).toBe(2);
    const atlas = result!.atlas as { frames: Record<string, unknown>; meta: { image: string } };
    expect(Object.keys(atlas.frames)).toHaveLength(3);
    expect(atlas.meta.image).toBe('sheet.png');
  });
});
