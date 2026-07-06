import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { createRegistry } from '../src/imagegen/registry.js';

describe('ProviderRegistry', () => {
  const config = loadConfig({ DATA_DIR: './data' } as NodeJS.ProcessEnv);
  const registry = createRegistry(config);

  it('registers the four built-in providers', () => {
    const ids = registry.list().map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(['mock', 'openai-images', 'stability', 'sd-webui']));
  });

  it('mock provider is always configured, key-based ones are not (without env)', () => {
    const list = registry.list();
    expect(list.find((p) => p.id === 'mock')?.configured).toBe(true);
    expect(list.find((p) => p.id === 'stability')?.configured).toBe(false);
  });

  it('mock provider deterministically generates SVG', async () => {
    const mock = registry.get('mock')!;
    const input = {
      prompt: 'pixel sword icon',
      width: 512,
      height: 512,
      assetType: 'icon' as const,
    };
    const a = await mock.generate(input);
    const b = await mock.generate(input);
    expect(a.format).toBe('svg');
    const svg = a.data.toString('utf8');
    expect(svg).toContain('<svg');
    expect(svg).toContain('width="512"');
    // 同样输入应产出完全一致的结果（确定性）
    expect(svg).toBe(b.data.toString('utf8'));
  });

  it('mock provider varies output across asset types', async () => {
    const mock = registry.get('mock')!;
    const sprite = await mock.generate({
      prompt: 'same prompt',
      width: 256,
      height: 256,
      assetType: 'sprite',
    });
    const texture = await mock.generate({
      prompt: 'same prompt',
      width: 256,
      height: 256,
      assetType: 'texture',
    });
    expect(sprite.data.toString('utf8')).not.toBe(texture.data.toString('utf8'));
  });
});
