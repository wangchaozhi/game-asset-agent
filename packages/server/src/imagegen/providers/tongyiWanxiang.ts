import type { ProviderCheckResult } from '@gaf/shared';
import { errorMessage, fetchWithTimeout } from '../../util/http.js';
import type { ImageGenInput, ImageGenResult, ImageProvider, ProgressReporter } from '../types.js';

const CREATE = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis';
const TASK = 'https://dashscope.aliyuncs.com/api/v1/tasks';

interface CreateResponse {
  output?: { task_id?: string; task_status?: string };
  message?: string;
  code?: string;
}

interface TaskResponse {
  output?: {
    task_status?: string;
    results?: Array<{ url?: string; message?: string }>;
    message?: string;
  };
  message?: string;
}

/**
 * 通义万相（阿里云 DashScope）文生图。
 * 采用异步任务：创建任务 → 轮询 tasks/{id} 直至 SUCCEEDED → 下载结果图。
 * 中文提示词效果更佳，故 preferredPromptLanguage 设为 'zh'。
 */
export class TongyiWanxiangProvider implements ImageProvider {
  readonly id = 'tongyi-wanxiang';
  readonly label = '通义万相 (DashScope)';
  readonly requires = ['DASHSCOPE_API_KEY'];
  readonly models = ['wanx2.1-t2i-turbo', 'wanx2.1-t2i-plus', 'wanx2.0-t2i-turbo'];
  readonly defaultModel = 'wanx2.1-t2i-turbo';
  readonly supportsNegativePrompt = true;
  readonly outputFormat = 'png';
  readonly preferredPromptLanguage = 'zh' as const;
  readonly note = '阿里云通义万相；中文提示词效果更佳，异步任务生成';

  constructor(private readonly apiKey: string | undefined) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async generate(
    input: ImageGenInput,
    model = this.defaultModel,
    onProgress?: ProgressReporter,
  ): Promise<ImageGenResult> {
    if (!this.apiKey) throw new Error('通义万相未配置：缺少 DASHSCOPE_API_KEY');

    const create = (await this.request(CREATE, {
      method: 'POST',
      headers: { 'X-DashScope-Async': 'enable' },
      body: JSON.stringify({
        model,
        input: {
          prompt: input.prompt,
          ...(input.negativePrompt ? { negative_prompt: input.negativePrompt } : {}),
        },
        parameters: {
          size: pickSize(input.width, input.height),
          n: 1,
          ...(input.seed !== undefined ? { seed: input.seed } : {}),
        },
      }),
    })) as CreateResponse;

    const taskId = create.output?.task_id;
    if (!taskId)
      throw new Error(`通义万相创建任务失败：${create.message ?? create.code ?? '未知错误'}`);

    const url = await this.pollTask(taskId, onProgress);
    const imgRes = await fetchWithTimeout(url, {}, 60000);
    if (!imgRes.ok) throw new Error(`下载通义万相结果失败 (${imgRes.status})`);
    return { data: Buffer.from(await imgRes.arrayBuffer()), format: 'png', model };
  }

  private async pollTask(taskId: string, onProgress?: ProgressReporter): Promise<string> {
    const deadline = Date.now() + 120000;
    let attempt = 0;
    while (Date.now() < deadline) {
      await sleep(2000);
      const task = (await this.request(`${TASK}/${taskId}`, { method: 'GET' })) as TaskResponse;
      const status = task.output?.task_status;
      if (status === 'SUCCEEDED') {
        const url = task.output?.results?.find((r) => r.url)?.url;
        if (!url) throw new Error('通义万相任务成功但未返回图片 URL');
        return url;
      }
      if (status === 'FAILED' || status === 'CANCELED' || status === 'UNKNOWN') {
        throw new Error(`通义万相任务${status}：${task.output?.message ?? task.message ?? ''}`);
      }
      onProgress?.(`通义万相生成中（${status ?? 'PENDING'}，第 ${++attempt} 次轮询）…`);
    }
    throw new Error('通义万相任务超时（>120s）');
  }

  private async request(url: string, init: RequestInit): Promise<unknown> {
    const res = await fetchWithTimeout(
      url,
      {
        ...init,
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
          ...(init.headers as Record<string, string> | undefined),
        },
      },
      60000,
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`通义万相请求失败 (${res.status}): ${text.slice(0, 300)}`);
    }
    return res.json();
  }

  async healthCheck(): Promise<ProviderCheckResult> {
    if (!this.apiKey) return { ok: false, message: '缺少 DASHSCOPE_API_KEY' };
    // DashScope 无轻量 ping 端点，创建一个明显非法的任务以验证鉴权（401 = key 错误，其它 = 鉴权通过）
    try {
      const res = await fetchWithTimeout(`${TASK}/healthcheck-probe`, {
        headers: { authorization: `Bearer ${this.apiKey}` },
      });
      if (res.status === 401 || res.status === 403) {
        return { ok: false, message: `鉴权失败 (${res.status})，检查 DASHSCOPE_API_KEY` };
      }
      return { ok: true, message: '密钥可用（鉴权通过）' };
    } catch (err) {
      return { ok: false, message: errorMessage(err) };
    }
  }
}

/** 通义万相支持的尺寸档位（宽*高，像素） */
const SIZES: Array<[number, number]> = [
  [1024, 1024],
  [1280, 720],
  [720, 1280],
  [1024, 768],
  [768, 1024],
];

function pickSize(width: number, height: number): string {
  const target = width / height;
  let best = SIZES[0];
  let bestDiff = Infinity;
  for (const [w, h] of SIZES) {
    const diff = Math.abs(Math.log(target / (w / h)));
    if (diff < bestDiff) {
      bestDiff = diff;
      best = [w, h];
    }
  }
  return `${best[0]}*${best[1]}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
