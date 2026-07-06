import type { AssetVariant, GenerationRequest } from '@gaf/shared';
import type { ImageGenResult } from '../imagegen/types.js';
import type { FileStorage } from '../storage/files.js';

type SharpFormat = 'png' | 'webp' | 'jpeg';
type SharpMetadata = { width?: number; height?: number };
type SharpOutputInfo = { width: number; height: number; size: number };
type SharpPipeline = {
  metadata(): Promise<SharpMetadata>;
  resize(width: number, height: number, options?: { fit?: 'inside' | 'fill' }): SharpPipeline;
  png(): SharpPipeline;
  webp(): SharpPipeline;
  jpeg(): SharpPipeline;
  toBuffer(options: { resolveWithObject: true }): Promise<{ data: Buffer; info: SharpOutputInfo }>;
};
type SharpFactory = (input: Buffer) => SharpPipeline;

let sharpFactory: SharpFactory | null | undefined;

export interface PostprocessAssetInput {
  assetId: string;
  request: GenerationRequest;
  result: ImageGenResult;
  storage: FileStorage;
}

export interface PostprocessAssetResult {
  variants: AssetVariant[];
  skippedReason?: string;
}

export async function getPostprocessStatus(): Promise<{ available: boolean }> {
  return { available: Boolean(await loadSharp()) };
}

export async function postprocessAsset(
  input: PostprocessAssetInput,
): Promise<PostprocessAssetResult> {
  const options = input.request.postprocess;
  if (!options) return { variants: [] };

  const requestedScales = uniqueScales(options.variants);
  const targetFormat = resolveTargetFormat(input.result.format, options.format);
  const scales = requestedScales.length > 0 ? requestedScales : options.format ? [1] : [];
  if (scales.length === 0) return { variants: [] };

  const sharp = await loadSharp();
  if (!sharp) {
    return {
      variants: [],
      skippedReason: '未安装 sharp，已跳过后处理；安装可选依赖后会自动启用',
    };
  }

  try {
    const base = sharp(input.result.data);
    const metadata = await base.metadata();
    const sourceWidth = metadata.width ?? input.request.width;
    const sourceHeight = metadata.height ?? input.request.height;
    const variants: AssetVariant[] = [];

    for (const scale of scales) {
      const width = Math.max(1, Math.round(sourceWidth * scale));
      const height = Math.max(1, Math.round(sourceHeight * scale));
      const pipeline = sharp(input.result.data).resize(width, height, { fit: 'fill' });
      const { data, info } = await encode(pipeline, targetFormat).toBuffer({
        resolveWithObject: true,
      });
      const scaleLabel = scaleLabelFor(scale);
      const saved = await input.storage.saveDerived(
        input.assetId,
        `@${scaleLabel}x`,
        targetFormat,
        data,
      );
      variants.push({
        label: `@${scaleLabel}x ${targetFormat}`,
        fileName: saved.fileName,
        width: info.width,
        height: info.height,
        format: targetFormat,
        fileSize: saved.size,
      });
    }

    return { variants };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { variants: [], skippedReason: `后处理失败：${message}` };
  }
}

async function loadSharp(): Promise<SharpFactory | null> {
  if (sharpFactory !== undefined) return sharpFactory;
  try {
    const module = (await import('sharp')) as unknown as {
      default?: SharpFactory;
    } & SharpFactory;
    sharpFactory = module.default ?? module;
  } catch {
    sharpFactory = null;
  }
  return sharpFactory;
}

function resolveTargetFormat(
  sourceFormat: ImageGenResult['format'],
  requested?: 'png' | 'webp',
): SharpFormat {
  if (requested) return requested;
  return sourceFormat === 'jpeg' ? 'jpeg' : sourceFormat === 'webp' ? 'webp' : 'png';
}

function encode(pipeline: SharpPipeline, format: SharpFormat): SharpPipeline {
  switch (format) {
    case 'png':
      return pipeline.png();
    case 'webp':
      return pipeline.webp();
    case 'jpeg':
      return pipeline.jpeg();
  }
}

function uniqueScales(scales: number[] | undefined): number[] {
  return [...new Set(scales ?? [])].filter((scale) => scale > 0).sort((a, b) => a - b);
}

function scaleLabelFor(scale: number): string {
  return Number.isInteger(scale) ? String(scale) : String(scale).replace(/0+$/, '').replace(/\.$/, '');
}
