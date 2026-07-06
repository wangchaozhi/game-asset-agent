import { describe, expect, it } from 'vitest';
import type { GenerationRequest } from '@gaf/shared';
import { fallbackPlan, planAssets } from '../src/agents/director.js';
import type { LlmClient } from '../src/llm/types.js';

const request: GenerationRequest = {
  brief: '森林小怪物',
  assetType: 'sprite',
  style: 'cartoon',
  count: 3,
  width: 1024,
  height: 1024,
  provider: 'mock',
  maxRetries: 0,
};

describe('fallbackPlan', () => {
  it('produces exactly count items with distinct descriptions', () => {
    const items = fallbackPlan(request);
    expect(items).toHaveLength(3);
    expect(new Set(items.map((i) => i.description)).size).toBe(3);
  });
});

describe('planAssets', () => {
  it('uses LLM plan when JSON array is valid', async () => {
    const fake: LlmClient = {
      provider: 'fake',
      model: 'fake-1',
      supportsVision: false,
      complete: async () =>
        JSON.stringify([
          { name: '苔藓怪', description: 'moss covered forest creature' },
          { name: '菌菇怪', description: 'mushroom cap goblin' },
          { name: '树枝怪', description: 'twig limbed sprite creature' },
        ]),
    };
    const { items, usedLlm } = await planAssets(request, fake);
    expect(usedLlm).toBe(true);
    expect(items).toHaveLength(3);
    expect(items[0].name).toBe('苔藓怪');
  });

  it('pads LLM plan when it returns fewer items than requested', async () => {
    const fake: LlmClient = {
      provider: 'fake',
      model: 'fake-1',
      supportsVision: false,
      complete: async () => JSON.stringify([{ name: '独苗', description: 'only one idea' }]),
    };
    const { items } = await planAssets(request, fake);
    expect(items).toHaveLength(3);
  });

  it('falls back when llm is null', async () => {
    const { items, usedLlm } = await planAssets(request, null);
    expect(usedLlm).toBe(false);
    expect(items).toHaveLength(3);
  });
});
