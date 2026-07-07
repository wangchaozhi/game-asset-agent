import type { AudioAssetType, ProviderCheckResult, ProviderInfo } from '@gaf/shared';

/** 音频生成统一输入 */
export interface AudioGenInput {
  prompt: string;
  kind: AudioAssetType;
  durationSeconds: number;
  seed?: number;
}

export interface AudioGenResult {
  data: Buffer;
  format: 'wav' | 'mp3';
  model: string;
}

/**
 * 音频 Provider 抽象（复用图像 Provider 的注册表模式）。
 * 新增一个音频服务 = 实现该接口 + 在 registry 注册。
 */
export interface AudioProvider {
  readonly id: string;
  readonly label: string;
  readonly requires: string[];
  readonly models: string[];
  readonly defaultModel: string;
  /** 支持的音频类型（sfx / bgm） */
  readonly kinds: readonly AudioAssetType[];
  readonly outputFormat: 'wav' | 'mp3';
  readonly note?: string;
  isConfigured(): boolean;
  generate(input: AudioGenInput, model?: string): Promise<AudioGenResult>;
  healthCheck?(): Promise<ProviderCheckResult>;
}

export function toAudioProviderInfo(provider: AudioProvider): ProviderInfo {
  return {
    id: provider.id,
    label: provider.label,
    configured: provider.isConfigured(),
    requires: provider.requires,
    models: provider.models,
    defaultModel: provider.defaultModel,
    supportsNegativePrompt: false,
    outputFormat: provider.outputFormat,
    note: provider.note,
    supportsHealthCheck: typeof provider.healthCheck === 'function',
  };
}
