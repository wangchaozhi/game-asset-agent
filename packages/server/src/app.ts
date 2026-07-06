import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyCors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AppContext } from './context.js';
import { registerAssetRoutes } from './routes/assets.js';
import { registerJobRoutes } from './routes/jobs.js';
import { registerProviderRoutes } from './routes/providers.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export async function buildApp(ctx: AppContext): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: 'info',
      transport: undefined,
    },
  });

  await app.register(fastifyCors, { origin: true });

  // 素材文件静态服务：/files/<fileName>
  await app.register(fastifyStatic, {
    root: ctx.storage.root,
    prefix: '/files/',
    decorateReply: true,
  });

  registerProviderRoutes(app, ctx);
  registerJobRoutes(app, ctx);
  registerAssetRoutes(app, ctx);

  // 生产模式：若前端已构建（apps/web/dist），由服务端直接托管
  const webDist = path.resolve(here, '../../../apps/web/dist');
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, {
      root: webDist,
      prefix: '/',
      decorateReply: false,
    });
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api')) {
        return reply.sendFile('index.html', webDist);
      }
      return reply.status(404).send({ error: 'Not Found' });
    });
  }

  return app;
}
