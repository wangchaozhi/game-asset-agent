import path from 'node:path';

export type LlmProviderKind = 'anthropic' | 'openai' | 'gemini' | 'none';

export interface ServerConfig {
  port: number;
  host: string;
  dataDir: string;
  assetsDir: string;
  dbFile: string;
  queueConcurrency: number;
  /** 管理员访问令牌；设置后所有 /api 需 Bearer 鉴权（未设置则开放） */
  authToken?: string;
  llm: {
    provider: LlmProviderKind;
    model: string;
    anthropicApiKey?: string;
    openaiApiKey?: string;
    openaiBaseUrl: string;
    geminiApiKey?: string;
  };
  imageProviders: {
    openaiApiKey?: string;
    openaiBaseUrl: string;
    stabilityApiKey?: string;
    sdWebuiUrl?: string;
    replicateToken?: string;
    comfyuiUrl?: string;
    comfyuiCheckpoint: string;
    dashscopeApiKey?: string;
  };
  audioProviders: {
    elevenLabsApiKey?: string;
    stabilityApiKey?: string;
  };
  /** ComfyUI 自定义 workflow 目录（DATA_DIR/workflows） */
  workflowsDir: string;
}

function detectLlmProvider(env: NodeJS.ProcessEnv): LlmProviderKind {
  const explicit = env.LLM_PROVIDER?.toLowerCase();
  if (
    explicit === 'anthropic' ||
    explicit === 'openai' ||
    explicit === 'gemini' ||
    explicit === 'none'
  ) {
    return explicit;
  }
  if (env.ANTHROPIC_API_KEY) return 'anthropic';
  if (env.OPENAI_API_KEY) return 'openai';
  if (env.GEMINI_API_KEY || env.GOOGLE_API_KEY) return 'gemini';
  return 'none';
}

function defaultLlmModel(provider: LlmProviderKind): string {
  switch (provider) {
    case 'anthropic':
      return 'claude-opus-4-8';
    case 'gemini':
      return 'gemini-2.0-flash';
    default:
      return 'gpt-4o-mini';
  }
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
    workflowsDir: path.join(dataDir, 'workflows'),
    queueConcurrency: Math.max(1, Number(env.QUEUE_CONCURRENCY ?? 1)),
    authToken: env.AUTH_TOKEN && env.AUTH_TOKEN.length > 0 ? env.AUTH_TOKEN : undefined,
    llm: {
      provider: llmProvider,
      model: env.LLM_MODEL ?? defaultLlmModel(llmProvider),
      anthropicApiKey: env.ANTHROPIC_API_KEY,
      openaiApiKey: env.OPENAI_API_KEY,
      openaiBaseUrl,
      geminiApiKey: env.GEMINI_API_KEY ?? env.GOOGLE_API_KEY,
    },
    imageProviders: {
      openaiApiKey: env.OPENAI_API_KEY,
      openaiBaseUrl,
      stabilityApiKey: env.STABILITY_API_KEY,
      sdWebuiUrl: env.SD_WEBUI_URL?.replace(/\/+$/, ''),
      replicateToken: env.REPLICATE_API_TOKEN,
      comfyuiUrl: env.COMFYUI_URL?.replace(/\/+$/, ''),
      comfyuiCheckpoint: env.COMFYUI_CHECKPOINT ?? 'sd_xl_base_1.0.safetensors',
      dashscopeApiKey: env.DASHSCOPE_API_KEY,
    },
    audioProviders: {
      elevenLabsApiKey: env.ELEVENLABS_API_KEY,
      stabilityApiKey: env.STABILITY_API_KEY,
    },
  };
}
