import type { ProviderInfo } from '@gaf/shared';
import type { ServerConfig } from '../config.js';
import { ElevenLabsAudioProvider } from './providers/elevenlabs.js';
import { MockAudioProvider } from './providers/mockAudio.js';
import { StableAudioProvider } from './providers/stableAudio.js';
import { toAudioProviderInfo, type AudioProvider } from './types.js';

/** 音频 Provider 注册表（与图像注册表同构） */
export class AudioProviderRegistry {
  private readonly providers = new Map<string, AudioProvider>();

  register(provider: AudioProvider): this {
    this.providers.set(provider.id, provider);
    return this;
  }

  get(id: string): AudioProvider | undefined {
    return this.providers.get(id);
  }

  list(): ProviderInfo[] {
    return [...this.providers.values()].map(toAudioProviderInfo);
  }
}

export function createAudioRegistry(config: ServerConfig): AudioProviderRegistry {
  const { audioProviders } = config;
  return new AudioProviderRegistry()
    .register(new MockAudioProvider())
    .register(new ElevenLabsAudioProvider(audioProviders.elevenLabsApiKey))
    .register(new StableAudioProvider(audioProviders.stabilityApiKey));
}
