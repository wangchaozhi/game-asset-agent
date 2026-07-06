import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Job } from '@gaf/shared';
import { Store } from '../src/db/store.js';

function sampleJob(id: string): Job {
  const now = Date.now();
  return {
    id,
    status: 'queued',
    request: {
      brief: 'test',
      assetType: 'icon',
      style: 'pixel-art',
      count: 1,
      width: 512,
      height: 512,
      provider: 'mock',
      maxRetries: 0,
    },
    progress: [],
    assetIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

describe('Store', () => {
  it('persists jobs and reloads them in a fresh instance', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'gaf-store-'));
    const file = path.join(dir, 'db.json');

    const store = new Store(file);
    await store.init();
    store.createJob(sampleJob('job-1'));
    store.updateJob('job-1', (j) => {
      j.status = 'completed';
    });
    await store.flush();

    const reloaded = new Store(file);
    await reloaded.init();
    expect(reloaded.getJob('job-1')?.status).toBe('completed');
  });

  it('deleteAsset also detaches the asset from its job', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'gaf-store-'));
    const store = new Store(path.join(dir, 'db.json'));
    await store.init();

    store.createJob(sampleJob('job-2'));
    store.addAsset({
      id: 'asset-1',
      jobId: 'job-2',
      name: 'a',
      assetType: 'icon',
      style: 'pixel-art',
      prompt: 'p',
      provider: 'mock',
      model: 'mock-svg-v1',
      width: 512,
      height: 512,
      format: 'svg',
      fileName: 'asset-1.svg',
      fileSize: 10,
      createdAt: Date.now(),
    });
    store.updateJob('job-2', (j) => j.assetIds.push('asset-1'));

    store.deleteAsset('asset-1');
    expect(store.getAsset('asset-1')).toBeUndefined();
    expect(store.getJob('job-2')?.assetIds).toHaveLength(0);
  });

  it('starts empty when db file is corrupted', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'gaf-store-'));
    const file = path.join(dir, 'db.json');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(file, 'not-json{{{', 'utf8');

    const store = new Store(file);
    await store.init();
    expect(store.listJobs()).toHaveLength(0);
  });
});
