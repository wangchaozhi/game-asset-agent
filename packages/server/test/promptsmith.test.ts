import { describe, expect, it } from 'vitest';
import type { GenerationRequest } from '@gaf/shared';
import { buildPrompt, buildPromptFallback } from '../src/agents/promptsmith.js';
import type { LlmClient } from '../src/llm/types.js';

const baseRequest: GenerationRequest = {
  brief: '一把火焰魔法剑',
  assetType: 'icon',
  style: 'pixel-art',
  count: 1,
  width: 512,
  height: 512,
  provider: 'mock',
  maxRetries: 1,
};

const item = { name: '火焰剑', description: 'a flaming magic sword with ember particles' };

describe('buildPromptFallback', () => {
  it('composes template + style keywords + description', () => {
    const built = buildPromptFallback(item, baseRequest);
    expect(built.prompt).toContain('a flaming magic sword');
    expect(built.prompt).toContain('pixel art');
    expect(built.prompt).toContain('game icon');
    expect(built.negativePrompt).toContain('blurry');
  });

  it('merges user negative prompt', () => {
    const built = buildPromptFallback(item, { ...baseRequest, negativePrompt: 'no skulls' });
    expect(built.negativePrompt).toContain('no skulls');
  });

  it('degrades gracefully for unknown style id', () => {
    const built = buildPromptFallback(item, { ...baseRequest, style: 'my-custom-style' });
    expect(built.prompt).toContain('my-custom-style');
  });
});

describe('buildPrompt with LLM', () => {
  it('uses LLM output when valid JSON is returned', async () => {
    const fake: LlmClient = {
      provider: 'fake',
      model: 'fake-1',
      supportsVision: false,
      complete: async () =>
        '```json\n{"prompt": "optimized sword prompt", "negativePrompt": "bad things"}\n```',
    };
    const built = await buildPrompt(item, baseRequest, fake);
    expect(built.usedLlm).toBe(true);
    expect(built.prompt).toBe('optimized sword prompt');
    expect(built.negativePrompt).toBe('bad things');
  });

  it('falls back to template when LLM throws', async () => {
    const broken: LlmClient = {
      provider: 'fake',
      model: 'fake-1',
      supportsVision: false,
      complete: async () => {
        throw new Error('boom');
      },
    };
    const built = await buildPrompt(item, baseRequest, broken);
    expect(built.usedLlm).toBe(false);
    expect(built.prompt).toContain('pixel art');
  });

  it('falls back when LLM returns garbage', async () => {
    const garbage: LlmClient = {
      provider: 'fake',
      model: 'fake-1',
      supportsVision: false,
      complete: async () => 'sorry I cannot do that',
    };
    const built = await buildPrompt(item, baseRequest, garbage);
    expect(built.usedLlm).toBe(false);
  });
});
