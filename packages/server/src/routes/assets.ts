import type { FastifyInstance } from 'fastify';
import type { AssetRecord } from '@gaf/shared';
import type { AppContext } from '../context.js';
import { sendAssetsZip } from './exportZip.js';

export function registerAssetRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { store, storage } = ctx;

  // 素材列表（可按任务过滤）
  app.get('/api/assets', async (request) => {
    const { jobId, limit } = request.query as { jobId?: string; limit?: string };
    return store.listAssets({ jobId, limit: limit ? Number(limit) : undefined });
  });

  // 批量导出指定素材
  app.get('/api/assets/export', async (request, reply) => {
    const { ids } = request.query as { ids?: string };
    const assetIds = ids
      ?.split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    if (!assetIds?.length) return reply.status(400).send({ error: '请提供 ids 查询参数' });

    const assets = assetIds
      .map((id) => store.getAsset(id))
      .filter((asset): asset is AssetRecord => Boolean(asset));
    if (assets.length === 0) return reply.status(404).send({ error: '未找到可导出的素材' });
    sendAssetsZip(reply, storage, assets, `assets-${assets.length}.zip`);
  });

  // 素材元数据
  app.get('/api/assets/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const asset = store.getAsset(id);
    if (!asset) return reply.status(404).send({ error: '素材不存在' });
    return asset;
  });

  // 删除素材（文件 + 记录）
  app.delete('/api/assets/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const asset = store.deleteAsset(id);
    if (!asset) return reply.status(404).send({ error: '素材不存在' });
    await Promise.all([
      storage.remove(asset.fileName),
      ...(asset.variants ?? []).map((variant) => storage.remove(variant.fileName)),
    ]);
    return { ok: true };
  });
}
