import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context.js';

export function registerAssetRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { store, storage } = ctx;

  // 素材列表（可按任务过滤）
  app.get('/api/assets', async (request) => {
    const { jobId, limit } = request.query as { jobId?: string; limit?: string };
    return store.listAssets({ jobId, limit: limit ? Number(limit) : undefined });
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
    await storage.remove(asset.fileName);
    return { ok: true };
  });
}
