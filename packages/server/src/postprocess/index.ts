import type { AssetVariant, GenerationRequest } from '@gaf/shared';
import type { ImageGenResult } from '../imagegen/types.js';
import type { FileStorage } from '../storage/files.js';

type SharpFormat = 'png' | 'webp' | 'jpeg';
type SharpMetadata = { width?: number; height?: number };
type SharpRawInfo = { width: number; height: number; size: number; channels: number };
type SharpResolved = { data: Buffer; info: SharpRawInfo };
type CompositeItem = { input: Buffer; left: number; top: number };
type SharpPipeline = {
  metadata(): Promise<SharpMetadata>;
  resize(width: number, height: number, options?: { fit?: 'inside' | 'fill' }): SharpPipeline;
  extract(region: { left: number; top: number; width: number; height: number }): SharpPipeline;
  composite(items: CompositeItem[]): SharpPipeline;
  ensureAlpha(): SharpPipeline;
  raw(): SharpPipeline;
  png(): SharpPipeline;
  webp(): SharpPipeline;
  jpeg(): SharpPipeline;
  toBuffer(options: { resolveWithObject: true }): Promise<SharpResolved>;
  toBuffer(): Promise<Buffer>;
};
type SharpRawOptions = { raw: { width: number; height: number; channels: number } };
type SharpCreateInput = {
  create: {
    width: number;
    height: number;
    channels: 4;
    background: { r: number; g: number; b: number; alpha: number };
  };
};
type SharpFactory = (input: Buffer | SharpCreateInput, options?: SharpRawOptions) => SharpPipeline;

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
  const wantsTransparent =
    Boolean(input.request.transparentBackground) &&
    (input.request.assetType === 'sprite' || input.request.assetType === 'icon');
  if (!options && !wantsTransparent) return { variants: [] };

  const requestedScales = uniqueScales(options?.variants);
  const targetFormat = resolveTargetFormat(input.result.format, options?.format);
  const scales = requestedScales.length > 0 ? requestedScales : options?.format ? [1] : [];
  if (scales.length === 0 && !wantsTransparent) return { variants: [] };

  const sharp = await loadSharp();
  if (!sharp) {
    return {
      variants: [],
      skippedReason: '未安装 sharp，已跳过后处理；安装可选依赖后会自动启用',
    };
  }

  try {
    const variants: AssetVariant[] = [];
    // 主图数据：透明去底时先抠图，后续变体基于去底结果（sharp 可栅格化 SVG）
    let baseData = input.result.data;
    if (wantsTransparent) {
      const cut = await removeBackground(sharp, baseData);
      if (cut) {
        baseData = cut;
        const saved = await input.storage.saveDerived(input.assetId, '-transparent', 'png', cut);
        variants.push({
          label: '透明 png',
          fileName: saved.fileName,
          width: 0,
          height: 0,
          format: 'png',
          fileSize: saved.size,
        });
      }
    }

    const base = sharp(baseData);
    const metadata = await base.metadata();
    const sourceWidth = metadata.width ?? input.request.width;
    const sourceHeight = metadata.height ?? input.request.height;

    for (const scale of scales) {
      const width = Math.max(1, Math.round(sourceWidth * scale));
      const height = Math.max(1, Math.round(sourceHeight * scale));
      const pipeline = sharp(baseData).resize(width, height, { fit: 'fill' });
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

/**
 * 无缝贴图接缝自检：把图像按 50% 偏移环绕拼接（交换对角象限），
 * 原本贴图的边缘被移到画面中央，肉眼即可看出是否有可见接缝。
 */
export async function makeSeamPreview(data: Buffer): Promise<Buffer | null> {
  const sharp = await loadSharp();
  if (!sharp) return null;
  try {
    const meta = await sharp(data).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (w < 2 || h < 2) return null;
    const hw = Math.floor(w / 2);
    const hh = Math.floor(h / 2);
    // 四象限
    const tl = await sharp(data)
      .extract({ left: 0, top: 0, width: hw, height: hh })
      .png()
      .toBuffer();
    const tr = await sharp(data)
      .extract({ left: hw, top: 0, width: w - hw, height: hh })
      .png()
      .toBuffer();
    const bl = await sharp(data)
      .extract({ left: 0, top: hh, width: hw, height: h - hh })
      .png()
      .toBuffer();
    const br = await sharp(data)
      .extract({ left: hw, top: hh, width: w - hw, height: h - hh })
      .png()
      .toBuffer();
    // 对角交换：new TL=BR, new TR=BL, new BL=TR, new BR=TL
    return await sharp(data)
      .composite([
        { input: br, left: 0, top: 0 },
        { input: bl, left: w - hw, top: 0 },
        { input: tr, left: 0, top: h - hh },
        { input: tl, left: w - hw, top: h - hh },
      ])
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}

export interface SpritesheetResult {
  sheet: Buffer;
  /** TexturePacker JSON Hash（Phaser 可直接 load.atlas） */
  atlas: unknown;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  rows: number;
  frameCount: number;
}

/**
 * 把多帧图像合成为统一网格精灵表（PNG）+ TexturePacker/Phaser 兼容 JSON。
 * 各帧统一缩放到首帧尺寸（上限 maxFrame），按近似正方形网格排布。
 */
export async function composeSpritesheet(
  frames: Buffer[],
  sheetImageName: string,
  maxFrame = 512,
): Promise<SpritesheetResult | null> {
  const sharp = await loadSharp();
  if (!sharp || frames.length < 2) return null;
  try {
    const meta = await sharp(frames[0]).metadata();
    const srcW = meta.width ?? maxFrame;
    const srcH = meta.height ?? maxFrame;
    const frameWidth = Math.min(srcW, maxFrame);
    const frameHeight = Math.max(1, Math.round(frameWidth * (srcH / srcW)));

    const columns = Math.ceil(Math.sqrt(frames.length));
    const rows = Math.ceil(frames.length / columns);
    const sheetWidth = frameWidth * columns;
    const sheetHeight = frameHeight * rows;

    const composites: CompositeItem[] = [];
    const atlasFrames: Record<string, unknown> = {};
    for (let i = 0; i < frames.length; i++) {
      const resized = await sharp(frames[i])
        .resize(frameWidth, frameHeight, { fit: 'fill' })
        .png()
        .toBuffer();
      const col = i % columns;
      const row = Math.floor(i / columns);
      const left = col * frameWidth;
      const top = row * frameHeight;
      composites.push({ input: resized, left, top });
      atlasFrames[`frame_${i}`] = {
        frame: { x: left, y: top, w: frameWidth, h: frameHeight },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: frameWidth, h: frameHeight },
        sourceSize: { w: frameWidth, h: frameHeight },
      };
    }

    const sheet = await sharp({
      create: {
        width: sheetWidth,
        height: sheetHeight,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite(composites)
      .png()
      .toBuffer();

    const atlas = {
      frames: atlasFrames,
      meta: {
        app: 'GameAsset Forge',
        version: '1.0',
        image: sheetImageName,
        format: 'RGBA8888',
        size: { w: sheetWidth, h: sheetHeight },
        scale: '1',
        frameWidth,
        frameHeight,
        columns,
        rows,
      },
    };

    return { sheet, atlas, frameWidth, frameHeight, columns, rows, frameCount: frames.length };
  } catch {
    return null;
  }
}

/** 色键去底：以四角平均色为背景，欧氏距离阈值内的像素 alpha 置 0 */
async function removeBackground(sharp: SharpFactory, data: Buffer): Promise<Buffer | null> {
  const { data: raw, info } = await sharp(data).ensureAlpha().raw().toBuffer({
    resolveWithObject: true,
  });
  const { width, height, channels } = info;
  if (channels < 3) return null;
  const bg = cornerAverage(raw, width, height, channels);
  const threshold = 46;
  const thresholdSq = threshold * threshold;
  for (let i = 0; i < raw.length; i += channels) {
    const dr = raw[i] - bg[0];
    const dg = raw[i + 1] - bg[1];
    const db = raw[i + 2] - bg[2];
    if (dr * dr + dg * dg + db * db <= thresholdSq) {
      raw[i + 3] = 0;
    }
  }
  return sharp(raw, { raw: { width, height, channels } }).png().toBuffer();
}

function cornerAverage(
  raw: Buffer,
  width: number,
  height: number,
  channels: number,
): [number, number, number] {
  const corners = [
    0,
    (width - 1) * channels,
    width * (height - 1) * channels,
    (width * height - 1) * channels,
  ];
  let r = 0;
  let g = 0;
  let b = 0;
  for (const idx of corners) {
    r += raw[idx];
    g += raw[idx + 1];
    b += raw[idx + 2];
  }
  return [Math.round(r / 4), Math.round(g / 4), Math.round(b / 4)];
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
  return Number.isInteger(scale)
    ? String(scale)
    : String(scale).replace(/0+$/, '').replace(/\.$/, '');
}
