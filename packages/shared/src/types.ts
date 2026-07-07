/**
 * GameAsset Forge 全局共享类型。
 * 服务端与前端都从这里导入，保证 API 契约的单一来源。
 */

/** 图像素材类型 */
export type ImageAssetType = 'sprite' | 'icon' | 'texture' | 'background' | 'ui' | 'concept';

/** 音频素材类型 */
export type AudioAssetType = 'sfx' | 'bgm';

/** 素材类型（图像 + 音频） */
export type AssetType = ImageAssetType | AudioAssetType;

/** 生成媒介：图像走多智能体流水线，音频走 audiogen */
export type MediaKind = 'image' | 'audio';

/** 任务生命周期状态 */
export type JobStatus =
  'queued' | 'planning' | 'generating' | 'reviewing' | 'completed' | 'failed' | 'canceled';

/** 素材后处理选项 */
export interface PostprocessOptions {
  /** 生成额外尺寸变体，例如 [0.5, 1, 2] 对应 @0.5x/@1x/@2x */
  variants?: number[];
  /** 额外输出格式；用于 PNG/WebP 转换或 SVG 栅格化 */
  format?: 'png' | 'webp';
}

/** 生成请求（POST /api/jobs 的主体，经 zod 校验后的形态） */
export interface GenerationRequest {
  /** 用户的自然语言需求描述 */
  brief: string;
  /** 生成媒介：image（默认）走图像流水线，audio 走 audiogen */
  kind?: MediaKind;
  assetType: AssetType;
  /** 音频时长（秒），仅音频生成使用 */
  durationSeconds?: number;
  /** 风格预设 id，见 presets.ts */
  style: string;
  /** 需要产出的素材数量 */
  count: number;
  width: number;
  height: number;
  /** 图像生成 Provider id（mock / openai-images / stability / sd-webui …） */
  provider: string;
  /** Provider 下的具体模型，缺省用 provider 默认值 */
  model?: string;
  /** 追加的负向提示词 */
  negativePrompt?: string;
  /** 审查不通过时的重试次数上限 */
  maxRetries: number;
  /** 素材后处理（WebP 副本 / 尺寸变体），服务端未安装 sharp 时自动跳过 */
  postprocess?: PostprocessOptions;
  /** 固定随机种子（支持的 Provider 才生效），用于稳定复现与角色一致性 */
  seed?: number;
  /** 参考图文件名（经 POST /api/uploads 上传），有能力的 Provider 走 img2img */
  referenceImage?: string;
  /** img2img 去噪强度（0-1，越大越偏离参考图） */
  referenceStrength?: number;
  /** 透明背景（去底）：对 sprite/icon 生效，需要 sharp */
  transparentBackground?: boolean;
  /** 角色一致性描述卡（Character Sheet），注入提示词以保持同一角色跨帧一致 */
  characterSheet?: string;
  /** 风格档案 id（Style Profile），锚定跨批次风格一致 */
  styleProfileId?: string;
  /** 版本链父素材 id（对话式修图 / 同参重新生成时携带） */
  parentAssetId?: string;
  /** 审查策略覆盖（阈值 / 维度权重 / 是否启用） */
  reviewPolicy?: ReviewPolicy;
  /** 生成后把各帧合成为精灵表（需 sharp，帧数≥2） */
  spritesheet?: boolean;
}

/** 审查维度评分（0-10，defects 越高表示瑕疵越少） */
export interface ReviewDimensions {
  subject: number;
  style: number;
  composition: number;
  defects: number;
}

/** 审查策略：通过阈值、维度权重、是否启用（请求级可覆盖全局默认） */
export interface ReviewPolicy {
  /** 是否启用审查（false 时直接放行） */
  enabled?: boolean;
  /** 通过阈值（0-10），加权总分达到即通过 */
  threshold?: number;
  /** 各维度权重（未给出的维度按 1 计） */
  weights?: Partial<ReviewDimensions>;
}

/** 美术总监智能体产出的单条素材规划 */
export interface AssetPlanItem {
  /** 简短的中文名称，用于展示 */
  name: string;
  /** 面向图像模型的英文描述 */
  description: string;
}

/** 流水线运行中的进度事件（也会通过 SSE 推送） */
export interface JobProgressEvent {
  ts: number;
  /** plan | prompt | generate | review | postprocess | save | retry | error | done */
  stage: string;
  message: string;
  /** 该事件对应第几个素材（从 0 开始），全局事件则缺省 */
  assetIndex?: number;
}

/** 精灵表（Spritesheet）合成结果 */
export interface SpritesheetInfo {
  /** 合成图文件名 */
  fileName: string;
  /** TexturePacker/Phaser 兼容的 JSON 元数据文件名 */
  jsonFileName: string;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  rows: number;
  frameCount: number;
}

