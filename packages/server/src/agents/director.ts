import type { AssetPlanItem, GenerationRequest, ImageAssetType } from '@gaf/shared';
import { ASSET_TYPE_META, getStylePreset } from '@gaf/shared';
import type { LlmClient } from '../llm/types.js';
import { extractJson } from '../util/json.js';

/**
 * 智能体 ①「美术总监」：
 * 把用户的一句话需求拆解为 count 条互有差异、可直接生成的素材规划。
 * 未配置 LLM 时降级为规则模板（在描述后追加差异化修饰词）。
 */

const SYSTEM_PROMPT = `你是一名资深游戏美术总监，负责把需求拆解成明确的素材清单。
要求：
- 只输出 JSON 数组，不要输出任何解释文字
- 每个元素形如 {"name": "...", "description": "..."}
- name：简短中文名称（≤12 字），用于界面展示
- description：面向 AI 绘图模型的英文描述，具体、可视化、互相之间有明显差异（造型/配色/姿态/细节）
- 描述里不要包含风格词（风格由后续环节统一控制）`;

const FALLBACK_VARIATIONS = [
  'primary version',
  'alternate color scheme variation',
  'variation with different silhouette and details',
  'more ornate decorated variation',
  'simplified minimal variation',
  'battle-worn weathered variation',
  'elite golden variation',
  'corrupted dark variation',
];

export async function planAssets(
  request: GenerationRequest,
  llm: LlmClient | null,
): Promise<{ items: AssetPlanItem[]; usedLlm: boolean }> {
  if (llm) {
    try {
      const meta = ASSET_TYPE_META[request.assetType as ImageAssetType];
      const style = getStylePreset(request.style);
      const raw = await llm.complete({
        system: SYSTEM_PROMPT,
        prompt: [
          `需求：${request.brief}`,
          `素材类型：${meta.labelEn} (${meta.label})`,
          `目标风格：${style?.labelEn ?? request.style}`,
          `数量：恰好 ${request.count} 条`,
        ].join('\n'),
        maxTokens: 2048,
      });
      const items = normalizePlan(extractJson<unknown>(raw), request.count);
      if (items) return { items, usedLlm: true };
    } catch {
      // LLM 失败时静默降级到规则模板，不阻断流水线
    }
  }
  return { items: fallbackPlan(request), usedLlm: false };
}

export function fallbackPlan(request: GenerationRequest): AssetPlanItem[] {
  const items: AssetPlanItem[] = [];
  for (let i = 0; i < request.count; i++) {
    const variation = FALLBACK_VARIATIONS[i % FALLBACK_VARIATIONS.length];
    items.push({
      name: request.count === 1 ? '素材 1' : `素材 ${i + 1}`,
      description: request.count === 1 ? request.brief : `${request.brief}, ${variation}`,
    });
  }
  return items;
}

function normalizePlan(parsed: unknown, count: number): AssetPlanItem[] | null {
  if (!Array.isArray(parsed)) return null;
  const items: AssetPlanItem[] = [];
  for (const entry of parsed) {
    if (
      entry &&
      typeof entry === 'object' &&
      typeof (entry as Record<string, unknown>).name === 'string' &&
      typeof (entry as Record<string, unknown>).description === 'string'
    ) {
      const e = entry as { name: string; description: string };
      items.push({ name: e.name.slice(0, 40), description: e.description.slice(0, 800) });
    }
  }
  if (items.length === 0) return null;
  // 数量不足时循环补齐，超出时截断，确保与请求一致
  while (items.length < count) {
    const base = items[items.length % items.length];
    items.push({ ...base, name: `${base.name} ${items.length + 1}` });
  }
  return items.slice(0, count);
}
