import { z } from 'zod';

/** 素材类型枚举（与 types.ts 的 AssetType 保持一致） */
export const assetTypeSchema = z.enum(['sprite', 'icon', 'texture', 'background', 'ui', 'concept']);

const postprocessSchema = z
  .object({
    variants: z.array(z.number().min(0.1).max(2)).max(4).optional(),
    format: z.enum(['png', 'webp']).optional(),
    // v0.2 草稿期字段，保留兼容，输出统一转换为 variants/format。
    webp: z.boolean().optional(),
    scales: z.array(z.number().min(0.1).max(2)).max(4).optional(),
  })
  .transform(({ variants, format, webp, scales }) => ({
    ...(variants ?? scales ? { variants: variants ?? scales } : {}),
    ...(format ?? webp ? { format: format ?? 'webp' } : {}),
  }));

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
  postprocess: postprocessSchema.optional(),
});

export type CreateJobInput = z.infer<typeof createJobSchema>;