/** 生成任务 */
export interface Job {
  id: string;
  status: JobStatus;
  request: GenerationRequest;
  plan?: AssetPlanItem[];
  progress: JobProgressEvent[];
  assetIds: string[];
  /** 精灵表合成产物（请求勾选且帧数≥2 时生成） */
  spritesheet?: SpritesheetInfo;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

/** 后处理产生的素材变体 */
export interface AssetVariant {
  /** 展示标签：webp / 0.5x / png … */
  label: string;
  fileName: string;
  width: number;
  height: number;
  format: string;
  fileSize: number;
}

/** 已产出素材的元数据 */
export interface AssetRecord {
  id: string;
  jobId: string;
  name: string;
  assetType: AssetType;
  style: string;
  /** 实际提交给图像模型的提示词 */
  prompt: string;
  negativePrompt?: string;
  provider: string;
  model: string;
  width: number;
  height: number;
  format: 'png' | 'svg' | 'webp' | 'jpeg' | 'wav' | 'mp3';
  /** 媒介类型：图像 or 音频（缺省视为 image） */
  mediaKind?: MediaKind;
  /** 音频时长（秒），仅音频素材 */
  durationSeconds?: number;
  /** 相对 /files/ 的文件名 */
  fileName: string;
  fileSize: number;
  /** 审查官打分（0-10），未启用审查时缺省 */
  score?: number;
  /** 审查官意见 */
  critique?: string;
  /** 审查各维度评分（主体/风格/构图/瑕疵） */
  reviewDimensions?: ReviewDimensions;
  /** 后处理变体（WebP / 缩放 / SVG 栅格化） */
  variants?: AssetVariant[];
  /** 实际使用的随机种子（用于复现 / 角色一致性） */
  seed?: number;
  /** 版本链：本素材由哪个素材迭代而来（对话式修图 / 重新生成） */
  parentAssetId?: string;
  /** 无缝贴图接缝预览图文件名（texture 类型自检用） */
  seamPreview?: string;
  createdAt: number;
}

/** 风格档案（Style Profile）：锚定跨批次风格一致 */
export interface StyleProfile {
  id: string;
  name: string;
  /** 附加正向关键词 */
  keywords: string[];
  /** 附加负向词 */
  negative: string[];
  /** 色板（十六进制），供提示词参考 */
  palette: string[];
  /** 参考图文件名（可选） */
  referenceImage?: string;
  note?: string;
  createdAt: number;
  updatedAt: number;
}

/** Provider 连通性检查结果（POST /api/providers/:id/check） */
export interface ProviderCheckResult {
  ok: boolean;
  message: string;
  latencyMs?: number;
}

/** 图像 Provider 的能力描述（GET /api/providers） */
export interface ProviderInfo {
  id: string;
  label: string;
  /** 是否已配置好所需密钥，可直接使用 */
  configured: boolean;
  /** 缺失时需要设置的环境变量 */
  requires: string[];
  models: string[];
  defaultModel: string;
  supportsNegativePrompt: boolean;
  outputFormat: string;
  /** 补充说明（展示给用户） */
  note?: string;
  /** 是否支持参考图（img2img / 风格参照） */
  supportsReferenceImage?: boolean;
  /** 提示词首选语言（部分国内模型中文更佳） */
  preferredPromptLanguage?: 'en' | 'zh';
  /** 是否实现了连通性检查（前端展示「测试连接」按钮） */
  supportsHealthCheck?: boolean;
}

/** LLM（智能体大脑）状态 */
export interface LlmInfo {
  configured: boolean;
  provider?: string;
  model?: string;
  supportsVision?: boolean;
}

/** GET /api/providers 响应 */
export interface ProvidersResponse {
  imageProviders: ProviderInfo[];
  /** 音频生成 Provider（音效 / BGM） */
  audioProviders: ProviderInfo[];
  llm: LlmInfo;
  /** 服务端后处理能力（是否安装了 sharp） */
  postprocess: { available: boolean };
}

/** 单项用量统计（按 provider/model 汇总） */
export interface UsageStat {
  /** 汇总键：provider 或 provider/model */
  key: string;
  provider: string;
  model?: string;
  /** 调用次数：图像=生成张数，LLM=请求次数 */
  calls: number;
  /** LLM 估算的输入/输出 token（图像忽略） */
  tokensIn?: number;
  tokensOut?: number;
}

/** 成本 / 用量汇总（GET /api/usage） */
export interface UsageSummary {
  images: UsageStat[];
  llm: UsageStat[];
  updatedAt: number;
}

/** SSE 推送的事件（event 字段区分类型，data 为 JSON） */
export type JobStreamEvent =
  | { type: 'snapshot'; job: Job }
  | { type: 'progress'; event: JobProgressEvent }
  | { type: 'status'; status: JobStatus }
  | { type: 'end'; job: Job };
