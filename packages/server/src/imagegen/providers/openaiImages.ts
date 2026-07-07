import type { ProviderCheckResult } from '@gaf/shared';
import { errorMessage, fetchWithTimeout, withTiming } from '../../util/http.js';
import type { ImageGenInput, ImageGenResult, ImageProvider } from '../types.js';

interface ImagesResponse {
  data?: Array<{ b64_json?: string; url?: string }>;
}

/** OpenAI Images（gpt-image-1 / dall-e-3），也兼容任何实现同一端点的服务 */
export class OpenAiImagesProvider implements ImageProvider {
  readonly id = 'openai-images';
  readonly label = 'OpenAI Images';
  readonly requires = ['OPENAI_API_KEY'];
  readonly models = ['gpt-image-1', 'dall-e-3'];
  readonly defaultModel = 'gpt-image-1';
  readonly supportsNegativePrompt = false;
  readonly outputFormat = 'png';
  readonly supportsReferenceImage = true;
  readonly note = '负向提示词会被合并进正向提示词；gpt-image-1 支持参考图（走 edits 接口）';

  constructor(
    private readonly apiKey: string | undefined,
    private readonly baseUrl: string,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async generate(input: ImageGenInput, model = this.defaultModel): Promise<ImageGenResult> {
    if (!this.apiKey) throw new Error('OpenAI Images 未配置：缺少 OPENAI_API_KEY');

    let prompt = input.prompt;
    if (input.negativePrompt) {
      prompt += `\nAvoid the following: ${input.negativePrompt}`;
    }

    // gpt-image-1 支持参考图编辑；dall-e-3 不支持，回退到纯文生图
    if (input.referenceImage && model === 'gpt-image-1') {
      return this.edit(prompt, model, input);
    }

    const body: Record<string, unknown> = {
      model,
      prompt,
      n: 1,
      size: pickSize(model, input.width, input.height),
    };
    if (model === 'dall-e-3') {
      body.response_format = 'b64_json';
    }

    const response = await fetch(`${this.baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`OpenAI Images 请求失败 (${response.status}): ${text.slice(0, 500)}`);
    }

    const data = (await response.json()) as ImagesResponse;
    const first = data.data?.[0];
    if (first?.b64_json) {
      return { data: Buffer.from(first.b64_json, 'base64'), format: 'png', model };
    }
    if (first?.url) {
      const imgRes = await fetch(first.url);
      if (!imgRes.ok) throw new Error(`下载生成图片失败 (${imgRes.status})`);
      return { data: Buffer.from(await imgRes.arrayBuffer()), format: 'png', model };
    }
    throw new Error('OpenAI Images 响应中没有图片数据');
  }

  /** gpt-image-1 参考图编辑（/images/edits，multipart） */
  private async edit(prompt: string, model: string, input: ImageGenInput): Promise<ImageGenResult> {
    const ref = input.referenceImage!;
    const form = new FormData();
    form.append('model', model);
    form.append('prompt', prompt);
    form.append('size', pickSize(model, input.width, input.height));
    form.append(
      'image',
      new Blob([new Uint8Array(ref.data)], { type: ref.mediaType }),
      'reference.png',
    );

    const response = await fetch(`${this.baseUrl}/images/edits`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}` },
      body: form,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`OpenAI Images 编辑失败 (${response.status}): ${text.slice(0, 500)}`);
    }
    const data = (await response.json()) as ImagesResponse;
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) throw new Error('OpenAI Images 编辑响应中没有图片数据');
    return { data: Buffer.from(b64, 'base64'), format: 'png', model };
  }

  async healthCheck(): Promise<ProviderCheckResult> {
    if (!this.apiKey) return { ok: false, message: '缺少 OPENAI_API_KEY' };
    try {
      const { value: res, latencyMs } = await withTiming(() =>
        fetchWithTimeout(`${this.baseUrl}/models`, {
          headers: { authorization: `Bearer ${this.apiKey}` },
        }),
      );
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { ok: false, message: `鉴权失败 (${res.status}): ${text.slice(0, 200)}`, latencyMs };
      }
      return { ok: true, message: `连接正常（${this.baseUrl}）`, latencyMs };
    } catch (err) {
      return { ok: false, message: errorMessage(err) };
    }
  }
}

/** 把任意宽高映射到该模型支持的最接近尺寸 */
function pickSize(model: string, width: number, height: number): string {
  const options =
    model === 'dall-e-3'
      ? [
          [1024, 1024],
          [1792, 1024],
          [1024, 1792],
        ]
      : [
          [1024, 1024],
          [1536, 1024],
          [1024, 1536],
        ];
  const target = width / height;
  let best = options[0];
  let bestDiff = Infinity;
  for (const [w, h] of options) {
    const diff = Math.abs(Math.log(target / (w / h)));
    if (diff < bestDiff) {
      bestDiff = diff;
      best = [w, h];
    }
  }
  return `${best[0]}x${best[1]}`;
}
