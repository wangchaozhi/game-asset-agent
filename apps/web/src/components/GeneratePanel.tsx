import { useEffect, useMemo, useState } from 'react';
import type {
  GenerationRequest,
  ImageAssetType,
  ProvidersResponse,
  StyleProfile,
} from '@gaf/shared';
import { ASSET_TYPE_META, ASSET_TYPES, STYLE_PRESETS } from '@gaf/shared';
import { api } from '../api';
import { JobProgress } from './JobProgress';

interface Props {
  providers: ProvidersResponse;
  /** 「同参重新生成」预填的请求参数 */
  prefill?: Partial<GenerationRequest> | null;
}

export function GeneratePanel({ providers, prefill }: Props) {
  const configured = providers.imageProviders.filter((p) => p.configured);
  const defaultProvider =
    prefill?.provider ?? configured.find((p) => p.id !== 'mock')?.id ?? configured[0]?.id ?? 'mock';
  const initialType: ImageAssetType =
    prefill?.assetType && prefill.assetType in ASSET_TYPE_META
      ? (prefill.assetType as ImageAssetType)
      : 'sprite';

  const [brief, setBrief] = useState(prefill?.brief ?? '');
  const [assetType, setAssetType] = useState<ImageAssetType>(initialType);
  const [style, setStyle] = useState(prefill?.style ?? STYLE_PRESETS[0].id);
  const [providerId, setProviderId] = useState(defaultProvider);
  const [model, setModel] = useState(prefill?.model ?? '');
  const [count, setCount] = useState(prefill?.count ?? 1);
  const [width, setWidth] = useState(
    prefill?.width ?? ASSET_TYPE_META[initialType].defaultSize.width,
  );
  const [height, setHeight] = useState(
    prefill?.height ?? ASSET_TYPE_META[initialType].defaultSize.height,
  );
  const [negativePrompt, setNegativePrompt] = useState(prefill?.negativePrompt ?? '');
  const [maxRetries, setMaxRetries] = useState(prefill?.maxRetries ?? 1);
  const [postprocessEnabled, setPostprocessEnabled] = useState(false);
  const [variantScales, setVariantScales] = useState<number[]>([0.5, 2]);
  const [postprocessFormat, setPostprocessFormat] = useState<'original' | 'png' | 'webp'>('webp');

  // 进阶选项
  const [seed, setSeed] = useState(prefill?.seed !== undefined ? String(prefill.seed) : '');
  const [transparentBackground, setTransparentBackground] = useState(
    prefill?.transparentBackground ?? false,
  );
  const [characterSheet, setCharacterSheet] = useState(prefill?.characterSheet ?? '');
  const [spritesheet, setSpritesheet] = useState(prefill?.spritesheet ?? false);
  const [styleProfileId, setStyleProfileId] = useState(prefill?.styleProfileId ?? '');
  const [reviewThreshold, setReviewThreshold] = useState<string>(
    prefill?.reviewPolicy?.threshold !== undefined ? String(prefill.reviewPolicy.threshold) : '',
  );
  const [profiles, setProfiles] = useState<StyleProfile[]>([]);

  // 参考图上传
  const [referenceFileName, setReferenceFileName] = useState<string | null>(
    prefill?.referenceImage ?? null,
  );
  const [referenceStrength, setReferenceStrength] = useState(prefill?.referenceStrength ?? 0.5);
  const [uploading, setUploading] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  useEffect(() => {
    api
      .styleProfiles()
      .then(setProfiles)
      .catch(() => setProfiles([]));
  }, []);

  const provider = useMemo(
    () => providers.imageProviders.find((p) => p.id === providerId),
    [providers, providerId],
  );
  const supportsReference = Boolean(provider?.supportsReferenceImage);
  const supportsTransparent = assetType === 'sprite' || assetType === 'icon';

  const changeAssetType = (next: ImageAssetType) => {
    setAssetType(next);
    setWidth(ASSET_TYPE_META[next].defaultSize.width);
    setHeight(ASSET_TYPE_META[next].defaultSize.height);
  };

  const toggleVariantScale = (scale: number) => {
    setVariantScales((prev) =>
      prev.includes(scale) ? prev.filter((s) => s !== scale) : [...prev, scale].sort(),
    );
  };

  const onPickReference = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const dataUrl = await readAsDataUrl(file);
      const { fileName } = await api.uploadReference(dataUrl);
      setReferenceFileName(fileName);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
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
        ...(seed.trim() !== '' && Number.isFinite(Number(seed)) ? { seed: Number(seed) } : {}),
        ...(supportsTransparent && transparentBackground ? { transparentBackground: true } : {}),
        ...(characterSheet.trim() ? { characterSheet: characterSheet.trim() } : {}),
        ...(spritesheet && providers.postprocess.available ? { spritesheet: true } : {}),
        ...(styleProfileId ? { styleProfileId } : {}),
        ...(supportsReference && referenceFileName
          ? { referenceImage: referenceFileName, referenceStrength }
          : {}),
        ...(reviewThreshold ? { reviewPolicy: { threshold: Number(reviewThreshold) } } : {}),
        ...(postprocessEnabled && providers.postprocess.available
          ? {
              postprocess: {
                ...(variantScales.length > 0 ? { variants: variantScales } : {}),
                ...(postprocessFormat !== 'original' ? { format: postprocessFormat } : {}),
              },
            }
          : {}),
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
              onChange={(e) => changeAssetType(e.target.value as ImageAssetType)}
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

          <label>
            随机种子（可选，复现/一致性）
            <input
              type="number"
              min={0}
              placeholder="留空为随机"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
            />
          </label>

          <label>
            风格档案（跨批次一致）
            <select value={styleProfileId} onChange={(e) => setStyleProfileId(e.target.value)}>
              <option value="">不使用</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            审查通过阈值
            <select value={reviewThreshold} onChange={(e) => setReviewThreshold(e.target.value)}>
              <option value="">默认（6）</option>
              <option value="5">宽松（5）</option>
              <option value="7">较严（7）</option>
              <option value="8">严格（8）</option>
            </select>
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

        <label className="full">
          角色描述卡（可选，保持同一角色跨帧一致）
          <input
            type="text"
            placeholder="例如：银发红瞳的少女骑士，蓝色铠甲，右脸有疤"
            value={characterSheet}
            onChange={(e) => setCharacterSheet(e.target.value)}
          />
        </label>

        {supportsTransparent && (
          <label className="checkbox-line" style={{ marginTop: 12 }}>
            <input
              type="checkbox"
              checked={transparentBackground}
              disabled={!providers.postprocess.available}
              onChange={(e) => setTransparentBackground(e.target.checked)}
            />
            <span>
              透明背景（去底）
              {providers.postprocess.available ? '' : ' —— 需安装 sharp'}
            </span>
          </label>
        )}

        {assetType === 'sprite' && (
          <label className="checkbox-line" style={{ marginTop: 10 }}>
            <input
              type="checkbox"
              checked={spritesheet}
              disabled={!providers.postprocess.available || count < 2}
              onChange={(e) => setSpritesheet(e.target.checked)}
            />
            <span>
              合成精灵表（多帧 → sprite sheet + JSON，需 ≥2 帧
              {providers.postprocess.available ? '' : '，需 sharp'}）
            </span>
          </label>
        )}

        {supportsReference && (
          <div className="postprocess-box">
            <strong className="box-title">参考图（img2img / 风格参照）</strong>
            <div className="reference-row">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => onPickReference(e.target.files?.[0])}
              />
              {uploading && <span className="muted">上传中…</span>}
              {referenceFileName && (
                <>
                  <img
                    className="reference-preview"
                    src={`/files/${referenceFileName}`}
                    alt="参考图"
                  />
                  <button onClick={() => setReferenceFileName(null)}>移除</button>
                </>
              )}
            </div>
            {referenceFileName && (
              <label className="full">
                去噪强度：{referenceStrength.toFixed(2)}（越大越偏离参考图）
                <input
                  type="range"
                  min={0.1}
                  max={0.95}
                  step={0.05}
                  value={referenceStrength}
                  onChange={(e) => setReferenceStrength(Number(e.target.value))}
                />
              </label>
            )}
          </div>
        )}

        <div className="postprocess-box">
          <label className="checkbox-line">
            <input
              type="checkbox"
              checked={postprocessEnabled}
              disabled={!providers.postprocess.available}
              onChange={(e) => setPostprocessEnabled(e.target.checked)}
            />
            <span>生成可用变体</span>
          </label>
          {providers.postprocess.available ? (
            postprocessEnabled && (
              <div className="postprocess-controls">
                <div className="checkbox-group">
                  {[0.5, 1, 2].map((scale) => (
                    <label key={scale} className="checkbox-line compact">
                      <input
                        type="checkbox"
                        checked={variantScales.includes(scale)}
                        onChange={() => toggleVariantScale(scale)}
                      />
                      <span>@{scale}x</span>
                    </label>
                  ))}
                </div>
                <label>
                  额外格式
                  <select
                    value={postprocessFormat}
                    onChange={(e) =>
                      setPostprocessFormat(e.target.value as 'original' | 'png' | 'webp')
                    }
                  >
                    <option value="webp">WebP</option>
                    <option value="png">PNG</option>
                    <option value="original">保持原格式</option>
                  </select>
                </label>
              </div>
            )
          ) : (
            <p className="hint">后处理引擎未可用，安装可选依赖 sharp 后可生成尺寸变体与 WebP。</p>
          )}
        </div>

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

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });
}
