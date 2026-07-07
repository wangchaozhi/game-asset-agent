/** 通用 HTTP 小工具：带超时的 fetch 与耗时测量，供 Provider 健康检查/远端调用复用 */

/** 带超时的 fetch（默认 15s），超时抛出可读错误 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 15000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`请求超时（>${timeoutMs}ms）`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** 测量一个异步操作的耗时（毫秒） */
export async function withTiming<T>(
  fn: () => Promise<T>,
): Promise<{ value: T; latencyMs: number }> {
  const start = Date.now();
  const value = await fn();
  return { value, latencyMs: Date.now() - start };
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
