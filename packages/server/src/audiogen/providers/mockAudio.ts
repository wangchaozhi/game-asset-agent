import type { ProviderCheckResult } from '@gaf/shared';
import type { AudioGenInput, AudioGenResult, AudioProvider } from '../types.js';

/**
 * Mock 音频 Provider：零依赖、零密钥的确定性 WAV 合成器。
 * 作用与 Mock 图像 Provider 一致：无密钥也能端到端跑通音频流水线，
 * 产出可试听的占位音效 / BGM（同提示词得到同样的音频）。
 */
export class MockAudioProvider implements AudioProvider {
  readonly id = 'mock-audio';
  readonly label = '内置音频合成器 (Mock)';
  readonly requires: string[] = [];
  readonly models = ['mock-synth-v1'];
  readonly defaultModel = 'mock-synth-v1';
  readonly kinds = ['sfx', 'bgm'] as const;
  readonly outputFormat = 'wav' as const;
  readonly note = '无需密钥，本地确定性合成 WAV 占位音频，用于体验流程与原型';

  isConfigured(): boolean {
    return true;
  }

  async generate(input: AudioGenInput): Promise<AudioGenResult> {
    const seed = input.seed ?? fnv1a(input.prompt);
    const samples = synth(input.kind, input.durationSeconds, seed);
    return { data: encodeWav(samples, SAMPLE_RATE), format: 'wav', model: this.defaultModel };
  }

  async healthCheck(): Promise<ProviderCheckResult> {
    return { ok: true, message: '内置音频合成器随时可用（无需密钥）', latencyMs: 0 };
  }
}

const SAMPLE_RATE = 44100;

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 五声音阶（相对基频的半音），BGM 听感更悦耳 */
const PENTATONIC = [0, 2, 4, 7, 9, 12];

function semitone(base: number, semi: number): number {
  return base * Math.pow(2, semi / 12);
}

function synth(kind: 'sfx' | 'bgm', durationSeconds: number, seed: number): Float32Array {
  const rng = mulberry32(seed);
  const duration = Math.max(0.2, Math.min(30, durationSeconds));
  const n = Math.floor(SAMPLE_RATE * duration);
  const out = new Float32Array(n);

  if (kind === 'sfx') {
    // 音效：主频 + 五度谐波，指数衰减包络 + 少量噪声
    const baseFreq = 180 + rng() * 520;
    const decay = 3 + rng() * 5;
    const noiseAmt = 0.05 + rng() * 0.15;
    for (let i = 0; i < n; i++) {
      const t = i / SAMPLE_RATE;
      const env = Math.exp(-t * decay);
      const tone =
        Math.sin(2 * Math.PI * baseFreq * t) * 0.6 +
        Math.sin(2 * Math.PI * baseFreq * 1.5 * t) * 0.25;
      const noise = (rng() * 2 - 1) * noiseAmt;
      out[i] = (tone + noise) * env * 0.8;
    }
  } else {
    // BGM：五声音阶琶音 + 低音铺底 + 缓慢音量起伏，末尾淡出便于循环
    const baseFreq = semitone(220, Math.floor(rng() * 5) - 2);
    const noteLen = 0.28 + rng() * 0.12;
    const notesPerBar = PENTATONIC.length;
    for (let i = 0; i < n; i++) {
      const t = i / SAMPLE_RATE;
      const noteIdx = Math.floor(t / noteLen) % notesPerBar;
      const freq = semitone(baseFreq, PENTATONIC[noteIdx]);
      const localT = t % noteLen;
      const noteEnv = Math.exp(-localT * 4);
      const melody = Math.sin(2 * Math.PI * freq * t) * noteEnv * 0.4;
      const bass = Math.sin(2 * Math.PI * (baseFreq / 2) * t) * 0.18;
      const lfo = 0.75 + 0.25 * Math.sin(2 * Math.PI * 0.15 * t);
      out[i] = (melody + bass) * lfo * 0.7;
    }
    // 首尾各 120ms 淡入淡出（便于无缝循环）
    applyFades(out, Math.floor(SAMPLE_RATE * 0.12));
  }
  return out;
}

function applyFades(buf: Float32Array, fade: number): void {
  const n = buf.length;
  for (let i = 0; i < fade && i < n; i++) {
    const g = i / fade;
    buf[i] *= g;
    buf[n - 1 - i] *= g;
  }
}

/** 编码为 16-bit PCM 单声道 WAV */
function encodeWav(samples: Float32Array, sampleRate: number): Buffer {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // fmt chunk size
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28); // byte rate
  buffer.writeUInt16LE(bytesPerSample, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), offset);
    offset += bytesPerSample;
  }
  return buffer;
}
