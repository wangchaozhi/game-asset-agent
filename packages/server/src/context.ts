import type { AudioProviderRegistry } from './audiogen/registry.js';
import type { ServerConfig } from './config.js';
import type { Store } from './db/store.js';
import type { JobEventBus } from './events.js';
import type { ProviderRegistry } from './imagegen/registry.js';
import type { LlmClient } from './llm/types.js';
import type { JobQueue } from './queue/jobQueue.js';
import type { FileStorage } from './storage/files.js';

/** 应用上下文：显式依赖注入，便于测试与替换实现 */
export interface AppContext {
  config: ServerConfig;
  store: Store;
  storage: FileStorage;
  registry: ProviderRegistry;
  audioRegistry: AudioProviderRegistry;
  llm: LlmClient | null;
  events: JobEventBus;
  queue: JobQueue;
}
