import type { ProviderCheckResult } from '@gaf/shared';
import { errorMessage, fetchWithTimeout, withTiming } from '../../util/http.js';
import type { ImageGenInput, ImageGenResult, ImageProvider } from '../types.js';

interface Txt2ImgResponse {
  images?: string[];
}

/** 本地 Stable Diffusion WebUI（AUTOMATIC1111，--api 模式），支持任意本地模型/Checkpoint */
export class SdWebuiProvider implements ImageProvider {
  readonly id = 'sd-webui';
  readonly label = '本地 SD WebUI (A1111)';
  readonly requires = ['SD_WEBUI_URL'];
  readonly models = ['current-checkpoint'];
  readonly defaultModel = 'current-checkpoint';
  readonly supportsNegativePrompt = true;
  readonly outputFormat = 'png';
  readonly supportsReferenceImage = true;
  readonly note = '使用 WebUI 当前加载的 Checkpoint；需以 --api 参数启动；支持参考图 img2img';

  constructor(private readonly baseUrl: string | undefined) {}

  isConfigured(): boolean {
    return Boolean(this.baseUrl);
  }

  async generate(input: ImageGenInput): Promise<ImageGenResult> {
    if (!this.baseUrl) throw new Error('SD WebUI 未配置：缺少 SD_WEBUI_URL');

    const width = roundTo8(input.width);
    const height = roundTo8(input.height);
    const common = {
      prompt: input.prompt,
      negative_prompt: input.negativePrompt ?? '',
      width,
      height,
      steps: 28,
      cfg_scale: 7,
      ...(input.seed !== undefined ? { seed: input.seed } : {}),
    };

    // 有参考图 → 走 img2img，否则 txt2img
    const isImg2Img = Boolean(input.referenceImage);
    const endpoint = isImg2Img ? '/sdapi/v1/img2img' : '/sdapi/v1/txt2img';
    const body = isImg2Img
      ? {
          ...common,
          init_images: [input.referenceImage!.data.toString('base64')],
          denoising_strength: input.referenceImage!.strength ?? 0.6,
        }
      : common;

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`SD WebUI 请求失败 (${response.status}): ${text.slice(0, 500)}`);
    }
    const data = (await response.json()) as Txt2ImgResponse;
    const b64 = data.images?.[0];
    if (!b64) throw new Error('SD WebUI 响应中没有图片数据');
    return { data: Buffer.from(b64, 'base64'), format: 'png', model: this.defaultModel };
  }

  async healthCheck(): Promise<ProviderCheckResult> {
    if (!this.baseUrl) return { ok: false, message: '缺少 SD_WEBUI_URL' };
    try {
      const { value: res, latencyMs } = await withTiming(() =>
        fetchWithTimeout(`${this.baseUrl}/sdapi/v1/sd-models`),
      );
      if (!res.ok) {
        return {
          ok: false,
          message: `WebUI 响应异常 (${res.status})，确认已加 --api 启动`,
          latencyMs,
        };
      }
      const models = (await res.json().catch(() => [])) as unknown[];
      return {
        ok: true,
        message: `连接正常，检测到 ${Array.isArray(models) ? models.length : '?'} 个 Checkpoint`,
        latencyMs,
      };
    } catch (err) {
      return { ok: false, message: errorMessage(err) };
    }
  }
}

function roundTo8(value: number): number {
  return Math.max(64, Math.round(value / 8) * 8);
}
