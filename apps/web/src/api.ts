import type { AssetRecord, Job, JobProgressEvent, JobStatus, ProvidersResponse } from '@gaf/shared';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let message = `请求失败 (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string; issues?: Array<{ message: string }> };
      if (body.error) message = body.error;
      if (body.issues?.length) message += `：${body.issues.map((i) => i.message).join('；')}`;
    } catch {
      // 保留默认错误信息
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export const api = {
  providers: () => request<ProvidersResponse>('/api/providers'),
  createJob: (input: Record<string, unknown>) =>
    request<Job>('/api/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }),
  jobs: () => request<Job[]>('/api/jobs'),
  assets: (jobId?: string) =>
    request<AssetRecord[]>(
      jobId ? `/api/assets?jobId=${encodeURIComponent(jobId)}` : '/api/assets',
    ),
  exportAssetsUrl: (ids: string[]) =>
    `/api/assets/export?ids=${ids.map((id) => encodeURIComponent(id)).join(',')}`,
  exportJobUrl: (jobId: string) => `/api/jobs/${encodeURIComponent(jobId)}/export`,
  deleteAsset: (id: string) =>
    request<{ ok: boolean }>(`/api/assets/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

export interface JobSubscriptionHandlers {
  onSnapshot?: (job: Job) => void;
  onProgress?: (event: JobProgressEvent) => void;
  onStatus?: (status: JobStatus) => void;
  onEnd?: (job: Job) => void;
  onError?: () => void;
}

/** 订阅任务 SSE 进度流，返回取消订阅函数 */
export function subscribeJob(jobId: string, handlers: JobSubscriptionHandlers): () => void {
  const source = new EventSource(`/api/jobs/${encodeURIComponent(jobId)}/events`);

  source.addEventListener('snapshot', (e) => {
    handlers.onSnapshot?.(JSON.parse((e as MessageEvent).data) as Job);
  });
  source.addEventListener('progress', (e) => {
    handlers.onProgress?.(JSON.parse((e as MessageEvent).data) as JobProgressEvent);
  });
  source.addEventListener('status', (e) => {
    const data = JSON.parse((e as MessageEvent).data) as { status: JobStatus };
    handlers.onStatus?.(data.status);
  });
  source.addEventListener('end', (e) => {
    handlers.onEnd?.(JSON.parse((e as MessageEvent).data) as Job);
    source.close();
  });
  source.onerror = () => {
    handlers.onError?.();
  };

  return () => source.close();
}
