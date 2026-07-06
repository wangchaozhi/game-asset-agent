/** LLM 适配层：统一「文本 + 可选图像 → 文本」的最小接口，屏蔽厂商差异 */

export interface LlmImage {
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
  base64: string;
}

export interface LlmCompleteOptions {
  system?: string;
  prompt: string;
  images?: LlmImage[];
  maxTokens?: number;
}

export interface LlmClient {
  readonly provider: string;
  readonly model: string;
  readonly supportsVision: boolean;
  complete(options: LlmCompleteOptions): Promise<string>;
}
