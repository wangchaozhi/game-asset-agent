import type { LlmClient, LlmCompleteOptions } from './types.js';

/** 粗略 token 估算：约 4 字符 / token（中英混合的经验值） */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * LLM 用量追踪装饰器：包裹真实客户端，按请求估算 token 并回报，
 * 不改动上层接口即可为成本面板提供数据。
 */
export class TrackingLlm implements LlmClient {
  constructor(
    private readonly inner: LlmClient,
    private readonly onUsage: (tokensIn: number, tokensOut: number) => void,
  ) {}

  get provider(): string {
    return this.inner.provider;
  }

  get model(): string {
    return this.inner.model;
  }

  get supportsVision(): boolean {
    return this.inner.supportsVision;
  }

  async complete(options: LlmCompleteOptions): Promise<string> {
    const inputTokens =
      estimateTokens(options.system ?? '') +
      estimateTokens(options.prompt) +
      (options.images?.length ?? 0) * 800; // 视觉输入按固定近似值计入
    const result = await this.inner.complete(options);
    this.onUsage(inputTokens, estimateTokens(result));
    return result;
  }
}
