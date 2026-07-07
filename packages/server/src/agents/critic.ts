import type {
  AssetPlanItem,
  GenerationRequest,
  ImageAssetType,
  ReviewDimensions,
} from '@gaf/shared';
import { ASSET_TYPE_META, getStylePreset } from '@gaf/shared';
import type { LlmClient, LlmImage } from '../llm/types.js';
import { extractJson } from '../util/json.js';

/**
 * 智能体 ③「审查官」：
 * 用视觉 LLM 对生成结果进行质量评审（分维度打分 + 意见）。
 * 审查策略（ReviewPolicy）可配置：通过阈值、各维度权重、是否启用。
 * 不通过时流水线会带着反馈让提示词工程师改写后重试。
 * 无视觉 LLM 或输出为 SVG（多数视觉模型不支持）时自动放行。
 */

export interface Review {
  score: number | null;
  feedback: string;
  pass: boolean;
  usedLlm: boolean;
  dimensions?: ReviewDimensions;
}

const DEFAULT_THRESHOLD = 6;

const SYSTEM_PROMPT = `你是游戏美术质量审查官。根据素材规格分维度审查生成的图片。
四个维度各打 0-10 分：
- subject 主体符合度（是否符合描述）
- style 风格匹配（是否符合期望风格）
- composition 构图可用性（游戏素材需主体清晰、可用）
- defects 无瑕疵程度（10=毫无瑕疵，0=严重瑕疵）
只输出 JSON：{"subject":0-10,"style":0-10,"composition":0-10,"defects":0-10,"feedback":"中文意见，若有明显问题给出具体修改建议"}`;

const VISION_FORMATS: Record<string, LlmImage['mediaType']> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

export async function reviewAsset(
  image: { data: Buffer; format: string },
  item: AssetPlanItem,
  request: GenerationRequest,
  llm: LlmClient | null,
): Promise<Review> {
  const policy = request.reviewPolicy;
  if (policy?.enabled === false) {
    return { score: null, feedback: '', pass: true, usedLlm: false };
  }
  const mediaType = VISION_FORMATS[image.format];
  if (!llm || !llm.supportsVision || !mediaType) {
    return { score: null, feedback: '', pass: true, usedLlm: false };
  }

  try {
    const meta = ASSET_TYPE_META[request.assetType as ImageAssetType];
    const style = getStylePreset(request.style);
    const raw = await llm.complete({
      system: SYSTEM_PROMPT,
      prompt: [
        `素材名称：${item.name}`,
        `期望内容：${item.description}`,
        `素材类型：${meta.labelEn} (${meta.label})`,
        `期望风格：${style?.labelEn ?? request.style}`,
      ].join('\n'),
      images: [{ mediaType, base64: image.data.toString('base64') }],
      maxTokens: 1024,
    });
    const parsed = extractJson<
      Partial<ReviewDimensions> & { feedback?: unknown; score?: unknown; pass?: unknown }
    >(raw);
    if (!parsed) {
      return { score: null, feedback: '', pass: true, usedLlm: true };
    }

    const dimensions = normalizeDimensions(parsed);
    const feedback = typeof parsed.feedback === 'string' ? parsed.feedback.slice(0, 1000) : '';
    const threshold = policy?.threshold ?? DEFAULT_THRESHOLD;

    if (!dimensions) {
      // 兼容旧格式（单一 score 字段）
      const score = typeof parsed.score === 'number' ? clamp(parsed.score, 0, 10) : null;
      const pass =
        typeof parsed.pass === 'boolean' ? parsed.pass : score === null || score >= threshold;
      return { score, feedback, pass, usedLlm: true };
    }

    const score = weightedScore(dimensions, policy?.weights);
    return {
      score: Math.round(score * 10) / 10,
      feedback,
      pass: score >= threshold,
      usedLlm: true,
      dimensions,
    };
  } catch {
    // 审查失败不应阻断产出
    return { score: null, feedback: '', pass: true, usedLlm: false };
  }
}

function normalizeDimensions(parsed: Partial<ReviewDimensions>): ReviewDimensions | null {
  const keys: Array<keyof ReviewDimensions> = ['subject', 'style', 'composition', 'defects'];
  if (!keys.some((k) => typeof parsed[k] === 'number')) return null;
  return {
    subject: clamp(numeric(parsed.subject), 0, 10),
    style: clamp(numeric(parsed.style), 0, 10),
    composition: clamp(numeric(parsed.composition), 0, 10),
    defects: clamp(numeric(parsed.defects), 0, 10),
  };
}

function weightedScore(dims: ReviewDimensions, weights: Partial<ReviewDimensions> = {}): number {
  const entries: Array<[keyof ReviewDimensions, number]> = [
    ['subject', weights.subject ?? 1],
    ['style', weights.style ?? 1],
    ['composition', weights.composition ?? 1],
    ['defects', weights.defects ?? 1],
  ];
  const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0) || 1;
  const weighted = entries.reduce((sum, [key, w]) => sum + dims[key] * w, 0);
  return weighted / totalWeight;
}

function numeric(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
