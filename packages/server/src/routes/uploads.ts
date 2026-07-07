import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { uploadSchema } from '@gaf/shared';
import type { AppContext } from '../context.js';

const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
};

/** 参考图上传：接收 base64 data URL，落盘到素材目录（经 /files/ 可预览） */
export function registerUploadRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.post('/api/uploads', async (request, reply) => {
    const parsed = uploadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: '上传参数不合法',
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    const match = /^data:(image\/[a-z]+);base64,(.+)$/is.exec(parsed.data.dataUrl);
    if (!match) return reply.status(400).send({ error: '无法解析 data URL' });
    const mime = match[1].toLowerCase();
    const ext = EXT[mime];
    if (!ext) return reply.status(400).send({ error: `不支持的图片类型：${mime}` });

    const data = Buffer.from(match[2], 'base64');
    if (data.byteLength === 0) return reply.status(400).send({ error: '图片数据为空' });
    const saved = await ctx.storage.save(`upload-${randomUUID()}`, ext, data);
    return reply.status(201).send({ fileName: saved.fileName, url: `/files/${saved.fileName}` });
  });
}
