import { randomUUID } from 'node:crypto';
import type { AssetRecord, JobStatus, JobStreamEvent } from '@gaf/shared';
import type { Store } from '../db/store.js';
import type { JobEventBus } from '../events.js';
import type { ProviderRegistry } from '../imagegen/registry.js';
import type { ReferenceImage } from '../imagegen/types.js';
import type { LlmClient } from '../llm/types.js';
import { composeSpritesheet, makeSeamPreview, postprocessAsset } from '../postprocess/index.js';
import type { FileStorage } from '../storage/files.js';
import { reviewAsset } from './critic.js';
import { planAssets } from './director.js';
import { buildPrompt } from './promptsmith.js';

function mediaTypeFromName(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  return 'image/png';
}

export interface PipelineDeps {
  store: Store;
  storage: FileStorage;
  registry: ProviderRegistry;
  llm: LlmClient | null;
  events: JobEventBus;
  /** 查询任务是否被请求取消（流水线在阶段边界检查） */
  isCanceled?: (jobId: string) => boolean;
}

/** 用于在阶段边界中断流水线的哨兵错误 */
class JobCanceledError extends Error {
  constructor() {
    super('任务已取消');
    this.name = 'JobCanceledError';
  }
}

/**
 * 多智能体流水线编排器。每个任务依次经过：
 *
 *   ① 美术总监(planAssets)   —— 需求 → 素材规划清单
 *   ② 提示词工程师(buildPrompt) —— 规划 → 优化提示词
 *   ③ 图像 Provider(generate)  —— 提示词 → 图像
 *   ④ 审查官(reviewAsset)      —— 打分；不合格则携反馈回到 ② 重试
 *
 * 单个素材失败不影响其余素材；全部失败才判任务失败。
 */
