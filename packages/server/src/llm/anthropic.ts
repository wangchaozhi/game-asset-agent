import Anthropic from '@anthropic-ai/sdk';
import type { LlmClient, LlmCompleteOptions } from './types.js';

/** Claude 适配器（官方 SDK） */
export class AnthropicLlm implements LlmClient {
  readonly provider = 'anthropic';
  readonly supportsVision = true;
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    readonly model: string = 'claude-opus-4-8',
  ) {
    this.client = new Anthropic({ apiKey });
  }

  async complete({
    system,
    prompt,
    images,
    maxTokens = 4096,
  }: LlmCompleteOptions): Promise<string> {
    const content: Anthropic.ContentBlockParam[] = [];
    for (const img of images ?? []) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
      });
    }
    content.push({ type: 'text', text: prompt });

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: maxTokens,
      ...(system ? { system } : {}),
      messages: [{ role: 'user', content }],
    });

    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n');
  }
}
