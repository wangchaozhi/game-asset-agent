import type { AssetType, ProviderInfo } from '@gaf/shared';

/** 图像生成的统一输入 */
export interface ImageGenInput {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  /** 供 mock 等本地 Provider 决定构图；远端模型忽略 */
  assetType?: AssetType;
  /** 稳定复现用的随机种子（支持的 Provider 才生效） */
  seed?: number;
}

export interface ImageGenResult {
  data: Buffer;
  format: 'png' | 'svg' | 'webp' | 'jpeg';
  /** 实际使用的模型标识 */
  model: string;
}

/**
 * 图像 Provider 抽象。
 * 新增一个模型服务 = 实现该接口 + 在 registry 中注册，其余零改动。
 */
export interface ImageProvider {
  readonly id: string;
  readonly label: string;
  /** 所需环境变量（用于前端提示） */
  readonly requires: string[];
  readonly models: string[];
  readonly defaultModel: string;
  readonly supportsNegativePrompt: boolean;
  readonly outputFormat: string;
  readonly note?: string;
  isConfigured(): boolean;
  generate(input: ImageGenInput, model?: string): Promise<ImageGenResult>;
}

export function toProviderInfo(provider: ImageProvider): ProviderInfo {
  return {
    id: provider.id,
    label: provider.label,
    configured: provider.isConfigured(),
    requires: provider.requires,
    models: provider.models,
    defaultModel: provider.defaultModel,
    supportsNegativePrompt: provider.supportsNegativePrompt,
    outputFormat: provider.outputFormat,
    note: provider.note,
  };
}
