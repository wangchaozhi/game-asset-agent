import { randomUUID } from 'node:crypto';
import type { AssetRecord, AudioAssetType, JobStatus, JobStreamEvent } from '@gaf/shared';
import { AUDIO_TYPE_META } from '@gaf/shared';
import type { AudioProviderRegistry } from '../audiogen/registry.js';
import type { Store } from '../db/store.js';
import type { JobEventBus } from '../events.js';
import type { LlmClient } from '../llm/types.js';
import type { FileStorage } from '../storage/files.js';
import { planAssets } from './director.js';

export interface AudioPipelineDeps {
  store: Store;
  storage: FileStorage;
  audioRegistry: AudioProviderRegistry;
  llm: LlmClient | null;
  events: JobEventBus;
  isCanceled?: (jobId: string) => boolean;
}

/**
 * 音频流水线（音效 / BGM）：复用图像流水线的骨架（队列 / 事件 / 存储），
 * 但跳过视觉审查环节。美术总监负责把需求拆成 N 条差异化音频描述。
 */
export async function runAudioJob(jobId: string, deps: AudioPipelineDeps): Promise<void> {
  const { store, storage, audioRegistry, llm, events } = deps;
  const job = store.getJob(jobId);
  if (!job) return;

  const publish = (event: JobStreamEvent) => events.publish(jobId, event);
  const setStatus = (status: JobStatus) => {
    store.updateJob(jobId, (j) => {
      j.status = status;
    });
    publish({ type: 'status', status });
  };
  const log = (stage: string, message: string, assetIndex?: number) => {
    const event = { ts: Date.now(), stage, message, assetIndex };
    store.updateJob(jobId, (j) => j.progress.push(event));
    publish({ type: 'progress', event });
  };

  try {
    const request = job.request;
    const kind = (request.assetType as AudioAssetType) === 'bgm' ? 'bgm' : 'sfx';
    const meta = AUDIO_TYPE_META[kind];
    const duration = request.durationSeconds ?? meta.defaultDuration;

    const provider = audioRegistry.get(request.provider);
    if (!provider) throw new Error(`未知的音频 Provider: ${request.provider}`);
    if (!provider.isConfigured()) {
      throw new Error(
        `Provider「${provider.label}」未配置（需要 ${provider.requires.join(', ')}）`,
      );
    }
    if (!provider.kinds.includes(kind)) {
      throw new Error(`Provider「${provider.label}」不支持 ${meta.label}`);
    }
    const model = request.model || provider.defaultModel;

    setStatus('planning');
    log('plan', `美术总监正在拆解音频需求（${llm ? `LLM: ${llm.model}` : '规则模板'}）…`);
    const { items: plan } = await planAssets(request, llm);
    store.updateJob(jobId, (j) => {
      j.plan = plan;
    });
    log(
      'plan',
      `规划完成：${plan.length} 条${meta.label} —— ${plan.map((p) => p.name).join('、')}`,
    );

    setStatus('generating');
    let succeeded = 0;
    for (let i = 0; i < plan.length; i++) {
      if (deps.isCanceled?.(jobId)) {
        store.updateJob(jobId, (j) => {
          j.status = 'canceled';
          j.error = '任务已取消';
        });
        log('error', '任务已取消');
        publish({ type: 'status', status: 'canceled' });
        return;
      }
      const item = plan[i];
      const prompt = meta.promptTemplate.replace('{desc}', item.description);
      try {
        log('generate', `调用 ${provider.label} / ${model} 生成「${item.name}」…`, i);
        const result = await provider.generate(
          { prompt, kind, durationSeconds: duration, seed: request.seed },
          model,
        );
        const assetId = randomUUID();
        const saved = await storage.save(assetId, result.format, result.data);
        const record: AssetRecord = {
          id: assetId,
          jobId,
          name: item.name,
          assetType: kind,
          mediaKind: 'audio',
          durationSeconds: duration,
          style: request.style,
          prompt,
          provider: provider.id,
          model: result.model,
          width: 0,
          height: 0,
          format: result.format,
          fileName: saved.fileName,
          fileSize: saved.size,
          seed: request.seed,
          createdAt: Date.now(),
        };
        store.addAsset(record);
        store.updateJob(jobId, (j) => j.assetIds.push(assetId));
        store.recordImage(provider.id, result.model);
        succeeded++;
        log('save', `「${item.name}」已保存（${saved.fileName}）`, i);
      } catch (err) {
        log(
          'error',
          `「${item.name}」生成失败：${err instanceof Error ? err.message : String(err)}`,
          i,
        );
      }
    }

    if (succeeded === 0) throw new Error('所有音频均生成失败');
    store.updateJob(jobId, (j) => {
      j.status = 'completed';
    });
    log('done', `任务完成：成功 ${succeeded}/${plan.length} 条`);
    publish({ type: 'status', status: 'completed' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    store.updateJob(jobId, (j) => {
      j.status = 'failed';
      j.error = message;
    });
    log('error', `任务失败：${message}`);
    publish({ type: 'status', status: 'failed' });
  } finally {
    const finalJob = store.getJob(jobId);
    if (finalJob) publish({ type: 'end', job: finalJob });
  }
}
