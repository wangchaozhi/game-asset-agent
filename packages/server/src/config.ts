import path from 'node:path';

export type LlmProviderKind = 'anthropic' | 'openai' | 'none';

export interface ServerConfig {
  port: number;
  host: string;
  dataDir: string;
  assetsDir: string;
  dbFile: string;
  queueConcurrency: number;
  llm: {
    provider: LlmProviderKind;
    model: string;
    anthropicApiKey?: string;
    openaiApiKey?: string;
    openaiBaseUrl: string;
  };
  imageProviders: {
    openaiApiKey?: string;
    openaiBaseUrl: string;
    stabilityApiKey?: string;
    sdWebuiUrl?: string;
  };
}

function detectLlmProvider(env: NodeJS.ProcessEnv): LlmProviderKind {
  const explicit = env.LLM_PROVIDER?.toLowerCase();
  if (explicit === 'anthropic' || explicit === 'openai' || explicit === 'none') {
    return explicit;
  }
  if (env.ANTHROPIC_API_KEY) return 'anthropic';
  if (env.OPENAI_API_KEY) return 'openai';
  return 'none';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const dataDir = path.resolve(env.DATA_DIR ?? './data');
  const llmProvider = detectLlmProvider(env);
  const openaiBaseUrl = (env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/+$/, '');

  return {
    port: Number(env.PORT ?? 8787),
    host: env.HOST ?? '127.0.0.1',
    dataDir,
    assetsDir: path.join(dataDir, 'assets'),
    dbFile: path.join(dataDir, 'db.json'),
    queueConcurrency: Math.max(1, Number(env.QUEUE_CONCURRENCY ?? 1)),
    llm: {
      provider: llmProvider,
      model: env.LLM_MODEL ?? (llmProvider === 'anthropic' ? 'claude-opus-4-8' : 'gpt-4o-mini'),
      anthropicApiKey: env.ANTHROPIC_API_KEY,
      openaiApiKey: env.OPENAI_API_KEY,
      openaiBaseUrl,
    },
    imageProviders: {
      openaiApiKey: env.OPENAI_API_KEY,
      openaiBaseUrl,
      stabilityApiKey: env.STABILITY_API_KEY,
      sdWebuiUrl: env.SD_WEBUI_URL?.replace(/\/+$/, ''),
    },
  };
}
