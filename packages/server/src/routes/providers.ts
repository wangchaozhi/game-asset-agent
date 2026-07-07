import type { FastifyInstance } from 'fastify';
import type { ProviderCheckResult, ProvidersResponse } from '@gaf/shared';
import type { AppContext } from '../context.js';
import { getPostprocessStatus } from '../postprocess/index.js';

export function registerProviderRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/providers', async (): Promise<ProvidersResponse> => {
    return {
      imageProviders: ctx.registry.list(),
      audioProviders: ctx.audioRegistry.list(),
      llm: ctx.llm
        ? {
            configured: true,
            provider: ctx.llm.provider,
            model: ctx.llm.model,
            supportsVision: ctx.llm.supportsVision,
          }
        : { configured: false },
      postprocess: await getPostprocessStatus(),
    };
  });

  // Provider 连通性检查（本地 SD WebUI / ComfyUI 尤其需要）
  app.post('/api/providers/:id/check', async (request, reply): Promise<ProviderCheckResult> => {
    const { id } = request.params as { id: string };
    const provider = ctx.registry.get(id) ?? ctx.audioRegistry.get(id);
    if (!provider) {
      return reply.status(404).send({ ok: false, message: `未知的 Provider: ${id}` });
    }
    if (!provider.healthCheck) {
      return {
        ok: provider.isConfigured(),
        message: provider.isConfigured()
          ? '该 Provider 未提供连通性检查，配置态正常'
          : `未配置，需要：${provider.requires.join(', ')}`,
      };
    }
    try {
      return await provider.healthCheck();
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  });

  app.get('/api/health', async () => ({
    ok: true,
    queue: { pending: ctx.queue.pending, active: ctx.queue.active },
  }));

  // 成本 / 用量汇总（图像张数 + LLM 估算 token）
  app.get('/api/usage', async () => ctx.store.getUsage());
}
