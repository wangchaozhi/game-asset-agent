import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { createAudioRegistry } from '../src/audiogen/registry.js';
import { MockAudioProvider } from '../src/audiogen/providers/mockAudio.js';

describe('AudioProviderRegistry', () => {
  const config = loadConfig({ DATA_DIR: './data' } as NodeJS.ProcessEnv);
  const registry = createAudioRegistry(config);

  it('registers built-in audio providers', () => {
    const ids = registry.list().map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(['mock-audio', 'elevenlabs', 'stable-audio']));
  });

  it('mock audio provider is always configured, key-based ones are not', () => {
    const list = registry.list();
    expect(list.find((p) => p.id === 'mock-audio')?.configured).toBe(true);
    expect(list.find((p) => p.id === 'elevenlabs')?.configured).toBe(false);
  });
});

describe('MockAudioProvider', () => {
  const provider = new MockAudioProvider();

  it('produces a valid WAV with RIFF/WAVE header', async () => {
    const result = await provider.generate({
      prompt: 'sword slash',
      kind: 'sfx',
      durationSeconds: 1,
    });
    expect(result.format).toBe('wav');
    expect(result.data.toString('ascii', 0, 4)).toBe('RIFF');
    expect(result.data.toString('ascii', 8, 12)).toBe('WAVE');
    // 44 字节头 + 44100 采样 * 2 字节（1s 单声道 16-bit）
    expect(result.data.byteLength).toBe(44 + 44100 * 2);
  });

  it('is deterministic for the same prompt and varies by kind', async () => {
    const a = await provider.generate({ prompt: 'coin pickup', kind: 'sfx', durationSeconds: 1 });
    const b = await provider.generate({ prompt: 'coin pickup', kind: 'sfx', durationSeconds: 1 });
    const bgm = await provider.generate({ prompt: 'coin pickup', kind: 'bgm', durationSeconds: 1 });
    expect(a.data.equals(b.data)).toBe(true);
    expect(a.data.equals(bgm.data)).toBe(false);
  });
});
