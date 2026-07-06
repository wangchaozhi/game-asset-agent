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

  constructor(private readonly apiKey: string | undefined) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async generate(input: ImageGenInput, model = this.defaultModel): Promise<ImageGenResult> {
    if (!this.apiKey) throw new Error('Stability 未配置：缺少 STABILITY_API_KEY');

    const endpoint = model.startsWith('sd3') ? `${BASE}/sd3` : `${BASE}/${model}`;
    const form = new FormData();
    form.append('prompt', input.prompt);
    if (input.negativePrompt) form.append('negative_prompt', input.negativePrompt);
    form.append('aspect_ratio', pickAspect(input.width, input.height));
    form.append('output_format', 'png');
    if (model.startsWith('sd3')) {
      form.append('model', model);
      form.append('mode', 'text-to-image');
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
