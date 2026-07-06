import type { FastifyInstance } from 'fastify';
import type { ProvidersResponse } from '@gaf/shared';
import type { AppContext } from '../context.js';

export function registerProviderRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/providers', async (): Promise<ProvidersResponse> => {
    return {
      imageProviders: ctx.registry.list(),
      llm: ctx.llm
        ? {
            configured: true,
            provider: ctx.llm.provider,
            model: ctx.llm.model,
            supportsVision: ctx.llm.supportsVision,
          }
        : { configured: false },
    };
  });

  app.get('/api/health', async () => ({
    ok: true,
    queue: { pending: ctx.queue.pending, active: ctx.queue.active },
  }));
}
