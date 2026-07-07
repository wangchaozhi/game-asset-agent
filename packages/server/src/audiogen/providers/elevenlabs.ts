import type { ProviderCheckResult } from '@gaf/shared';
import { errorMessage, fetchWithTimeout, withTiming } from '../../util/http.js';
import type { AudioGenInput, AudioGenResult, AudioProvider } from '../types.js';

/** ElevenLabs 音效生成（Sound Effects）。中短音效/氛围音表现好。 */
export class ElevenLabsAudioProvider implements AudioProvider {
  readonly id = 'elevenlabs';
  readonly label = 'ElevenLabs 音效';
  readonly requires = ['ELEVENLABS_API_KEY'];
  readonly models = ['sound-effects'];
  readonly defaultModel = 'sound-effects';
  readonly kinds = ['sfx', 'bgm'] as const;
  readonly outputFormat = 'mp3' as const;
  readonly note = 'ElevenLabs Sound Effects；适合音效与短氛围音，最长约 22 秒';

  constructor(private readonly apiKey: string | undefined) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async generate(input: AudioGenInput): Promise<AudioGenResult> {
    if (!this.apiKey) throw new Error('ElevenLabs 未配置：缺少 ELEVENLABS_API_KEY');
    const response = await fetchWithTimeout(
      'https://api.elevenlabs.io/v1/sound-generation',
      {
        method: 'POST',
        headers: { 'xi-api-key': this.apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({
          text: input.prompt,
          duration_seconds: Math.min(22, Math.max(0.5, input.durationSeconds)),
          prompt_influence: 0.4,
        }),
      },
      120000,
    );
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`ElevenLabs 请求失败 (${response.status}): ${text.slice(0, 300)}`);
    }
    return {
      data: Buffer.from(await response.arrayBuffer()),
      format: 'mp3',
      model: this.defaultModel,
    };
  }

  async healthCheck(): Promise<ProviderCheckResult> {
    if (!this.apiKey) return { ok: false, message: '缺少 ELEVENLABS_API_KEY' };
    try {
      const { value: res, latencyMs } = await withTiming(() =>
        fetchWithTimeout('https://api.elevenlabs.io/v1/user', {
          headers: { 'xi-api-key': this.apiKey! },
        }),
      );
      if (!res.ok) return { ok: false, message: `鉴权失败 (${res.status})`, latencyMs };
      return { ok: true, message: '连接正常', latencyMs };
    } catch (err) {
      return { ok: false, message: errorMessage(err) };
    }
  }
}
