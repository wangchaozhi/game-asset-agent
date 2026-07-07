import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import type { AppContext } from './context.js';
import { Store } from './db/store.js';
import { JobEventBus } from './events.js';
import { createAudioRegistry } from './audiogen/registry.js';
import { createRegistry } from './imagegen/registry.js';
import { createLlm } from './llm/index.js';
import { TrackingLlm } from './llm/tracking.js';
import { runAudioJob } from './agents/audioPipeline.js';
import { runJob } from './agents/pipeline.js';
import { JobQueue } from './queue/jobQueue.js';
import { FileStorage } from './storage/files.js';

async function main(): Promise<void> {
  const config = loadConfig();

  const store = new Store(config.dbFile);
  await store.init();

  const storage = new FileStorage(config.assetsDir);
  await storage.init();

  const registry = createRegistry(config);
  const audioRegistry = createAudioRegistry(config);
  const baseLlm = createLlm(config);
  // 包一层用量追踪，为成本面板估算 token（不改动上层接口）
  const llm = baseLlm
    ? new TrackingLlm(baseLlm, (tokensIn, tokensOut) =>
        store.recordLlm(baseLlm.provider, baseLlm.model, tokensIn, tokensOut),
      )
    : null;
  const events = new JobEventBus();

  const ctx: AppContext = {
    config,
    store,
    storage,
    registry,
    audioRegistry,
    llm,
    events,
    queue: null as unknown as AppContext['queue'],
  };
  ctx.queue = new JobQueue(config.queueConcurrency, (jobId) => {
    const job = store.getJob(jobId);
    const isCanceled = (id: string) => ctx.queue.isCanceling(id);
    if (job?.request.kind === 'audio') {
      return runAudioJob(jobId, { store, storage, audioRegistry, llm, events, isCanceled });
    }
    return runJob(jobId, { store, storage, registry, llm, events, isCanceled });
  });

  // 服务重启后，把中断的任务标记为失败（避免永远停留在 running 状态）
  const TERMINAL = new Set(['completed', 'failed', 'canceled']);
  for (const job of store.listJobs(1000)) {
    if (!TERMINAL.has(job.status)) {
      store.updateJob(job.id, (j) => {
        j.status = 'failed';
        j.error = '服务重启导致任务中断';
      });
    }
  }

  const app = await buildApp(ctx);
  await app.listen({ port: config.port, host: config.host });

  const configured = registry
    .list()
    .filter((p) => p.configured)
    .map((p) => p.id)
    .join(', ');
  app.log.info(`图像 Provider（已配置）: ${configured}`);
  app.log.info(
    `音频 Provider（已配置）: ${audioRegistry
      .list()
      .filter((p) => p.configured)
      .map((p) => p.id)
      .join(', ')}`,
  );
  if (config.authToken) app.log.info('已启用 AUTH_TOKEN 鉴权');
  app.log.info(
    llm
      ? `LLM 智能体大脑: ${llm.provider} / ${llm.model}（vision: ${llm.supportsVision}）`
      : 'LLM 未配置：智能体将使用内置规则模板（无审查环节）',
  );

  const shutdown = async () => {
    app.log.info('正在关闭…');
    await app.close();
    await store.flush();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('服务启动失败:', err);
  process.exit(1);
});
