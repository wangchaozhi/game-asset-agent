import type { ProviderInfo } from '@gaf/shared';
import type { ServerConfig } from '../config.js';
import { ComfyUiProvider } from './providers/comfyui.js';
import { MockProvider } from './providers/mock.js';
import { OpenAiImagesProvider } from './providers/openaiImages.js';
import { ReplicateProvider } from './providers/replicate.js';
import { SdWebuiProvider } from './providers/sdWebui.js';
import { StabilityProvider } from './providers/stability.js';
import { TongyiWanxiangProvider } from './providers/tongyiWanxiang.js';
import { toProviderInfo, type ImageProvider } from './types.js';

/** 图像 Provider 注册表：新增模型服务只需 register 一行 */
export class ProviderRegistry {
  private readonly providers = new Map<string, ImageProvider>();

  register(provider: ImageProvider): this {
    this.providers.set(provider.id, provider);
    return this;
  }

  get(id: string): ImageProvider | undefined {
    return this.providers.get(id);
  }

  list(): ProviderInfo[] {
    return [...this.providers.values()].map(toProviderInfo);
  }
}

export function createRegistry(config: ServerConfig): ProviderRegistry {
  const { imageProviders } = config;
  return new ProviderRegistry()
    .register(new MockProvider())
    .register(new OpenAiImagesProvider(imageProviders.openaiApiKey, imageProviders.openaiBaseUrl))
    .register(new StabilityProvider(imageProviders.stabilityApiKey))
    .register(new ReplicateProvider(imageProviders.replicateToken))
    .register(new TongyiWanxiangProvider(imageProviders.dashscopeApiKey))
    .register(new SdWebuiProvider(imageProviders.sdWebuiUrl))
    .register(
      new ComfyUiProvider(
        imageProviders.comfyuiUrl,
        config.workflowsDir,
        imageProviders.comfyuiCheckpoint,
      ),
    );
}
