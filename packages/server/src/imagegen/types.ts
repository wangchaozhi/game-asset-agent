import type { AssetType, ProviderCheckResult, ProviderInfo } from '@gaf/shared';

/** 参考图（image-to-image / 风格参照），供支持的 Provider 使用 */
export interface ReferenceImage {
  /** 图像二进制 */
  data: Buffer;
  /** MIME，如 image/png */
  mediaType: string;
  /** img2img 去噪强度（0-1，越大越偏离原图），Provider 自行取舍默认值 */
  strength?: number;
}

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
  /** 参考图输入：有能力的 Provider 走 img2img，无能力的忽略 */
  referenceImage?: ReferenceImage;
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
  /** 是否支持参考图（img2img / 风格参照） */
  readonly supportsReferenceImage?: boolean;
  /** 提示词首选语言：部分国内模型中文效果更佳，提示词工程师据此决定输出语言 */
  readonly preferredPromptLanguage?: 'en' | 'zh';
  isConfigured(): boolean;
  generate(
    input: ImageGenInput,
    model?: string,
    onProgress?: ProgressReporter,
  ): Promise<ImageGenResult>;
  /** 连通性检查（本地 SD WebUI / ComfyUI 尤其需要）；未实现时由路由降级为配置态判断 */
  healthCheck?(): Promise<ProviderCheckResult>;
}

/** 生成过程中的中间进度回报（如 ComfyUI 节点进度、异步轮询状态） */
export type ProgressReporter = (message: string) => void;

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
    supportsReferenceImage: Boolean(provider.supportsReferenceImage),
    preferredPromptLanguage: provider.preferredPromptLanguage ?? 'en',
    supportsHealthCheck: typeof provider.healthCheck === 'function',
  };
}
