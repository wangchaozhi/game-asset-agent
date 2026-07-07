import { useEffect, useState } from 'react';
import type { StyleProfile } from '@gaf/shared';
import { api } from '../api';

function splitList(text: string): string[] {
  return text
    .split(/[,，\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 30);
}

export function StyleProfiles() {
  const [profiles, setProfiles] = useState<StyleProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [keywords, setKeywords] = useState('');
  const [negative, setNegative] = useState('');
  const [palette, setPalette] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .styleProfiles()
      .then(setProfiles)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const create = async () => {
    setError(null);
    if (!name.trim()) {
      setError('请填写风格档案名称');
      return;
    }
    setSaving(true);
    try {
      await api.createStyleProfile({
        name: name.trim(),
        keywords: splitList(keywords),
        negative: splitList(negative),
        palette: splitList(palette),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setName('');
      setKeywords('');
      setNegative('');
      setPalette('');
      setNote('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('删除该风格档案？')) return;
    try {
      await api.deleteStyleProfile(id);
      setProfiles((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div>
      <h2>风格档案</h2>
      <p className="muted">
        把一次满意产出的风格要素（关键词、色板、参考图）存档，生成时选用可保证跨批次风格一致。
      </p>

      <section className="card form-card" style={{ marginTop: 16 }}>
        <h3>新建风格档案</h3>
        <div className="form-grid">
          <label>
            名称
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：暗黑像素冒险"
            />
          </label>
          <label>
            色板（逗号分隔十六进制）
            <input
              value={palette}
              onChange={(e) => setPalette(e.target.value)}
              placeholder="#2b2b3c, #e0b04a"
            />
          </label>
        </div>
        <label className="full">
          正向关键词（逗号分隔）
          <input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="pixel art, dark fantasy, dramatic lighting"
          />
        </label>
        <label className="full">
          负向词（逗号分隔）
          <input
            value={negative}
            onChange={(e) => setNegative(e.target.value)}
            placeholder="blurry, photorealistic"
          />
        </label>
        <label className="full">
          备注（可选）
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        {error && <div className="alert error">{error}</div>}
        <button className="primary" onClick={create} disabled={saving}>
          {saving ? '保存中…' : '保存风格档案'}
        </button>
      </section>

      <h3 className="section-title">已有档案</h3>
      {loading && <div className="loading">加载中…</div>}
      {!loading && profiles.length === 0 && <div className="empty">还没有风格档案。</div>}
      <div className="provider-grid">
        {profiles.map((p) => (
          <div key={p.id} className="card provider-card">
            <div className="provider-head">
              <strong>{p.name}</strong>
              <button className="danger" onClick={() => remove(p.id)}>
                删除
              </button>
            </div>
            {p.keywords.length > 0 && <p className="muted">关键词：{p.keywords.join('、')}</p>}
            {p.negative.length > 0 && <p className="muted">负向：{p.negative.join('、')}</p>}
            {p.palette.length > 0 && (
              <div className="palette-row">
                {p.palette.map((c) => (
                  <span key={c} className="swatch" style={{ background: c }} title={c} />
                ))}
              </div>
            )}
            {p.referenceImage && (
              <a href={`/files/${p.referenceImage}`} target="_blank" rel="noreferrer">
                <img
                  className="reference-preview"
                  src={`/files/${p.referenceImage}`}
                  alt="参考图"
                />
              </a>
            )}
            {p.note && <p className="hint">{p.note}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
