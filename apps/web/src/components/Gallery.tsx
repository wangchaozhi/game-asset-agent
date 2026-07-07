import { useEffect, useMemo, useState } from 'react';
import type { AssetRecord, AssetType, GenerationRequest } from '@gaf/shared';
import { ASSET_TYPE_META, AUDIO_TYPE_META, getStylePreset } from '@gaf/shared';
import { api } from '../api';
import { isAudioAsset } from './JobProgress';

interface Props {
  /** 「基于此素材重新生成」：把素材参数回填到生成表单 */
  onRegenerate?: (prefill: Partial<GenerationRequest>) => void;
}

const RASTER = /\.(png|jpe?g|webp)$/i;

export function Gallery({ onRegenerate }: Props) {
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [filter, setFilter] = useState<AssetType | 'all'>('all');
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const load = () => {
    setLoading(true);
    api
      .assets()
      .then(setAssets)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const providerIds = useMemo(() => [...new Set(assets.map((a) => a.provider))].sort(), [assets]);

  const remove = async (id: string) => {
    if (!window.confirm('确定删除该素材吗？文件将一并删除。')) return;
    try {
      await api.deleteAsset(id);
      setAssets((prev) => prev.filter((a) => a.id !== id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const startRename = (asset: AssetRecord) => {
    setEditingId(asset.id);
    setEditingName(asset.name);
  };

  const commitRename = async (id: string) => {
    const name = editingName.trim();
    setEditingId(null);
    if (!name) return;
    try {
      const updated = await api.renameAsset(id, name);
      setAssets((prev) => prev.map((a) => (a.id === id ? updated : a)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const regenerate = (asset: AssetRecord) => {
    onRegenerate?.({
      brief: asset.name,
      assetType: asset.assetType,
      style: asset.style,
      provider: asset.provider,
      model: asset.model,
      width: asset.width,
      height: asset.height,
      count: 1,
      ...(asset.negativePrompt ? { negativePrompt: asset.negativePrompt } : {}),
      ...(typeof asset.seed === 'number' ? { seed: asset.seed } : {}),
      parentAssetId: asset.id,
    });
  };

  const saveAsProfile = async (asset: AssetRecord) => {
    const name = window.prompt('风格档案名称：', `${asset.name} 风格`);
    if (!name) return;
    const keywords = asset.prompt
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 12);
    try {
      await api.createStyleProfile({
        name,
        keywords,
        negative: asset.negativePrompt
          ? asset.negativePrompt
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
              .slice(0, 12)
          : [],
        palette: [],
        ...(RASTER.test(asset.fileName) ? { referenceImage: asset.fileName } : {}),
        note: `由素材「${asset.name}」存档`,
      });
      window.alert('已存为风格档案，可在生成表单中选用。');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assets.filter((a) => {
      if (filter !== 'all' && a.assetType !== filter) return false;
      if (providerFilter !== 'all' && a.provider !== providerFilter) return false;
      if (q && !`${a.name} ${a.prompt}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [assets, filter, providerFilter, search]);

  const selectedVisibleCount = visible.filter((asset) => selectedIds.has(asset.id)).length;
  const selectedForExport = assets.filter((asset) => selectedIds.has(asset.id)).map((a) => a.id);

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selectedVisibleCount === visible.length) {
        visible.forEach((asset) => next.delete(asset.id));
      } else {
        visible.forEach((asset) => next.add(asset.id));
      }
      return next;
    });
  };

  return (
    <div>
      <div className="gallery-toolbar">
        <h2>素材画廊</h2>
        <div className="toolbar-actions">
          <input
            className="search-input"
            type="search"
            placeholder="搜索名称 / 提示词"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={filter} onChange={(e) => setFilter(e.target.value as AssetType | 'all')}>
            <option value="all">全部类型</option>
            {(Object.keys(ASSET_TYPE_META) as Array<keyof typeof ASSET_TYPE_META>).map((t) => (
              <option key={t} value={t}>
                {ASSET_TYPE_META[t].label}
              </option>
            ))}
          </select>
          <select value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)}>
            <option value="all">全部引擎</option>
            {providerIds.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <button onClick={toggleVisible} disabled={visible.length === 0}>
            {selectedVisibleCount === visible.length && visible.length > 0
              ? '取消全选'
              : '全选当前'}
          </button>
          {selectedForExport.length > 0 ? (
            <a className="button-link" href={api.exportAssetsUrl(selectedForExport)} download>
              导出选中（{selectedForExport.length}）
            </a>
          ) : (
            <button disabled>导出选中</button>
          )}
          <button onClick={load}>刷新</button>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {loading && <div className="loading">加载中…</div>}
      {!loading && visible.length === 0 && <div className="empty">没有匹配的素材。</div>}

      <div className="asset-grid gallery-grid">
        {visible.map((asset) => (
          <div key={asset.id} className="asset-card">
            <label className="asset-select">
              <input
                type="checkbox"
                checked={selectedIds.has(asset.id)}
                onChange={() => toggleSelected(asset.id)}
                aria-label={`选择 ${asset.name}`}
              />
            </label>
            {isAudioAsset(asset) ? (
              <div className="audio-thumb">
                <span className="audio-icon">🎧</span>
                <audio controls preload="none" src={`/files/${asset.fileName}`} />
              </div>
            ) : (
              <a href={`/files/${asset.fileName}`} target="_blank" rel="noreferrer">
                <img src={`/files/${asset.fileName}`} alt={asset.name} loading="lazy" />
              </a>
            )}
            <div className="asset-meta">
              {editingId === asset.id ? (
                <input
                  autoFocus
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={() => commitRename(asset.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename(asset.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                />
              ) : (
                <strong
                  className="asset-name"
                  onDoubleClick={() => startRename(asset)}
                  title="双击重命名"
                >
                  {asset.name}
                </strong>
              )}
              <span className="muted">
                {ASSET_TYPE_META[asset.assetType as keyof typeof ASSET_TYPE_META]?.label ??
                  AUDIO_TYPE_META[asset.assetType as keyof typeof AUDIO_TYPE_META]?.label ??
                  asset.assetType}
                {isAudioAsset(asset)
                  ? asset.durationSeconds
                    ? ` · ${asset.durationSeconds}s`
                    : ''
                  : ` · ${getStylePreset(asset.style)?.label ?? asset.style}`}
              </span>
              <span className="muted">
                {asset.provider} / {asset.model}
                {typeof asset.score === 'number' ? ` · 评分 ${asset.score}/10` : ''}
                {typeof asset.seed === 'number' ? ` · seed ${asset.seed}` : ''}
              </span>

              {asset.reviewDimensions && (
                <div className="review-dims">
                  {(
                    [
                      ['主体', asset.reviewDimensions.subject],
                      ['风格', asset.reviewDimensions.style],
                      ['构图', asset.reviewDimensions.composition],
                      ['瑕疵', asset.reviewDimensions.defects],
                    ] as const
                  ).map(([label, v]) => (
                    <div key={label} className="review-dim" title={`${label} ${v}/10`}>
                      <span className="review-dim-label">{label}</span>
                      <span className="review-dim-bar">
                        <span style={{ width: `${v * 10}%` }} />
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <details>
                <summary>提示词</summary>
                <p className="prompt-text">{asset.prompt}</p>
                {asset.critique && <p className="prompt-text">审查意见：{asset.critique}</p>}
              </details>

              {asset.seamPreview && (
                <details>
                  <summary>接缝自检</summary>
                  <a href={`/files/${asset.seamPreview}`} target="_blank" rel="noreferrer">
                    <img
                      className="seam-preview"
                      src={`/files/${asset.seamPreview}`}
                      alt="接缝预览"
                    />
                  </a>
                </details>
              )}

              {asset.variants?.length ? (
                <div className="variant-links">
                  {asset.variants.map((variant) => (
                    <a key={variant.fileName} href={`/files/${variant.fileName}`} download>
                      {variant.label}
                    </a>
                  ))}
                </div>
              ) : null}

              <div className="asset-actions">
                <a className="download" href={`/files/${asset.fileName}`} download>
                  ⬇ 下载
                </a>
                {onRegenerate && !isAudioAsset(asset) && (
                  <button onClick={() => regenerate(asset)} title="用相同参数重新生成">
                    重生成
                  </button>
                )}
                {!isAudioAsset(asset) && (
                  <button onClick={() => saveAsProfile(asset)} title="把风格存为档案">
                    存风格
                  </button>
                )}
                <button className="danger" onClick={() => remove(asset.id)}>
                  删除
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
