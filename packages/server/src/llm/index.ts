import type { ServerConfig } from '../config.js';
import { AnthropicLlm } from './anthropic.js';
import { OpenAiCompatLlm } from './openaiCompat.js';
import type { LlmClient } from './types.js';

export type { LlmClient, LlmCompleteOptions, LlmImage } from './types.js';

/** 按配置构建 LLM 客户端；未配置密钥时返回 null（智能体降级为规则模板） */
export function createLlm(config: ServerConfig): LlmClient | null {
  const { llm } = config;
  switch (llm.provider) {
    case 'anthropic':
      if (!llm.anthropicApiKey) return null;
      return new AnthropicLlm(llm.anthropicApiKey, llm.model);
    case 'openai':
      if (!llm.openaiApiKey) return null;
      return new OpenAiCompatLlm(llm.openaiApiKey, llm.openaiBaseUrl, llm.model);
    case 'none':
    default:
      return null;
  }
}
