import type { ProviderCheckResult } from '@gaf/shared';
import { errorMessage, fetchWithTimeout, withTiming } from '../../util/http.js';
import type { ImageGenInput, ImageGenResult, ImageProvider } from '../types.js';

const BASE = 'https://api.stability.ai/v2beta/stable-image/generate';

const ASPECT_RATIOS: Array<[string, number]> = [
  ['21:9', 21 / 9],
  ['16:9', 16 / 9],
  ['3:2', 3 / 2],
  ['5:4', 5 / 4],
  ['1:1', 1],
  ['4:5', 4 / 5],
  ['2:3', 2 / 3],
  ['9:16', 9 / 16],
  ['9:21', 9 / 21],
];

/** Stability AI Stable Image API（Core / SD3.5 / Ultra） */
export class StabilityProvider implements ImageProvider {
  readonly id = 'stability';
  readonly label = 'Stability AI';
  readonly requires = ['STABILITY_API_KEY'];
  readonly models = ['core', 'sd3.5-large', 'sd3.5-medium', 'ultra'];
  readonly defaultModel = 'core';
  readonly supportsNegativePrompt = true;
  readonly outputFormat = 'png';
  readonly supportsReferenceImage = true;

  constructor(private readonly apiKey: string | undefined) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async generate(input: ImageGenInput, model = this.defaultModel): Promise<ImageGenResult> {
    if (!this.apiKey) throw new Error('Stability 未配置：缺少 STABILITY_API_KEY');

    const endpoint = model.startsWith('sd3') ? `${BASE}/sd3` : `${BASE}/${model}`;
    const isImg2Img = Boolean(input.referenceImage);
    const form = new FormData();
    form.append('prompt', input.prompt);
    if (input.negativePrompt) form.append('negative_prompt', input.negativePrompt);
    form.append('output_format', 'png');
    if (isImg2Img) {
      const ref = input.referenceImage!;
      form.append(
        'image',
        new Blob([new Uint8Array(ref.data)], { type: ref.mediaType }),
        'reference.png',
      );
      form.append('strength', String(ref.strength ?? 0.5));
      form.append('mode', 'image-to-image');
      if (model.startsWith('sd3')) form.append('model', model);
    } else {
      form.append('aspect_ratio', pickAspect(input.width, input.height));
      if (model.startsWith('sd3')) {
        form.append('model', model);
        form.append('mode', 'text-to-image');
      }
    }
    if (input.seed !== undefined) form.append('seed', String(input.seed));

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        accept: 'image/*',
      },
      body: form,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Stability 请求失败 (${response.status}): ${text.slice(0, 500)}`);
    }
    return { data: Buffer.from(await response.arrayBuffer()), format: 'png', model };
  }

  async healthCheck(): Promise<ProviderCheckResult> {
    if (!this.apiKey) return { ok: false, message: '缺少 STABILITY_API_KEY' };
    try {
      const { value: res, latencyMs } = await withTiming(() =>
        fetchWithTimeout('https://api.stability.ai/v1/user/balance', {
          headers: { authorization: `Bearer ${this.apiKey}` },
        }),
      );
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { ok: false, message: `鉴权失败 (${res.status}): ${text.slice(0, 200)}`, latencyMs };
      }
      const data = (await res.json().catch(() => ({}))) as { credits?: number };
      const credits =
        typeof data.credits === 'number' ? `，余额 ${data.credits.toFixed(1)} credits` : '';
      return { ok: true, message: `连接正常${credits}`, latencyMs };
    } catch (err) {
      return { ok: false, message: errorMessage(err) };
    }
  }
}

function pickAspect(width: number, height: number): string {
  const target = width / height;
  let best = ASPECT_RATIOS[0][0];
  let bestDiff = Infinity;
  for (const [label, ratio] of ASPECT_RATIOS) {
    const diff = Math.abs(Math.log(target / ratio));
    if (diff < bestDiff) {
      bestDiff = diff;
      best = label;
    }
  }
  return best;
}
