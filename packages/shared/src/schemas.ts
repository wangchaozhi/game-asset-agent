import { z } from 'zod';

/** 素材类型枚举（与 types.ts 的 AssetType 保持一致） */
export const assetTypeSchema = z.enum(['sprite', 'icon', 'texture', 'background', 'ui', 'concept']);

/** POST /api/jobs 请求体校验 */
export const createJobSchema = z.object({
  brief: z.string().trim().min(2, '需求描述至少 2 个字符').max(2000),
  assetType: assetTypeSchema,
  style: z.string().min(1).max(64),
  count: z.number().int().min(1).max(8).default(1),
  width: z.number().int().min(64).max(2048).default(1024),
  height: z.number().int().min(64).max(2048).default(1024),
  provider: z.string().min(1).max(64),
  model: z.string().max(128).optional(),
  negativePrompt: z.string().max(1000).optional(),
  maxRetries: z.number().int().min(0).max(3).default(1),
});

export type CreateJobInput = z.infer<typeof createJobSchema>;
