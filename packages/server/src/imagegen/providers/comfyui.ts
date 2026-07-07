import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ProviderCheckResult } from '@gaf/shared';
import { errorMessage, fetchWithTimeout, withTiming } from '../../util/http.js';
import type { ImageGenInput, ImageGenResult, ImageProvider, ProgressReporter } from '../types.js';

interface PromptResponse {
  prompt_id?: string;
  error?: unknown;
  node_errors?: unknown;
}

interface HistoryEntry {
  outputs?: Record<
    string,
    { images?: Array<{ filename: string; subfolder: string; type: string }> }
  >;
  status?: { completed?: boolean; status_str?: string };
}

/**
 * 本地 ComfyUI Provider。
 * 通过 /prompt 提交一个参数化的 txt2img workflow（prompt/尺寸/seed 槽位），
 * 轮询 /history/{id} 直至完成，再经 /view 取回图片。
 * 高级用户可在 DATA_DIR/workflows/<model>.json 放置自定义 workflow（含相同槽位占位符）。
 */
export class ComfyUiProvider implements ImageProvider {
  readonly id = 'comfyui';
  readonly label = '本地 ComfyUI';
  readonly requires = ['COMFYUI_URL'];
  readonly models = ['default'];
  readonly defaultModel = 'default';
  readonly supportsNegativePrompt = true;
  readonly outputFormat = 'png';
  readonly note = '本地 ComfyUI；内置 txt2img workflow，可在 DATA_DIR/workflows/ 放自定义模板';

  constructor(
    private readonly baseUrl: string | undefined,
    private readonly workflowsDir: string,
    private readonly checkpoint: string = 'sd_xl_base_1.0.safetensors',
  ) {}

  isConfigured(): boolean {
    return Boolean(this.baseUrl);
  }

  async generate(
    input: ImageGenInput,
    model = this.defaultModel,
    onProgress?: ProgressReporter,
  ): Promise<ImageGenResult> {
    if (!this.baseUrl) throw new Error('ComfyUI 未配置：缺少 COMFYUI_URL');

    const workflow = await this.buildWorkflow(model, input);
    const clientId = `gaf-${Date.now()}`;

    const submit = (await this.request(`${this.baseUrl}/prompt`, {
      method: 'POST',
      body: JSON.stringify({ prompt: workflow, client_id: clientId }),
    })) as PromptResponse;
    if (!submit.prompt_id) {
      throw new Error(
        `ComfyUI 拒绝了 workflow：${JSON.stringify(submit.node_errors ?? submit.error ?? {}).slice(0, 300)}`,
      );
    }

    const image = await this.pollHistory(submit.prompt_id, onProgress);
    const viewUrl = `${this.baseUrl}/view?filename=${encodeURIComponent(image.filename)}&subfolder=${encodeURIComponent(image.subfolder)}&type=${encodeURIComponent(image.type)}`;
    const imgRes = await fetchWithTimeout(viewUrl, {}, 60000);
    if (!imgRes.ok) throw new Error(`ComfyUI 取图失败 (${imgRes.status})`);
    return { data: Buffer.from(await imgRes.arrayBuffer()), format: 'png', model };
  }

  private async pollHistory(
    promptId: string,
    onProgress?: ProgressReporter,
  ): Promise<{ filename: string; subfolder: string; type: string }> {
    const deadline = Date.now() + 180000;
    let attempt = 0;
    while (Date.now() < deadline) {
      await sleep(1500);
      const history = (await this.request(`${this.baseUrl}/history/${promptId}`, {
        method: 'GET',
      })) as Record<string, HistoryEntry>;
      const entry = history[promptId];
      if (entry?.status?.completed) {
        for (const out of Object.values(entry.outputs ?? {})) {
          const img = out.images?.[0];
          if (img) return img;
        }
        throw new Error('ComfyUI 完成但没有图片输出节点（确认 workflow 含 SaveImage）');
      }
      onProgress?.(`ComfyUI 生成中（第 ${++attempt} 次轮询）…`);
    }
    throw new Error('ComfyUI 生成超时（>180s）');
  }

  /** 载入 workflow 模板（自定义优先），填充 prompt/negative/size/seed 槽位 */
  private async buildWorkflow(model: string, input: ImageGenInput): Promise<unknown> {
    const seed = input.seed ?? Math.floor(Math.random() * 1_000_000_000);
    const template = await this.loadTemplate(model);
    const filled = JSON.stringify(template)
      .replaceAll('%prompt%', jsonEscape(input.prompt))
      .replaceAll('%negative%', jsonEscape(input.negativePrompt ?? ''))
      .replaceAll('"%width%"', String(input.width))
      .replaceAll('"%height%"', String(input.height))
      .replaceAll('"%seed%"', String(seed))
      .replaceAll('%checkpoint%', jsonEscape(this.checkpoint));
    return JSON.parse(filled);
  }

  private async loadTemplate(model: string): Promise<unknown> {
    if (model !== 'default') {
      try {
        const file = path.join(this.workflowsDir, `${path.basename(model)}.json`);
        return JSON.parse(await readFile(file, 'utf8'));
      } catch {
        // 找不到自定义模板时回退内置
      }
    }
    return DEFAULT_WORKFLOW;
  }

  private async request(url: string, init: RequestInit): Promise<unknown> {
    const res = await fetchWithTimeout(
      url,
      { ...init, headers: { 'content-type': 'application/json' } },
      30000,
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`ComfyUI 请求失败 (${res.status}): ${text.slice(0, 300)}`);
    }
    return res.json();
  }

  async healthCheck(): Promise<ProviderCheckResult> {
    if (!this.baseUrl) return { ok: false, message: '缺少 COMFYUI_URL' };
    try {
      const { value: res, latencyMs } = await withTiming(() =>
        fetchWithTimeout(`${this.baseUrl}/system_stats`),
      );
      if (!res.ok) return { ok: false, message: `ComfyUI 响应异常 (${res.status})`, latencyMs };
      return { ok: true, message: '连接正常', latencyMs };
    } catch (err) {
      return { ok: false, message: errorMessage(err) };
    }
  }
}

function jsonEscape(text: string): string {
  // 去掉 JSON.stringify 外层引号，仅保留转义后的内部内容，便于内嵌到模板字符串槽位
  return JSON.stringify(text).slice(1, -1);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 内置 txt2img workflow（SDXL 兼容）：占位符会在提交前被实际参数替换 */
const DEFAULT_WORKFLOW = {
  '4': {
    class_type: 'CheckpointLoaderSimple',
    inputs: { ckpt_name: '%checkpoint%' },
  },
  '5': {
    class_type: 'EmptyLatentImage',
    inputs: { width: '%width%', height: '%height%', batch_size: 1 },
  },
  '6': {
    class_type: 'CLIPTextEncode',
    inputs: { text: '%prompt%', clip: ['4', 1] },
  },
  '7': {
    class_type: 'CLIPTextEncode',
    inputs: { text: '%negative%', clip: ['4', 1] },
  },
  '3': {
    class_type: 'KSampler',
    inputs: {
      seed: '%seed%',
      steps: 28,
      cfg: 7,
      sampler_name: 'euler',
      scheduler: 'normal',
      denoise: 1,
      model: ['4', 0],
      positive: ['6', 0],
      negative: ['7', 0],
      latent_image: ['5', 0],
    },
  },
  '8': {
    class_type: 'VAEDecode',
    inputs: { samples: ['3', 0], vae: ['4', 2] },
  },
  '9': {
    class_type: 'SaveImage',
    inputs: { filename_prefix: 'GameAssetForge', images: ['8', 0] },
  },
} as const;
