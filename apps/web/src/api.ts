import type {
  AssetRecord,
  Job,
  JobProgressEvent,
  JobStatus,
  ProviderCheckResult,
  ProvidersResponse,
  StyleProfile,
  UsageSummary,
} from '@gaf/shared';

const TOKEN_KEY = 'gaf.authToken';
let authToken: string | null =
  typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;

export function setAuthToken(token: string | null): void {
  authToken = token;
  if (typeof localStorage === 'undefined') return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getAuthToken(): string | null {
  return authToken;
}

/** 给 SSE / 文件等无法设置请求头的场景附加 token 查询参数 */
export function withToken(url: string): string {
  if (!authToken) return url;
  return url + (url.includes('?') ? '&' : '?') + `token=${encodeURIComponent(authToken)}`;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (authToken) headers.set('authorization', `Bearer ${authToken}`);
  const res = await fetch(url, { ...init, headers });
  if (res.status === 401) {
    throw new Error('未授权：访问令牌无效或已失效');
  }
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
  authInfo: () => request<{ required: boolean }>('/api/auth'),
  providers: () => request<ProvidersResponse>('/api/providers'),
  usage: () => request<UsageSummary>('/api/usage'),
  createJob: (input: Record<string, unknown>) =>
    request<Job>('/api/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }),
  jobs: () => request<Job[]>('/api/jobs'),
  cancelJob: (id: string) =>
    request<{ ok: boolean; outcome: string }>(`/api/jobs/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
    }),
  assets: (jobId?: string) =>
    request<AssetRecord[]>(
      jobId ? `/api/assets?jobId=${encodeURIComponent(jobId)}` : '/api/assets',
    ),
  exportAssetsUrl: (ids: string[]) =>
    `/api/assets/export?ids=${ids.map((id) => encodeURIComponent(id)).join(',')}`,
  exportJobUrl: (jobId: string) => `/api/jobs/${encodeURIComponent(jobId)}/export`,
  deleteAsset: (id: string) =>
    request<{ ok: boolean }>(`/api/assets/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  renameAsset: (id: string, name: string) =>
    request<AssetRecord>(`/api/assets/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    }),
  checkProvider: (id: string) =>
    request<ProviderCheckResult>(`/api/providers/${encodeURIComponent(id)}/check`, {
      method: 'POST',
    }),
  uploadReference: (dataUrl: string) =>
    request<{ fileName: string; url: string }>('/api/uploads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dataUrl }),
    }),
  styleProfiles: () => request<StyleProfile[]>('/api/style-profiles'),
  createStyleProfile: (input: Record<string, unknown>) =>
    request<StyleProfile>('/api/style-profiles', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }),
  deleteStyleProfile: (id: string) =>
    request<{ ok: boolean }>(`/api/style-profiles/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
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
  const source = new EventSource(withToken(`/api/jobs/${encodeURIComponent(jobId)}/events`));

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
