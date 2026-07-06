import { useEffect, useRef, useState } from 'react';
import type { AssetRecord, Job, JobProgressEvent, JobStatus } from '@gaf/shared';
import { api, subscribeJob } from '../api';

interface Props {
  jobId: string;
}

const STATUS_LABEL: Record<JobStatus, string> = {
  queued: '排队中',
  planning: '规划中',
  generating: '生成中',
  reviewing: '审查中',
  completed: '已完成',
  failed: '失败',
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

  const running = job.status !== 'completed' && job.status !== 'failed';

  return (
    <div>
      <div className="progress-header">
        <h2>任务进度</h2>
        <span className={`status-badge status-${job.status}`}>
          {running && <span className="spinner" />}
          {STATUS_LABEL[job.status]}
        </span>
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

      {job.error && <div className="alert error">任务失败：{job.error}</div>}

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
                <a href={`/files/${asset.fileName}`} target="_blank" rel="noreferrer">
                  <img src={`/files/${asset.fileName}`} alt={asset.name} loading="lazy" />
                </a>
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
