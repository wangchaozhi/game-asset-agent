import type { ProviderCheckResult } from '@gaf/shared';
import { errorMessage, fetchWithTimeout, withTiming } from '../../util/http.js';
import type { AudioGenInput, AudioGenResult, AudioProvider } from '../types.js';

/** Stability Stable Audio 2（文生音频），可生成音效与器乐 BGM。 */
export class StableAudioProvider implements AudioProvider {
  readonly id = 'stable-audio';
  readonly label = 'Stability Stable Audio';
  readonly requires = ['STABILITY_API_KEY'];
  readonly models = ['stable-audio-2'];
  readonly defaultModel = 'stable-audio-2';
  readonly kinds = ['sfx', 'bgm'] as const;
  readonly outputFormat = 'mp3' as const;
  readonly note = 'Stability Stable Audio 2；音效与器乐 BGM，最长约 30 秒';

  constructor(private readonly apiKey: string | undefined) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async generate(input: AudioGenInput): Promise<AudioGenResult> {
    if (!this.apiKey) throw new Error('Stable Audio 未配置：缺少 STABILITY_API_KEY');
    const form = new FormData();
    form.append('prompt', input.prompt);
    form.append('duration', String(Math.min(30, Math.max(1, Math.round(input.durationSeconds)))));
    form.append('output_format', 'mp3');
    if (input.seed !== undefined) form.append('seed', String(input.seed));

    const response = await fetchWithTimeout(
      'https://api.stability.ai/v2beta/audio/stable-audio-2/text-to-audio',
      {
        method: 'POST',
        headers: { authorization: `Bearer ${this.apiKey}`, accept: 'audio/*' },
        body: form,
      },
      180000,
    );
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Stable Audio 请求失败 (${response.status}): ${text.slice(0, 300)}`);
    }
    return {
      data: Buffer.from(await response.arrayBuffer()),
      format: 'mp3',
      model: this.defaultModel,
    };
  }

  async healthCheck(): Promise<ProviderCheckResult> {
    if (!this.apiKey) return { ok: false, message: '缺少 STABILITY_API_KEY' };
    try {
      const { value: res, latencyMs } = await withTiming(() =>
        fetchWithTimeout('https://api.stability.ai/v1/user/balance', {
          headers: { authorization: `Bearer ${this.apiKey}` },
        }),
      );
      if (!res.ok) return { ok: false, message: `鉴权失败 (${res.status})`, latencyMs };
      return { ok: true, message: '连接正常', latencyMs };
    } catch (err) {
      return { ok: false, message: errorMessage(err) };
    }
  }
}
