/**
 * 进程内 FIFO 任务队列。
 * 生成任务耗时较长（外部 API），用受控并发防止触发速率限制。
 */
export type CancelOutcome = 'removed' | 'signalled' | 'not-found';

export class JobQueue {
  private readonly waiting: string[] = [];
  private running = 0;
  /** 执行中被请求取消的任务：流水线在阶段边界检查此标记 */
  private readonly canceling = new Set<string>();

  constructor(
    private readonly concurrency: number,
    private readonly worker: (jobId: string) => Promise<void>,
    private readonly onError: (jobId: string, err: unknown) => void = () => {},
  ) {}

  enqueue(jobId: string): void {
    this.waiting.push(jobId);
    this.tick();
  }

  get pending(): number {
    return this.waiting.length;
  }

  get active(): number {
    return this.running;
  }

  /**
   * 取消任务：
   * - 在队列中 → 直接移除（'removed'），调用方置为已取消
   * - 执行中 → 置取消标记（'signalled'），流水线在阶段边界自行终止
   */
  cancel(jobId: string): CancelOutcome {
    const idx = this.waiting.indexOf(jobId);
    if (idx >= 0) {
      this.waiting.splice(idx, 1);
      return 'removed';
    }
    this.canceling.add(jobId);
    return 'signalled';
  }

  isCanceling(jobId: string): boolean {
    return this.canceling.has(jobId);
  }

  private tick(): void {
    while (this.running < this.concurrency && this.waiting.length > 0) {
      const jobId = this.waiting.shift()!;
      this.running++;
      this.worker(jobId)
        .catch((err) => this.onError(jobId, err))
        .finally(() => {
          this.running--;
          this.canceling.delete(jobId);
          this.tick();
        });
    }
  }
}
