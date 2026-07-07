import { existsSync } from 'node:fs';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import type { AssetRecord } from '@gaf/shared';
import { ZipArchive, type ArchiverError } from 'archiver';
import type { FastifyReply } from 'fastify';
import type { FileStorage } from '../storage/files.js';

interface ManifestFile {
  role: 'original' | 'variant';
  label?: string;
  fileName: string;
  path: string;
}

export interface ExtraExportFile {
  fileName: string;
  /** zip 内路径 */
  path: string;
}

export function sendAssetsZip(
  reply: FastifyReply,
  storage: FileStorage,
  assets: AssetRecord[],
  downloadName: string,
  extraFiles: ExtraExportFile[] = [],
): void {
  const safeDownloadName = sanitizeDownloadName(downloadName);
  reply.hijack();
  reply.raw.writeHead(200, {
    'content-type': 'application/zip',
    'content-disposition': `attachment; filename="${safeDownloadName}"; filename*=UTF-8''${encodeURIComponent(
      safeDownloadName,
    )}`,
  });

  const archive = new ZipArchive({ zlib: { level: 9 } });
  archive.on('error', (err: ArchiverError) => reply.raw.destroy(err));
  archive.pipe(reply.raw);

  const manifestAssets = assets.map((asset) => {
    const files = collectAssetFiles(asset);
    for (const file of files) {
      const diskPath = storage.resolve(file.fileName);
      if (existsSync(diskPath)) {
        archive.append(createReadStream(diskPath), { name: file.path });
      }
    }
    return { ...asset, files };
  });

  for (const extra of extraFiles) {
    const diskPath = storage.resolve(extra.fileName);
    if (existsSync(diskPath)) {
      archive.append(createReadStream(diskPath), { name: extra.path });
    }
  }

  archive.append(
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        assetCount: assets.length,
        assets: manifestAssets,
      },
      null,
      2,
    ),
    { name: 'manifest.json' },
  );

  void archive.finalize();
}

function collectAssetFiles(asset: AssetRecord): ManifestFile[] {
  return [
    {
      role: 'original',
      fileName: asset.fileName,
      path: archivePath(asset.fileName),
    },
    ...(asset.variants ?? []).map((variant) => ({
      role: 'variant' as const,
      label: variant.label,
      fileName: variant.fileName,
      path: archivePath(variant.fileName),
    })),
  ];
}

function archivePath(fileName: string): string {
  return path.posix.join('assets', path.basename(fileName));
}

function sanitizeDownloadName(name: string): string {
  const safe = name.replace(/[^\w.@-]+/g, '-').replace(/^-+|-+$/g, '');
  return safe.endsWith('.zip') ? safe : `${safe || 'assets'}.zip`;
}
