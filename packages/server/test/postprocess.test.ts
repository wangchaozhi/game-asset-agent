import { mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { GenerationRequest } from '@gaf/shared';
import type { ImageGenResult } from '../src/imagegen/types.js';
import { getPostprocessStatus, postprocessAsset } from '../src/postprocess/index.js';
import { FileStorage } from '../src/storage/files.js';

function request(postprocess?: GenerationRequest['postprocess']): GenerationRequest {
  return {
    brief: 'test icon',
    assetType: 'icon',
    style: 'pixel-art',
    count: 1,
    width: 64,
    height: 64,
    provider: 'mock',
    maxRetries: 0,
    postprocess,
  };
}

const svgResult: ImageGenResult = {
  data: Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#f00"/></svg>',
    'utf8',
  ),
  format: 'svg',
  model: 'mock-svg-v1',
};

describe('postprocessAsset', () => {
  it('does nothing when postprocess is not requested', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'gaf-postprocess-'));
    const storage = new FileStorage(dir);
    await storage.init();

    const result = await postprocessAsset({
      assetId: 'asset-1',
      request: request(),
      result: svgResult,
      storage,
    });

    expect(result.variants).toHaveLength(0);
    expect(result.skippedReason).toBeUndefined();
  });

  it('generates a scaled PNG variant when sharp is available', async () => {
    const status = await getPostprocessStatus();
    if (!status.available) return;

    const dir = await mkdtemp(path.join(tmpdir(), 'gaf-postprocess-'));
    const storage = new FileStorage(dir);
    await storage.init();

    const result = await postprocessAsset({
      assetId: 'asset-2',
      request: request({ variants: [0.5], format: 'png' }),
      result: svgResult,
      storage,
    });

    expect(result.skippedReason).toBeUndefined();
    expect(result.variants).toHaveLength(1);
    expect(result.variants[0]).toMatchObject({
      label: '@0.5x png',
      width: 32,
      height: 32,
      format: 'png',
    });
    await expect(stat(storage.resolve(result.variants[0].fileName))).resolves.toBeTruthy();
  });
});
