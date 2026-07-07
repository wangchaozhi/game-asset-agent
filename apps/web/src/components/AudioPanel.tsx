import { useMemo, useState } from 'react';
import type { AudioAssetType, ProvidersResponse } from '@gaf/shared';
import { AUDIO_TYPE_META, AUDIO_TYPES } from '@gaf/shared';
import { api } from '../api';
import { JobProgress } from './JobProgress';

interface Props {
  providers: ProvidersResponse;
}

export function AudioPanel({ providers }: Props) {
  const audioProviders = providers.audioProviders ?? [];
  const configured = audioProviders.filter((p) => p.configured);
  const defaultProvider =
    configured.find((p) => p.id !== 'mock-audio')?.id ?? configured[0]?.id ?? 'mock-audio';

  const [brief, setBrief] = useState('');
  const [audioType, setAudioType] = useState<AudioAssetType>('sfx');
  const [providerId, setProviderId] = useState(defaultProvider);
  const [model, setModel] = useState('');
  const [count, setCount] = useState(1);
  const [duration, setDuration] = useState(AUDIO_TYPE_META.sfx.defaultDuration);
  const [seed, setSeed] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  const provider = useMemo(
    () => audioProviders.find((p) => p.id === providerId),
    [audioProviders, providerId],
  );

  const changeType = (next: AudioAssetType) => {
    setAudioType(next);
    setDuration(AUDIO_TYPE_META[next].defaultDuration);
  };

  const submit = async () => {
    setError(null);
    if (brief.trim().length < 2) {
      setError('请先描述你想要的声音（至少 2 个字符）');
      return;
    }
    setSubmitting(true);
    try {
      const job = await api.createJob({
        kind: 'audio',
        brief: brief.trim(),
        assetType: audioType,
        style: 'game-audio',
        provider: providerId,
        ...(model ? { model } : {}),
        count,
        durationSeconds: duration,
        // 图像字段占位（schema 需要，音频流水线忽略）
        width: 512,
        height: 512,
        maxRetries: 0,
        ...(seed.trim() !== '' && Number.isFinite(Number(seed)) ? { seed: Number(seed) } : {}),
      });
      setActiveJobId(job.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="generate-layout">
      <section className="card form-card">
        <h2>音频需求描述</h2>
        <textarea
          className="brief"
          placeholder="例如：金属剑刃挥砍的锋利破空声 / 8-bit 风格的洞穴探险循环背景音乐…"
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={4}
        />

        <div className="form-grid">
          <label>
            音频类型
            <select
              value={audioType}
              onChange={(e) => changeType(e.target.value as AudioAssetType)}
            >
              {AUDIO_TYPES.map((t) => (
                <option key={t} value={t}>
                  {AUDIO_TYPE_META[t].label} · {AUDIO_TYPE_META[t].labelEn}
                </option>
              ))}
            </select>
          </label>

          <label>
            生成引擎
            <select
              value={providerId}
              onChange={(e) => {
                setProviderId(e.target.value);
                setModel('');
              }}
            >
              {audioProviders.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.configured}>
                  {p.label}
                  {p.configured ? '' : '（未配置）'}
                </option>
              ))}
            </select>
          </label>

          <label>
            模型
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              <option value="">默认（{provider?.defaultModel}）</option>
              {provider?.models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>

          <label>
            数量（1-8）
            <input
              type="number"
              min={1}
              max={8}
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(8, Number(e.target.value) || 1)))}
            />
          </label>

          <label>
            时长（秒）：{duration}
            <input
              type="range"
              min={0.5}
              max={audioType === 'bgm' ? 30 : 10}
              step={0.5}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            />
          </label>

          <label>
            随机种子（可选）
            <input
              type="number"
              min={0}
              placeholder="留空为随机"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
            />
          </label>
        </div>

        {provider?.note && <p className="hint">{provider.note}</p>}
        {error && <div className="alert error">{error}</div>}

        <button className="primary" onClick={submit} disabled={submitting}>
          {submitting ? '提交中…' : '🎧 生成音频'}
        </button>
      </section>

      {activeJobId && (
        <section className="card progress-card">
          <JobProgress key={activeJobId} jobId={activeJobId} />
        </section>
      )}
    </div>
  );
}
