import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** 素材文件的落盘存储（DATA_DIR/assets 下，经 /files/ 静态服务对外提供） */
export class FileStorage {
  constructor(private readonly dir: string) {}

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
  }

  async save(id: string, ext: string, data: Buffer): Promise<{ fileName: string; size: number }> {
    const fileName = `${id}.${ext}`;
    await writeFile(this.resolve(fileName), data);
    return { fileName, size: data.byteLength };
  }

  async remove(fileName: string): Promise<void> {
    await rm(this.resolve(fileName), { force: true });
  }

  resolve(fileName: string): string {
    // 只允许纯文件名，防止路径穿越
    const base = path.basename(fileName);
    return path.join(this.dir, base);
  }

  get root(): string {
    return this.dir;
  }
}
