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
  readonly note = '使用 WebUI 当前加载的 Checkpoint；需以 --api 参数启动';

  constructor(private readonly baseUrl: string | undefined) {}

  isConfigured(): boolean {
    return Boolean(this.baseUrl);
  }

  async generate(input: ImageGenInput): Promise<ImageGenResult> {
    if (!this.baseUrl) throw new Error('SD WebUI 未配置：缺少 SD_WEBUI_URL');

    const response = await fetch(`${this.baseUrl}/sdapi/v1/txt2img`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        prompt: input.prompt,
        negative_prompt: input.negativePrompt ?? '',
        width: roundTo8(input.width),
        height: roundTo8(input.height),
        steps: 28,
        cfg_scale: 7,
        ...(input.seed !== undefined ? { seed: input.seed } : {}),
      }),
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
}

function roundTo8(value: number): number {
  return Math.max(64, Math.round(value / 8) * 8);
}
