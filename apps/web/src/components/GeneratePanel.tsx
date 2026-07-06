import { useMemo, useState } from 'react';
import type { AssetType, ProvidersResponse } from '@gaf/shared';
import { ASSET_TYPE_META, ASSET_TYPES, STYLE_PRESETS } from '@gaf/shared';
import { api } from '../api';
import { JobProgress } from './JobProgress';

interface Props {
  providers: ProvidersResponse;
}

export function GeneratePanel({ providers }: Props) {
  const configured = providers.imageProviders.filter((p) => p.configured);
  const defaultProvider =
    configured.find((p) => p.id !== 'mock')?.id ?? configured[0]?.id ?? 'mock';

  const [brief, setBrief] = useState('');
  const [assetType, setAssetType] = useState<AssetType>('sprite');
  const [style, setStyle] = useState(STYLE_PRESETS[0].id);
  const [providerId, setProviderId] = useState(defaultProvider);
  const [model, setModel] = useState('');
  const [count, setCount] = useState(1);
  const [width, setWidth] = useState(ASSET_TYPE_META.sprite.defaultSize.width);
  const [height, setHeight] = useState(ASSET_TYPE_META.sprite.defaultSize.height);
  const [negativePrompt, setNegativePrompt] = useState('');
  const [maxRetries, setMaxRetries] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  const provider = useMemo(
    () => providers.imageProviders.find((p) => p.id === providerId),
    [providers, providerId],
  );

  const changeAssetType = (next: AssetType) => {
    setAssetType(next);
    setWidth(ASSET_TYPE_META[next].defaultSize.width);
    setHeight(ASSET_TYPE_META[next].defaultSize.height);
  };

  const submit = async () => {
    setError(null);
    if (brief.trim().length < 2) {
      setError('请先描述你想要的素材（至少 2 个字符）');
      return;
    }
    setSubmitting(true);
    try {
      const job = await api.createJob({
        brief: brief.trim(),
        assetType,
        style,
        provider: providerId,
        ...(model ? { model } : {}),
        count,
        width,
        height,
        ...(negativePrompt.trim() ? { negativePrompt: negativePrompt.trim() } : {}),
        maxRetries,
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
        <h2>需求描述</h2>
        <textarea
          className="brief"
          placeholder="例如：一套奇幻风格的药水瓶图标，分别是生命药水、法力药水和剧毒药水…"
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={4}
        />

        <div className="form-grid">
          <label>
            素材类型
            <select
              value={assetType}
              onChange={(e) => changeAssetType(e.target.value as AssetType)}
            >
              {ASSET_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ASSET_TYPE_META[t].label}
                </option>
              ))}
            </select>
          </label>

          <label>
            美术风格
            <select value={style} onChange={(e) => setStyle(e.target.value)}>
              {STYLE_PRESETS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} · {s.labelEn}
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
              {providers.imageProviders.map((p) => (
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
            审查重试上限
            <select value={maxRetries} onChange={(e) => setMaxRetries(Number(e.target.value))}>
              <option value={0}>不重试</option>
              <option value={1}>1 次</option>
              <option value={2}>2 次</option>
              <option value={3}>3 次</option>
            </select>
          </label>

          <label>
            宽度
            <input
              type="number"
              min={64}
              max={2048}
              step={64}
              value={width}
              onChange={(e) => setWidth(Number(e.target.value) || 1024)}
            />
          </label>

          <label>
            高度
            <input
              type="number"
              min={64}
              max={2048}
              step={64}
              value={height}
              onChange={(e) => setHeight(Number(e.target.value) || 1024)}
            />
          </label>
        </div>

        <label className="full">
          附加负向提示词（可选）
          <input
            type="text"
            placeholder="不想出现的元素，例如：文字, 水印, 模糊"
            value={negativePrompt}
            onChange={(e) => setNegativePrompt(e.target.value)}
          />
        </label>

        {provider?.note && <p className="hint">{provider.note}</p>}
        {error && <div className="alert error">{error}</div>}

        <button className="primary" onClick={submit} disabled={submitting}>
          {submitting ? '提交中…' : '⚒ 开始生成'}
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
