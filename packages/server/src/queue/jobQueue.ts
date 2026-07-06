/**
 * 进程内 FIFO 任务队列。
 * 生成任务耗时较长（外部 API），用受控并发防止触发速率限制。
 */
export class JobQueue {
  private readonly waiting: string[] = [];
  private running = 0;

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

  private tick(): void {
    while (this.running < this.concurrency && this.waiting.length > 0) {
      const jobId = this.waiting.shift()!;
      this.running++;
      this.worker(jobId)
        .catch((err) => this.onError(jobId, err))
        .finally(() => {
          this.running--;
          this.tick();
        });
    }
  }
}
