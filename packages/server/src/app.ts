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
import { registerStyleProfileRoutes } from './routes/styleProfiles.js';
import { registerUploadRoutes } from './routes/uploads.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export async function buildApp(ctx: AppContext): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: 'info',
      transport: undefined,
    },
    // 参考图以 base64 data URL 上传，放宽请求体上限
    bodyLimit: 25 * 1024 * 1024,
  });

  await app.register(fastifyCors, { origin: true });

  // 鉴权：设置 AUTH_TOKEN 后，所有 /api 需携带 Bearer（SSE 走 ?token= 查询参数）。
  // GET /api/auth 保持公开，供前端探测是否需要登录。
  const authToken = ctx.config.authToken;
  if (authToken) {
    app.addHook('onRequest', async (request, reply) => {
      const url = request.url.split('?')[0];
      if (!url.startsWith('/api') || url === '/api/auth') return;
      const header = request.headers.authorization;
      const bearer = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
      const queryToken = (request.query as { token?: string } | undefined)?.token;
      if (bearer !== authToken && queryToken !== authToken) {
        return reply.status(401).send({ error: '未授权：需要有效的访问令牌' });
      }
    });
  }
  app.get('/api/auth', async () => ({ required: Boolean(authToken) }));

  // 素材文件静态服务：/files/<fileName>
  await app.register(fastifyStatic, {
    root: ctx.storage.root,
    prefix: '/files/',
    decorateReply: true,
  });

  registerProviderRoutes(app, ctx);
  registerJobRoutes(app, ctx);
  registerAssetRoutes(app, ctx);
  registerUploadRoutes(app, ctx);
  registerStyleProfileRoutes(app, ctx);

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
