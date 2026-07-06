import type { AssetPlanItem, GenerationRequest } from '@gaf/shared';
import { ASSET_TYPE_META, getStylePreset } from '@gaf/shared';
import type { LlmClient, LlmImage } from '../llm/types.js';
import { extractJson } from '../util/json.js';

/**
 * 智能体 ③「审查官」：
 * 用视觉 LLM 对生成结果进行质量评审（0-10 打分 + 意见）。
 * 不通过时流水线会带着反馈让提示词工程师改写后重试。
 * 无视觉 LLM 或输出为 SVG（多数视觉模型不支持）时自动放行。
 */

export interface Review {
  score: number | null;
  feedback: string;
  pass: boolean;
  usedLlm: boolean;
}

const PASS_THRESHOLD = 6;

const SYSTEM_PROMPT = `你是游戏美术质量审查官。根据素材规格审查生成的图片。
评审维度：主体是否符合描述、风格是否匹配、构图是否可用（游戏素材需要主体清晰）、有无明显瑕疵。
只输出 JSON：{"score": 0-10 的数字, "pass": true/false, "feedback": "中文意见，若不通过给出具体修改建议"}`;

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
  const mediaType = VISION_FORMATS[image.format];
  if (!llm || !llm.supportsVision || !mediaType) {
    return { score: null, feedback: '', pass: true, usedLlm: false };
  }

  try {
    const meta = ASSET_TYPE_META[request.assetType];
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
    const parsed = extractJson<{ score?: unknown; pass?: unknown; feedback?: unknown }>(raw);
    if (!parsed) {
      return { score: null, feedback: '', pass: true, usedLlm: true };
    }
    const score = typeof parsed.score === 'number' ? clamp(parsed.score, 0, 10) : null;
    const feedback = typeof parsed.feedback === 'string' ? parsed.feedback.slice(0, 1000) : '';
    const pass =
      typeof parsed.pass === 'boolean' ? parsed.pass : score === null || score >= PASS_THRESHOLD;
    return { score, feedback, pass, usedLlm: true };
  } catch {
    // 审查失败不应阻断产出
    return { score: null, feedback: '', pass: true, usedLlm: false };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
