import { useEffect, useState } from 'react';
import type { GenerationRequest, Job, JobStatus } from '@gaf/shared';
import { ASSET_TYPE_META, AUDIO_TYPE_META, getStylePreset } from '@gaf/shared';
import { api } from '../api';

interface Props {
  onRegenerate?: (prefill: Partial<GenerationRequest>) => void;
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

const ACTIVE: JobStatus[] = ['queued', 'planning', 'generating', 'reviewing'];

export function TaskHistory({ onRegenerate }: Props) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api
      .jobs()
      .then(setJobs)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  return (
    <div>
      <div className="gallery-toolbar">
        <h2>任务历史</h2>
        <div className="toolbar-actions">
          <button onClick={load}>刷新</button>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {loading && <div className="loading">加载中…</div>}
      {!loading && jobs.length === 0 && <div className="empty">还没有任务记录。</div>}

      <div className="task-list">
        {jobs.map((job) => (
          <div key={job.id} className="card task-row">
            <div className="task-main">
              <div className="task-brief">{job.request.brief}</div>
              <div className="muted">
                {ASSET_TYPE_META[job.request.assetType as keyof typeof ASSET_TYPE_META]?.label ??
                  AUDIO_TYPE_META[job.request.assetType as keyof typeof AUDIO_TYPE_META]?.label ??
                  job.request.assetType}{' '}
                · {getStylePreset(job.request.style)?.label ?? job.request.style} ·{' '}
                {job.request.provider}
                {job.request.model ? ` / ${job.request.model}` : ''} · {job.request.count} 个
              </div>
              <div className="muted">
                {new Date(job.createdAt).toLocaleString()} · 产出 {job.assetIds.length} 个素材
              </div>
              {job.error && <div className="task-error">失败：{job.error}</div>}
            </div>
            <div className="task-side">
              <span className={`status-badge status-${job.status}`}>
                {STATUS_LABEL[job.status]}
              </span>
              {ACTIVE.includes(job.status) && (
                <button
                  className="danger"
                  onClick={async () => {
                    await api.cancelJob(job.id).catch(() => {});
                    load();
                  }}
                >
                  取消
                </button>
              )}
              {job.assetIds.length > 0 && (
                <a className="button-link" href={api.exportJobUrl(job.id)} download>
                  导出
                </a>
              )}
              {onRegenerate && (
                <button onClick={() => onRegenerate({ ...job.request, count: job.request.count })}>
                  用同参数重生成
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
