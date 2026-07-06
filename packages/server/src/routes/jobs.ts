import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { AssetRecord, Job } from '@gaf/shared';
import { createJobSchema } from '@gaf/shared';
import type { AppContext } from '../context.js';
import { sendAssetsZip } from './exportZip.js';

export function registerJobRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { store, storage, registry, queue, events } = ctx;

  // 创建生成任务
  app.post('/api/jobs', async (request, reply) => {
    const parsed = createJobSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: '请求参数不合法',
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }

    const input = parsed.data;
    const provider = registry.get(input.provider);
    if (!provider) {
      return reply.status(400).send({ error: `未知的图像 Provider: ${input.provider}` });
    }
    if (!provider.isConfigured()) {
      return reply.status(400).send({
        error: `Provider「${provider.label}」未配置，需要环境变量：${provider.requires.join(', ')}`,
      });
    }
    if (input.model && !provider.models.includes(input.model)) {
      return reply.status(400).send({
        error: `模型 ${input.model} 不在 ${provider.label} 支持列表中：${provider.models.join(', ')}`,
      });
    }

    const now = Date.now();
    const job: Job = {
      id: randomUUID(),
      status: 'queued',
      request: input,
      progress: [{ ts: now, stage: 'queued', message: '任务已进入队列' }],
      assetIds: [],
      createdAt: now,
      updatedAt: now,
    };
    store.createJob(job);
    queue.enqueue(job.id);
    return reply.status(201).send(job);
  });

  // 任务列表
  app.get('/api/jobs', async (request) => {
    const { limit } = request.query as { limit?: string };
    return store.listJobs(limit ? Number(limit) : 50);
  });

  // 导出某个任务产出的所有素材
  app.get('/api/jobs/:id/export', async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = store.getJob(id);
    if (!job) return reply.status(404).send({ error: '任务不存在' });
    const assets = job.assetIds
      .map((assetId) => store.getAsset(assetId))
      .filter((asset): asset is AssetRecord => Boolean(asset));
    if (assets.length === 0) return reply.status(404).send({ error: '该任务暂无可导出的素材' });
    sendAssetsZip(reply, storage, assets, `job-${id}.zip`);
  });

  // 任务详情
  app.get('/api/jobs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = store.getJob(id);
    if (!job) return reply.status(404).send({ error: '任务不存在' });
    return job;
  });

  // SSE 实时进度
  app.get('/api/jobs/:id/events', (request, reply) => {
    const { id } = request.params as { id: string };
    const job = store.getJob(id);
    if (!job) {
      void reply.status(404).send({ error: '任务不存在' });
      return;
    }

    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });

    const send = (eventName: string, data: unknown) => {
      raw.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // 先补发当前快照，再订阅增量
    send('snapshot', job);
    if (job.status === 'completed' || job.status === 'failed') {
      send('end', job);
      raw.end();
      return;
    }

    const unsubscribe = events.subscribe(id, (event) => {
      switch (event.type) {
        case 'progress':
          send('progress', event.event);
          break;
        case 'status':
          send('status', { status: event.status });
          break;
        case 'end':
          send('end', event.job);
          raw.end();
          break;
        case 'snapshot':
          send('snapshot', event.job);
          break;
      }
    });

    const heartbeat = setInterval(() => raw.write(': ping\n\n'), 15000);
    request.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
}
