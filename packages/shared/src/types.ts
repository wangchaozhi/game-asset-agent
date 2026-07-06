/**
 * GameAsset Forge 全局共享类型。
 * 服务端与前端都从这里导入，保证 API 契约的单一来源。
 */

/** 素材类型 */
export type AssetType = 'sprite' | 'icon' | 'texture' | 'background' | 'ui' | 'concept';

/** 任务生命周期状态 */
export type JobStatus = 'queued' | 'planning' | 'generating' | 'reviewing' | 'completed' | 'failed';

/** 生成请求（POST /api/jobs 的主体，经 zod 校验后的形态） */
export interface GenerationRequest {
  /** 用户的自然语言需求描述 */
  brief: string;
  assetType: AssetType;
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
  /** plan | prompt | generate | review | save | retry | error | done */
  stage: string;
  message: string;
  /** 该事件对应第几个素材（从 0 开始），全局事件则缺省 */
  assetIndex?: number;
}

/** 生成任务 */
export interface Job {
  id: string;
  status: JobStatus;
  request: GenerationRequest;
  plan?: AssetPlanItem[];
  progress: JobProgressEvent[];
  assetIds: string[];
  error?: string;
  createdAt: number;
  updatedAt: number;
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
  format: 'png' | 'svg' | 'webp' | 'jpeg';
  /** 相对 /files/ 的文件名 */
  fileName: string;
  fileSize: number;
  /** 审查官打分（0-10），未启用审查时缺省 */
  score?: number;
  /** 审查官意见 */
  critique?: string;
  createdAt: number;
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
  llm: LlmInfo;
}

/** SSE 推送的事件（event 字段区分类型，data 为 JSON） */
export type JobStreamEvent =
  | { type: 'snapshot'; job: Job }
  | { type: 'progress'; event: JobProgressEvent }
  | { type: 'status'; status: JobStatus }
  | { type: 'end'; job: Job };
