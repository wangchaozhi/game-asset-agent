import { EventEmitter } from 'node:events';
import type { JobStreamEvent } from '@gaf/shared';

/** 任务事件总线：流水线发布进度，SSE 路由订阅转发给前端 */
export class JobEventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    // SSE 连接数可能超过默认上限
    this.emitter.setMaxListeners(100);
  }

  publish(jobId: string, event: JobStreamEvent): void {
    this.emitter.emit(`job:${jobId}`, event);
  }

  subscribe(jobId: string, listener: (event: JobStreamEvent) => void): () => void {
    const channel = `job:${jobId}`;
    this.emitter.on(channel, listener);
    return () => this.emitter.off(channel, listener);
  }
}
