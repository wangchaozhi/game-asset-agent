import type { LlmClient, LlmCompleteOptions } from './types.js';

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
}

/**
 * OpenAI Chat Completions 兼容适配器。
 * 通过 OPENAI_BASE_URL 可指向 OpenAI / DeepSeek / Ollama / vLLM 等任意兼容端点。
 */
export class OpenAiCompatLlm implements LlmClient {
  readonly provider = 'openai-compatible';

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    readonly model: string,
    readonly supportsVision: boolean = true,
  ) {}

  async complete({
    system,
    prompt,
    images,
    maxTokens = 4096,
  }: LlmCompleteOptions): Promise<string> {
    const userContent =
      images && images.length > 0
        ? [
            ...images.map((img) => ({
              type: 'image_url' as const,
              image_url: { url: `data:${img.mediaType};base64,${img.base64}` },
            })),
            { type: 'text' as const, text: prompt },
          ]
        : prompt;

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: maxTokens,
        messages: [
          ...(system ? [{ role: 'system', content: system }] : []),
          { role: 'user', content: userContent },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`LLM 请求失败 (${response.status}): ${body.slice(0, 500)}`);
    }

    const data = (await response.json()) as ChatCompletionResponse;
    return data.choices?.[0]?.message?.content ?? '';
  }
}