export async function runJob(jobId: string, deps: PipelineDeps): Promise<void> {
  const { store, storage, registry, llm, events } = deps;
  const job = store.getJob(jobId);
  if (!job) return;

  const publish = (event: JobStreamEvent) => events.publish(jobId, event);
  const checkCanceled = () => {
    if (deps.isCanceled?.(jobId)) throw new JobCanceledError();
  };

  const setStatus = (status: JobStatus) => {
    store.updateJob(jobId, (j) => {
      j.status = status;
    });
    publish({ type: 'status', status });
  };

  const log = (stage: string, message: string, assetIndex?: number) => {
    const event = { ts: Date.now(), stage, message, assetIndex };
    store.updateJob(jobId, (j) => {
      j.progress.push(event);
    });
    publish({ type: 'progress', event });
  };

  const finish = () => {
    const finalJob = store.getJob(jobId);
    if (finalJob) publish({ type: 'end', job: finalJob });
  };

  try {
    const request = job.request;
    const provider = registry.get(request.provider);
    if (!provider) throw new Error(`未知的图像 Provider: ${request.provider}`);
    if (!provider.isConfigured()) {
      throw new Error(
        `Provider「${provider.label}」未配置（需要 ${provider.requires.join(', ')}）`,
      );
    }
    const model = request.model || provider.defaultModel;

    // 解析风格档案（跨批次一致性）与参考图（img2img）
    const styleProfile = request.styleProfileId
      ? (store.getStyleProfile(request.styleProfileId) ?? null)
      : null;
    if (request.styleProfileId && !styleProfile) {
      log('plan', `风格档案 ${request.styleProfileId} 不存在，已忽略`);
    }

    let referenceImage: ReferenceImage | undefined;
    const referenceName = request.referenceImage ?? styleProfile?.referenceImage;
    if (referenceName) {
      if (provider.supportsReferenceImage) {
        try {
          const data = await storage.read(referenceName);
          referenceImage = {
            data,
            mediaType: mediaTypeFromName(referenceName),
            strength: request.referenceStrength,
          };
          log('plan', `已载入参考图 ${referenceName}（img2img）`);
        } catch (err) {
          log('error', `参考图载入失败：${errorMessage(err)}`);
        }
      } else {
        log('plan', `Provider「${provider.label}」不支持参考图，已忽略`);
      }
    }

    // ① 美术总监
    checkCanceled();
    setStatus('planning');
    log('plan', `美术总监正在拆解需求（${llm ? `LLM: ${llm.model}` : '规则模板'}）…`);
    const { items: plan, usedLlm: planByLlm } = await planAssets(request, llm);
    store.updateJob(jobId, (j) => {
      j.plan = plan;
    });
    log(
      'plan',
      `规划完成：${plan.length} 项素材（${planByLlm ? 'LLM 智能规划' : '模板规划'}）—— ${plan
        .map((p) => p.name)
        .join('、')}`,
    );

    // ②③④ 逐项生成
    setStatus('generating');
    const maxAttempts = 1 + request.maxRetries;
    let succeeded = 0;
    const frameBuffers: Buffer[] = [];

    for (let i = 0; i < plan.length; i++) {
      checkCanceled();
      const item = plan[i];
      let feedback: string | undefined;

      try {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          // ② 提示词工程师（按 Provider 首选语言决定中/英文提示词）
          const built = await buildPrompt(item, request, llm, {
            feedback,
            language: provider.preferredPromptLanguage ?? 'en',
            styleProfile,
            characterSheet: request.characterSheet,
          });
          log(
            'prompt',
            `提示词就绪（${built.usedLlm ? 'LLM 优化' : '模板'}${attempt > 1 ? `，第 ${attempt} 次尝试` : ''}）：${built.prompt.slice(0, 160)}${built.prompt.length > 160 ? '…' : ''}`,
            i,
          );

          // ③ 图像生成
          log('generate', `调用 ${provider.label} / ${model} 生成「${item.name}」…`, i);
          const result = await provider.generate(
            {
              prompt: built.prompt,
              negativePrompt: provider.supportsNegativePrompt ? built.negativePrompt : undefined,
              width: request.width,
              height: request.height,
              assetType: request.assetType,
              ...(request.seed !== undefined ? { seed: request.seed } : {}),
              ...(referenceImage ? { referenceImage } : {}),
            },
            model,
            (message) => log('generate', message, i),
          );

          // ④ 审查官
          const review = await reviewAsset(
            { data: result.data, format: result.format },
            item,
            request,
            llm,
          );
          if (review.usedLlm) {
            log(
              'review',
              `审查官评分 ${review.score ?? '—'}/10：${review.pass ? '通过' : '不通过'}${review.feedback ? ` —— ${review.feedback.slice(0, 120)}` : ''}`,
              i,
            );
          }

          if (!review.pass && attempt < maxAttempts) {
            feedback = review.feedback || '质量不达标，请调整提示词后重试';
            log('retry', `「${item.name}」将根据审查反馈重试（${attempt}/${maxAttempts - 1}）`, i);
            continue;
          }

          // 落盘 + 建档
          const assetId = randomUUID();
          const saved = await storage.save(assetId, result.format, result.data);
          const postprocessed = await postprocessAsset({
            assetId,
            request,
            result,
            storage,
          });
          if (postprocessed.skippedReason) {
            log('postprocess', postprocessed.skippedReason, i);
          } else if (postprocessed.variants.length > 0) {
            log('postprocess', `已生成 ${postprocessed.variants.length} 个后处理变体`, i);
          }

          // 无缝贴图接缝自检：texture 类型生成一张偏移拼接的预览图（sharp 可栅格化 SVG）
          let seamPreview: string | undefined;
          if (request.assetType === 'texture') {
            const preview = await makeSeamPreview(result.data);
            if (preview) {
              const savedPreview = await storage.saveDerived(assetId, '-seam', 'png', preview);
              seamPreview = savedPreview.fileName;
              log('postprocess', '已生成无缝贴图接缝预览图', i);
            }
          }

          const record: AssetRecord = {
            id: assetId,
            jobId,
            name: item.name,
            assetType: request.assetType,
            style: request.style,
            prompt: built.prompt,
            negativePrompt: built.negativePrompt,
            provider: provider.id,
            model: result.model,
            width: request.width,
            height: request.height,
            format: result.format,
            fileName: saved.fileName,
            fileSize: saved.size,
            score: review.score ?? undefined,
            critique: review.feedback || undefined,
            reviewDimensions: review.dimensions,
            variants: postprocessed.variants.length > 0 ? postprocessed.variants : undefined,
            seed: request.seed,
            parentAssetId: request.parentAssetId,
            seamPreview,
            createdAt: Date.now(),
          };
          store.addAsset(record);
          store.updateJob(jobId, (j) => {
            j.assetIds.push(assetId);
          });
          store.recordImage(provider.id, result.model);
          frameBuffers.push(result.data);
          succeeded++;
          log('save', `「${item.name}」已保存（${saved.fileName}，${formatBytes(saved.size)}）`, i);
          break;
        }
      } catch (err) {
        log('error', `「${item.name}」生成失败：${errorMessage(err)}`, i);
      }
    }

    if (succeeded === 0) {
      throw new Error('所有素材均生成失败');
    }

    // 精灵表合成：把各帧拼成统一网格 + 输出 Phaser/Unity 兼容 JSON 元数据
    if (request.spritesheet && frameBuffers.length >= 2) {
      const sheetImageName = `${jobId}-sheet.png`;
      const sheet = await composeSpritesheet(frameBuffers, sheetImageName);
      if (sheet) {
        const savedSheet = await storage.save(`${jobId}-sheet`, 'png', sheet.sheet);
        const savedJson = await storage.save(
          `${jobId}-sheet`,
          'json',
          Buffer.from(JSON.stringify(sheet.atlas, null, 2), 'utf8'),
        );
        store.updateJob(jobId, (j) => {
          j.spritesheet = {
            fileName: savedSheet.fileName,
            jsonFileName: savedJson.fileName,
            frameWidth: sheet.frameWidth,
            frameHeight: sheet.frameHeight,
            columns: sheet.columns,
            rows: sheet.rows,
            frameCount: sheet.frameCount,
          };
        });
        log(
          'postprocess',
          `已合成精灵表：${sheet.frameCount} 帧 · ${sheet.columns}×${sheet.rows} 网格`,
        );
      } else {
        log('postprocess', '精灵表合成已跳过（需 sharp，且帧数≥2）');
      }
    }

    store.updateJob(jobId, (j) => {
      j.status = 'completed';
    });
    log('done', `任务完成：成功 ${succeeded}/${plan.length} 项`);
    publish({ type: 'status', status: 'completed' });
  } catch (err) {
    if (err instanceof JobCanceledError) {
      store.updateJob(jobId, (j) => {
        j.status = 'canceled';
        j.error = '任务已取消';
      });
      log('error', '任务已取消');
      publish({ type: 'status', status: 'canceled' });
    } else {
      const message = errorMessage(err);
      store.updateJob(jobId, (j) => {
        j.status = 'failed';
        j.error = message;
      });
      log('error', `任务失败：${message}`);
      publish({ type: 'status', status: 'failed' });
    }
  } finally {
    finish();
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
