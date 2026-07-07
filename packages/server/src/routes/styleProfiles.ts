import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { StyleProfile } from '@gaf/shared';
import { styleProfileSchema } from '@gaf/shared';
import type { AppContext } from '../context.js';

/** 风格档案（Style Profile）CRUD：锚定跨批次风格一致 */
export function registerStyleProfileRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { store } = ctx;

  app.get('/api/style-profiles', async () => store.listStyleProfiles());

  app.post('/api/style-profiles', async (request, reply) => {
    const parsed = styleProfileSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: '风格档案参数不合法',
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    const now = Date.now();
    const profile: StyleProfile = {
      id: randomUUID(),
      ...parsed.data,
      createdAt: now,
      updatedAt: now,
    };
    return reply.status(201).send(store.createStyleProfile(profile));
  });

  app.put('/api/style-profiles/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = styleProfileSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: '风格档案参数不合法',
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    const updated = store.updateStyleProfile(id, (p) => Object.assign(p, parsed.data));
    if (!updated) return reply.status(404).send({ error: '风格档案不存在' });
    return updated;
  });

  app.delete('/api/style-profiles/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!store.deleteStyleProfile(id)) return reply.status(404).send({ error: '风格档案不存在' });
    return { ok: true };
  });
}
