import { z } from 'zod';

/** 图像素材类型枚举 */
export const imageAssetTypeSchema = z.enum([
  'sprite',
  'icon',
  'texture',
  'background',
  'ui',
  'concept',
]);

/** 音频素材类型枚举 */
export const audioAssetTypeSchema = z.enum(['sfx', 'bgm']);

/** 素材类型枚举（图像 + 音频） */
export const assetTypeSchema = z.enum([
  'sprite',
  'icon',
  'texture',
  'background',
  'ui',
  'concept',
  'sfx',
  'bgm',
]);

const postprocessSchema = z
  .object({
    variants: z.array(z.number().min(0.1).max(2)).max(4).optional(),
    format: z.enum(['png', 'webp']).optional(),
    // v0.2 草稿期字段，保留兼容，输出统一转换为 variants/format。
    webp: z.boolean().optional(),
    scales: z.array(z.number().min(0.1).max(2)).max(4).optional(),
  })
  .transform(({ variants, format, webp, scales }) => ({
    ...((variants ?? scales) ? { variants: variants ?? scales } : {}),
    ...((format ?? webp) ? { format: format ?? 'webp' } : {}),
  }));

/** POST /api/jobs 请求体校验 */
export const createJobSchema = z
  .object({
    brief: z.string().trim().min(2, '需求描述至少 2 个字符').max(2000),
    kind: z.enum(['image', 'audio']).default('image'),
    assetType: assetTypeSchema,
    durationSeconds: z.number().min(0.5).max(30).optional(),
    style: z.string().min(1).max(64),
    count: z.number().int().min(1).max(8).default(1),
    width: z.number().int().min(64).max(2048).default(1024),
    height: z.number().int().min(64).max(2048).default(1024),
    provider: z.string().min(1).max(64),
    model: z.string().max(128).optional(),
    negativePrompt: z.string().max(1000).optional(),
    maxRetries: z.number().int().min(0).max(3).default(1),
    postprocess: postprocessSchema.optional(),
    seed: z.number().int().min(0).max(4294967295).optional(),
    referenceImage: z.string().max(200).optional(),
    referenceStrength: z.number().min(0).max(1).optional(),
    transparentBackground: z.boolean().optional(),
    characterSheet: z.string().max(2000).optional(),
    styleProfileId: z.string().max(64).optional(),
    parentAssetId: z.string().max(64).optional(),
    /** 生成后把各帧合成为精灵表（需 sharp，帧数≥2） */
    spritesheet: z.boolean().optional(),
    reviewPolicy: z
      .object({
        enabled: z.boolean().optional(),
        threshold: z.number().min(0).max(10).optional(),
        weights: z
          .object({
            subject: z.number().min(0).max(5).optional(),
            style: z.number().min(0).max(5).optional(),
            composition: z.number().min(0).max(5).optional(),
            defects: z.number().min(0).max(5).optional(),
          })
          .optional(),
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    const isAudioType = data.assetType === 'sfx' || data.assetType === 'bgm';
    if (data.kind === 'audio' && !isAudioType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['assetType'],
        message: '音频生成的类型必须是 sfx 或 bgm',
      });
    }
    if (data.kind === 'image' && isAudioType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['assetType'],
        message: '图像生成的类型不能是 sfx / bgm',
      });
    }
  });

export type CreateJobInput = z.infer<typeof createJobSchema>;

/** 上传参考图（base64 data URL，避免引入 multipart 依赖） */
export const uploadSchema = z.object({
  dataUrl: z
    .string()
    .regex(/^data:image\/(png|jpeg|jpg|webp);base64,/, '仅支持 png/jpeg/webp 图片的 data URL')
    .max(20_000_000),
});

/** 素材重命名 */
export const renameAssetSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

/** 风格档案（Style Profile）：把一次满意产出的风格要素存档 */
export const styleProfileSchema = z.object({
  name: z.string().trim().min(1).max(80),
  keywords: z.array(z.string().max(80)).max(30).default([]),
  negative: z.array(z.string().max(80)).max(30).default([]),
  palette: z.array(z.string().max(24)).max(12).default([]),
  referenceImage: z.string().max(200).optional(),
  note: z.string().max(1000).optional(),
});

export type UploadInput = z.infer<typeof uploadSchema>;
export type StyleProfileInput = z.infer<typeof styleProfileSchema>;
