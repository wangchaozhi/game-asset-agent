import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AssetRecord, Job } from '@gaf/shared';

interface DbShape {
  jobs: Job[];
  assets: AssetRecord[];
}

/**
 * 轻量 JSON 文件存储。
 * 选型考虑：素材元数据体量小、无并发写入方（单进程队列），
 * JSON 文件即可满足且零原生依赖；写入采用 tmp+rename 保证原子性。
 * 若未来数据量增长，可在不改上层接口的情况下替换为 SQLite。
 */
export class Store {
  private jobs = new Map<string, Job>();
  private assets = new Map<string, AssetRecord>();
  private persistTimer: NodeJS.Timeout | null = null;
  private persisting: Promise<void> = Promise.resolve();

  constructor(private readonly file: string) {}

  async init(): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true });
    try {
      const raw = await readFile(this.file, 'utf8');
      const data = JSON.parse(raw) as DbShape;
      for (const job of data.jobs ?? []) this.jobs.set(job.id, job);
      for (const asset of data.assets ?? []) this.assets.set(asset.id, asset);
    } catch {
      // 文件不存在或损坏时从空库开始（损坏文件会在下次持久化时被覆盖）
    }
  }

  // ---------- Job ----------

  createJob(job: Job): Job {
    this.jobs.set(job.id, job);
    this.schedulePersist();
    return job;
  }

  getJob(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  updateJob(id: string, mutate: (job: Job) => void): Job | undefined {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    mutate(job);
    job.updatedAt = Date.now();
    this.schedulePersist();
    return job;
  }

  listJobs(limit = 50): Job[] {
    return [...this.jobs.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
  }

  // ---------- Asset ----------

  addAsset(asset: AssetRecord): AssetRecord {
    this.assets.set(asset.id, asset);
    this.schedulePersist();
    return asset;
  }

  getAsset(id: string): AssetRecord | undefined {
    return this.assets.get(id);
  }

  deleteAsset(id: string): AssetRecord | undefined {
    const asset = this.assets.get(id);
    if (!asset) return undefined;
    this.assets.delete(id);
    const job = this.jobs.get(asset.jobId);
    if (job) {
      job.assetIds = job.assetIds.filter((a) => a !== id);
    }
    this.schedulePersist();
    return asset;
  }

  listAssets(options: { jobId?: string; limit?: number } = {}): AssetRecord[] {
    let all = [...this.assets.values()];
    if (options.jobId) all = all.filter((a) => a.jobId === options.jobId);
    all.sort((a, b) => b.createdAt - a.createdAt);
    return all.slice(0, options.limit ?? 200);
  }

  // ---------- 持久化 ----------

  private schedulePersist(): void {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      // 串行化写入，避免 tmp 文件相互覆盖
      this.persisting = this.persisting.then(() => this.persist());
    }, 300);
  }

  private async persist(): Promise<void> {
    const data: DbShape = {
      jobs: [...this.jobs.values()],
      assets: [...this.assets.values()],
    };
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
    await rename(tmp, this.file);
  }

  /** 进程退出前调用，确保挂起的写入完成 */
  async flush(): Promise<void> {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    this.persisting = this.persisting.then(() => this.persist());
    await this.persisting;
  }
}
