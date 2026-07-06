import type { AssetPlanItem, GenerationRequest } from '@gaf/shared';
import { ASSET_TYPE_META, getStylePreset } from '@gaf/shared';
import type { LlmClient } from '../llm/types.js';
import { extractJson } from '../util/json.js';

/**
 * 智能体 ②「提示词工程师」：
 * 将素材规划转写为面向图像模型的优化提示词（含负向词）。
 * 审查重试时会带上审查官反馈进行针对性改写。
 * 未配置 LLM 时降级为模板拼接（风格关键词 + 类型模板 + 质量词）。
 */

export interface BuiltPrompt {
  prompt: string;
  negativePrompt?: string;
}

const SYSTEM_PROMPT = `你是文生图提示词专家，为游戏素材生成优化英文提示词。
要求：
- 只输出 JSON 对象：{"prompt": "...", "negativePrompt": "..."}
- prompt 为英文，突出主体、构图与风格关键词，适合游戏素材（清晰主体、可用性优先）
- negativePrompt 列出需要避免的元素（英文，逗号分隔）
- 若提供了审查反馈，必须针对反馈调整提示词`;

export async function buildPrompt(
  item: AssetPlanItem,
  request: GenerationRequest,
  llm: LlmClient | null,
  feedback?: string,
): Promise<BuiltPrompt & { usedLlm: boolean }> {
  if (llm) {
    try {
      const meta = ASSET_TYPE_META[request.assetType];
      const style = getStylePreset(request.style);
      const raw = await llm.complete({
        system: SYSTEM_PROMPT,
        prompt: [
          `素材描述：${item.description}`,
          `素材类型：${meta.labelEn}（模板参考：${meta.promptTemplate}）`,
          `风格关键词：${style ? style.keywords.join(', ') : request.style}`,
          `风格负向词：${style ? style.negative.join(', ') : '(无)'}`,
          request.negativePrompt ? `用户附加负向词：${request.negativePrompt}` : '',
          feedback ? `上一版审查反馈（务必修正）：${feedback}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        maxTokens: 1024,
      });
      const parsed = extractJson<{ prompt?: unknown; negativePrompt?: unknown }>(raw);
      if (parsed && typeof parsed.prompt === 'string' && parsed.prompt.trim().length > 0) {
        return {
          prompt: parsed.prompt.trim().slice(0, 2000),
          negativePrompt:
            typeof parsed.negativePrompt === 'string' && parsed.negativePrompt.trim()
              ? parsed.negativePrompt.trim().slice(0, 1000)
              : undefined,
          usedLlm: true,
        };
      }
    } catch {
      // 降级到模板
    }
  }
  return { ...buildPromptFallback(item, request), usedLlm: false };
}

/** 纯规则模板：无 LLM 也能产出结构良好的提示词 */
export function buildPromptFallback(item: AssetPlanItem, request: GenerationRequest): BuiltPrompt {
  const meta = ASSET_TYPE_META[request.assetType];
  const style = getStylePreset(request.style);

  const promptParts = [
    meta.promptTemplate.replace('{desc}', item.description),
    ...(style ? style.keywords : [request.style]),
    'high quality, clean composition',
  ];

  const negativeParts = [
    ...(style ? style.negative : []),
    ...meta.extraNegative,
    'low quality, watermark, text artifacts',
  ];
  if (request.negativePrompt) negativeParts.push(request.negativePrompt);

  return {
    prompt: promptParts.join(', '),
    negativePrompt: negativeParts.join(', '),
  };
}
