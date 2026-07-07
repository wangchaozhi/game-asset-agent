import type { ProviderCheckResult } from '@gaf/shared';
import { errorMessage, fetchWithTimeout, withTiming } from '../../util/http.js';
import type { ImageGenInput, ImageGenResult, ImageProvider, ProgressReporter } from '../types.js';

const API = 'https://api.replicate.com/v1';

interface Prediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: string[] | string;
  error?: string;
  urls?: { get?: string };
}

/**
 * Replicate Provider：聚合大量开源模型（FLUX / SDXL 等）。
 * 采用官方 models 端点创建预测（create prediction → 轮询直至 succeeded）。
 */
export class ReplicateProvider implements ImageProvider {
  readonly id = 'replicate';
  readonly label = 'Replicate';
  readonly requires = ['REPLICATE_API_TOKEN'];
  readonly models = [
    'black-forest-labs/flux-schnell',
    'black-forest-labs/flux-dev',
    'stability-ai/sdxl',
  ];
  readonly defaultModel = 'black-forest-labs/flux-schnell';
  readonly supportsNegativePrompt = false;
  readonly outputFormat = 'png';
  readonly note = '聚合开源模型（FLUX / SDXL）；异步预测，首次冷启动可能较慢';

  constructor(private readonly token: string | undefined) {}

  isConfigured(): boolean {
    return Boolean(this.token);
  }

  async generate(
    input: ImageGenInput,
    model = this.defaultModel,
    onProgress?: ProgressReporter,
  ): Promise<ImageGenResult> {
    if (!this.token) throw new Error('Replicate 未配置：缺少 REPLICATE_API_TOKEN');

    const created = await this.request<Prediction>(`${API}/models/${model}/predictions`, {
      method: 'POST',
      body: JSON.stringify({ input: this.buildInput(model, input) }),
    });

    const pollUrl = created.urls?.get ?? `${API}/predictions/${created.id}`;
    const prediction = await this.poll(pollUrl, onProgress);

    const url = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
    if (!url) throw new Error('Replicate 预测完成但未返回图片 URL');

    const imgRes = await fetchWithTimeout(url, {}, 60000);
    if (!imgRes.ok) throw new Error(`下载 Replicate 结果失败 (${imgRes.status})`);
    return { data: Buffer.from(await imgRes.arrayBuffer()), format: 'png', model };
  }

  private buildInput(model: string, input: ImageGenInput): Record<string, unknown> {
    const base: Record<string, unknown> = { prompt: input.prompt };
    if (input.seed !== undefined) base.seed = input.seed;
    if (model.includes('flux')) {
      base.aspect_ratio = pickFluxAspect(input.width, input.height);
      base.output_format = 'png';
    } else {
      base.width = input.width;
      base.height = input.height;
      if (input.negativePrompt) base.negative_prompt = input.negativePrompt;
    }
    return base;
  }

  private async poll(url: string, onProgress?: ProgressReporter): Promise<Prediction> {
    const deadline = Date.now() + 120000;
    let attempt = 0;
    while (Date.now() < deadline) {
      const prediction = await this.request<Prediction>(url, { method: 'GET' });
      if (prediction.status === 'succeeded') return prediction;
      if (prediction.status === 'failed' || prediction.status === 'canceled') {
        throw new Error(`Replicate 预测${prediction.status}：${prediction.error ?? '未知错误'}`);
      }
      onProgress?.(`Replicate 预测进行中（${prediction.status}，第 ${++attempt} 次轮询）…`);
      await sleep(1500);
    }
    throw new Error('Replicate 预测超时（>120s）');
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    const res = await fetchWithTimeout(
      url,
      {
        ...init,
        headers: {
          authorization: `Bearer ${this.token}`,
          'content-type': 'application/json',
          prefer: 'wait=5',
        },
      },
      60000,
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Replicate 请求失败 (${res.status}): ${text.slice(0, 300)}`);
    }
    return (await res.json()) as T;
  }

  async healthCheck(): Promise<ProviderCheckResult> {
    if (!this.token) return { ok: false, message: '缺少 REPLICATE_API_TOKEN' };
    try {
      const { value: res, latencyMs } = await withTiming(() =>
        fetchWithTimeout(`${API}/account`, {
          headers: { authorization: `Bearer ${this.token}` },
        }),
      );
      if (!res.ok) {
        return { ok: false, message: `鉴权失败 (${res.status})`, latencyMs };
      }
      const data = (await res.json().catch(() => ({}))) as { username?: string };
      return {
        ok: true,
        message: `连接正常${data.username ? `（${data.username}）` : ''}`,
        latencyMs,
      };
    } catch (err) {
      return { ok: false, message: errorMessage(err) };
    }
  }
}

const FLUX_ASPECTS: Array<[string, number]> = [
  ['21:9', 21 / 9],
  ['16:9', 16 / 9],
  ['3:2', 3 / 2],
  ['4:3', 4 / 3],
  ['1:1', 1],
  ['3:4', 3 / 4],
  ['2:3', 2 / 3],
  ['9:16', 9 / 16],
];

function pickFluxAspect(width: number, height: number): string {
  const target = width / height;
  let best = FLUX_ASPECTS[0][0];
  let bestDiff = Infinity;
  for (const [label, ratio] of FLUX_ASPECTS) {
    const diff = Math.abs(Math.log(target / ratio));
    if (diff < bestDiff) {
      bestDiff = diff;
      best = label;
    }
  }
  return best;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
