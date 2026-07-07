import { useEffect, useRef, useState } from 'react';
import type { AssetRecord, Job, JobProgressEvent, JobStatus, SpritesheetInfo } from '@gaf/shared';
import { api, subscribeJob } from '../api';

interface Props {
  jobId: string;
}

export function isAudioAsset(asset: AssetRecord): boolean {
  return asset.mediaKind === 'audio' || asset.format === 'wav' || asset.format === 'mp3';
}

/** 精灵表帧序列预览：JS 逐帧循环（兼容任意网格） */
function SpritesheetPreview({ info }: { info: SpritesheetInfo }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setFrame((f) => (f + 1) % info.frameCount), 140);
    return () => clearInterval(timer);
  }, [info.frameCount]);

  const maxSide = Math.max(info.frameWidth, info.frameHeight);
  const scale = Math.min(1, 120 / maxSide);
  const dw = info.frameWidth * scale;
  const dh = info.frameHeight * scale;
  const col = frame % info.columns;
  const row = Math.floor(frame / info.columns);

  return (
    <div className="spritesheet-block">
      <div
        className="spritesheet-frame"
        style={{
          width: dw,
          height: dh,
          backgroundImage: `url(/files/${info.fileName})`,
          backgroundSize: `${info.columns * dw}px ${info.rows * dh}px`,
          backgroundPosition: `-${col * dw}px -${row * dh}px`,
        }}
      />
      <div className="spritesheet-meta">
        <span className="muted">
          {info.frameCount} 帧 · {info.frameWidth}×{info.frameHeight} · {info.columns}×{info.rows}{' '}
          网格
        </span>
        <div className="variant-links">
          <a href={`/files/${info.fileName}`} download>
            精灵表 PNG
          </a>
          <a href={`/files/${info.jsonFileName}`} download>
            图集 JSON
          </a>
        </div>
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<JobStatus, string> = {
  queued: '排队中',
  planning: '规划中',
  generating: '生成中',
  reviewing: '审查中',
  completed: '已完成',
  failed: '失败',
  canceled: '已取消',
};

const STAGE_ICON: Record<string, string> = {
  queued: '⏳',
  plan: '🎬',
  prompt: '✍️',
  generate: '🎨',
  review: '🔍',
  postprocess: '🧩',
  retry: '♻️',
  save: '💾',
  done: '✅',
  error: '⛔',
};

export function JobProgress({ jobId }: Props) {
  const [job, setJob] = useState<Job | null>(null);
  const [events, setEvents] = useState<JobProgressEvent[]>([]);
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = subscribeJob(jobId, {
      onSnapshot: (snapshot) => {
        setJob(snapshot);
        setEvents(snapshot.progress);
        if (snapshot.status === 'completed' || snapshot.status === 'failed') {
          void api.assets(jobId).then(setAssets);
        }
      },
      onProgress: (event) => setEvents((prev) => [...prev, event]),
      onStatus: (status) => setJob((prev) => (prev ? { ...prev, status } : prev)),
      onEnd: (finalJob) => {
        setJob(finalJob);
        setEvents(finalJob.progress);
        void api.assets(jobId).then(setAssets);
      },
    });
    return unsubscribe;
  }, [jobId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [events]);

  if (!job) return <div className="loading">连接任务进度…</div>;

  const running =
    job.status !== 'completed' && job.status !== 'failed' && job.status !== 'canceled';

  const cancel = async () => {
    try {
      await api.cancelJob(jobId);
    } catch {
      // 任务可能已结束，忽略
    }
  };

  return (
    <div>
      <div className="progress-header">
        <h2>任务进度</h2>
        <div className="progress-header-side">
          {running && (
            <button className="danger" onClick={cancel}>
              取消任务
            </button>
          )}
          <span className={`status-badge status-${job.status}`}>
            {running && <span className="spinner" />}
            {STATUS_LABEL[job.status]}
          </span>
        </div>
      </div>

      <div className="progress-list" ref={listRef}>
        {events.map((e, i) => (
          <div key={i} className={`progress-item stage-${e.stage}`}>
            <span className="stage-icon">{STAGE_ICON[e.stage] ?? '•'}</span>
            <span className="stage-time">{new Date(e.ts).toLocaleTimeString()}</span>
            <span className="stage-message">{e.message}</span>
          </div>
        ))}
      </div>

      {job.error && (
        <div className={`alert ${job.status === 'canceled' ? '' : 'error'}`}>
          {job.status === 'canceled' ? '任务已取消' : `任务失败：${job.error}`}
        </div>
      )}

      {job.spritesheet && (
        <>
          <h3 className="result-title" style={{ margin: '18px 0 10px' }}>
            精灵表
          </h3>
          <SpritesheetPreview info={job.spritesheet} />
        </>
      )}

      {assets.length > 0 && (
        <>
          <div className="result-header">
            <h3 className="result-title">产出素材（{assets.length}）</h3>
            <a className="button-link" href={api.exportJobUrl(jobId)} download>
              导出本任务
            </a>
          </div>
          <div className="asset-grid">
            {assets.map((asset) => (
              <div key={asset.id} className="asset-card">
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
                  <strong>{asset.name}</strong>
                  <span className="muted">
                    {asset.provider} · {asset.format.toUpperCase()}
                    {typeof asset.score === 'number' ? ` · 评分 ${asset.score}/10` : ''}
                  </span>
                  <a className="download" href={`/files/${asset.fileName}`} download>
                    ⬇ 下载
                  </a>
                  {asset.variants?.length ? (
                    <div className="variant-links">
                      {asset.variants.map((variant) => (
                        <a key={variant.fileName} href={`/files/${variant.fileName}`} download>
                          {variant.label}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
