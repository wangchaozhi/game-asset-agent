import { useEffect, useState } from 'react';
import type { AssetRecord, AssetType } from '@gaf/shared';
import { ASSET_TYPE_META, getStylePreset } from '@gaf/shared';
import { api } from '../api';

export function Gallery() {
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [filter, setFilter] = useState<AssetType | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api
      .assets()
      .then(setAssets)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const remove = async (id: string) => {
    if (!window.confirm('确定删除该素材吗？文件将一并删除。')) return;
    try {
      await api.deleteAsset(id);
      setAssets((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const visible = filter === 'all' ? assets : assets.filter((a) => a.assetType === filter);

  return (
    <div>
      <div className="gallery-toolbar">
        <h2>素材画廊</h2>
        <div className="toolbar-actions">
          <select value={filter} onChange={(e) => setFilter(e.target.value as AssetType | 'all')}>
            <option value="all">全部类型</option>
            {(Object.keys(ASSET_TYPE_META) as AssetType[]).map((t) => (
              <option key={t} value={t}>
                {ASSET_TYPE_META[t].label}
              </option>
            ))}
          </select>
          <button onClick={load}>刷新</button>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {loading && <div className="loading">加载中…</div>}
      {!loading && visible.length === 0 && (
        <div className="empty">还没有素材，去「生成素材」页创建第一批吧。</div>
      )}

      <div className="asset-grid gallery-grid">
        {visible.map((asset) => (
          <div key={asset.id} className="asset-card">
            <a href={`/files/${asset.fileName}`} target="_blank" rel="noreferrer">
              <img src={`/files/${asset.fileName}`} alt={asset.name} loading="lazy" />
            </a>
            <div className="asset-meta">
              <strong>{asset.name}</strong>
              <span className="muted">
                {ASSET_TYPE_META[asset.assetType]?.label ?? asset.assetType} ·{' '}
                {getStylePreset(asset.style)?.label ?? asset.style}
              </span>
              <span className="muted">
                {asset.provider} / {asset.model}
                {typeof asset.score === 'number' ? ` · 评分 ${asset.score}/10` : ''}
              </span>
              <details>
                <summary>提示词</summary>
                <p className="prompt-text">{asset.prompt}</p>
                {asset.critique && <p className="prompt-text">审查意见：{asset.critique}</p>}
              </details>
              <div className="asset-actions">
                <a className="download" href={`/files/${asset.fileName}`} download>
                  ⬇ 下载
                </a>
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
