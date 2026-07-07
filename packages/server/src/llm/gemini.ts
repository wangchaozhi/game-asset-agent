import type { LlmClient, LlmCompleteOptions } from './types.js';

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  error?: { message?: string };
}

/**
 * Google Gemini 适配器（generateContent REST API）。
 * 支持视觉（inlineData），可用于审查官环节。
 */
export class GeminiLlm implements LlmClient {
  readonly provider = 'gemini';
  readonly supportsVision = true;

  constructor(
    private readonly apiKey: string,
    readonly model: string = 'gemini-2.0-flash',
    private readonly baseUrl = 'https://generativelanguage.googleapis.com/v1beta',
  ) {}

  async complete({
    system,
    prompt,
    images,
    maxTokens = 4096,
  }: LlmCompleteOptions): Promise<string> {
    const parts: Array<Record<string, unknown>> = [];
    for (const img of images ?? []) {
      parts.push({ inlineData: { mimeType: img.mediaType, data: img.base64 } });
    }
    parts.push({ text: prompt });

    const response = await fetch(
      `${this.baseUrl}/models/${this.model}:generateContent?key=${encodeURIComponent(this.apiKey)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
          generationConfig: { maxOutputTokens: maxTokens },
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Gemini 请求失败 (${response.status}): ${body.slice(0, 500)}`);
    }

    const data = (await response.json()) as GeminiResponse;
    if (data.error?.message) throw new Error(`Gemini 错误：${data.error.message}`);
    return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  }
}
