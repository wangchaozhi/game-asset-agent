import { useEffect, useState } from 'react';
import type { ProviderCheckResult, ProvidersResponse, UsageSummary } from '@gaf/shared';
import { api } from '../api';

interface Props {
  providers: ProvidersResponse;
}

function UsagePanel() {
  const [usage, setUsage] = useState<UsageSummary | null>(null);

  useEffect(() => {
    api
      .usage()
      .then(setUsage)
      .catch(() => setUsage(null));
  }, []);

  if (!usage) return null;
  const totalImages = usage.images.reduce((sum, s) => sum + s.calls, 0);
  const totalTokens = usage.llm.reduce((sum, s) => sum + (s.tokensIn ?? 0) + (s.tokensOut ?? 0), 0);

  return (
    <>
      <h3 className="section-title">成本 / 用量统计</h3>
      <div className="card">
        <p className="muted">
          累计生成 <strong>{totalImages}</strong> 张图片 · LLM 估算消耗{' '}
          <strong>{totalTokens.toLocaleString()}</strong> tokens
        </p>
        {usage.images.length > 0 && (
          <div className="usage-table">
            <div className="usage-row usage-head">
              <span>图像引擎 / 模型</span>
              <span>张数</span>
            </div>
            {usage.images.map((s) => (
              <div key={s.key} className="usage-row">
                <span>{s.key}</span>
                <span>{s.calls}</span>
              </div>
            ))}
          </div>
        )}
        {usage.llm.length > 0 && (
          <div className="usage-table">
            <div className="usage-row usage-head">
              <span>LLM</span>
              <span>请求</span>
              <span>输入 tok</span>
              <span>输出 tok</span>
            </div>
            {usage.llm.map((s) => (
              <div key={s.key} className="usage-row usage-llm">
                <span>{s.key}</span>
                <span>{s.calls}</span>
                <span>{(s.tokensIn ?? 0).toLocaleString()}</span>
                <span>{(s.tokensOut ?? 0).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
        {totalImages === 0 && totalTokens === 0 && <p className="muted">暂无用量记录。</p>}
      </div>
    </>
  );
}

function ProviderCheckButton({ id }: { id: string }) {
  const [state, setState] = useState<'idle' | 'checking'>('idle');
  const [result, setResult] = useState<ProviderCheckResult | null>(null);

  const run = async () => {
    setState('checking');
    setResult(null);
    try {
      setResult(await api.checkProvider(id));
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setState('idle');
    }
  };

  return (
    <div className="provider-check">
      <button onClick={run} disabled={state === 'checking'}>
        {state === 'checking' ? '检测中…' : '测试连接'}
      </button>
      {result && (
        <span className={`check-result ${result.ok ? 'ok' : 'fail'}`}>
          {result.ok ? '✓' : '✗'} {result.message}
          {typeof result.latencyMs === 'number' ? `（${result.latencyMs}ms）` : ''}
        </span>
      )}
    </div>
  );
}

export function ProviderStatus({ providers }: Props) {
  return (
    <div>
      <h2>系统状态</h2>

      <h3 className="section-title">多智能体流水线</h3>
      <div className="pipeline-diagram card">
        <div className="pipeline-step">
          <span className="pipeline-icon">🎬</span>
          <strong>美术总监</strong>
          <p>把需求拆解为互有差异的素材规划清单</p>
        </div>
        <span className="pipeline-arrow">→</span>
        <div className="pipeline-step">
          <span className="pipeline-icon">✍️</span>
          <strong>提示词工程师</strong>
          <p>为每项素材生成优化的绘图提示词</p>
        </div>
        <span className="pipeline-arrow">→</span>
        <div className="pipeline-step">
          <span className="pipeline-icon">🎨</span>
          <strong>图像引擎</strong>
          <p>调用所选模型生成图像</p>
        </div>
        <span className="pipeline-arrow">→</span>
        <div className="pipeline-step">
          <span className="pipeline-icon">🔍</span>
          <strong>审查官</strong>
          <p>视觉评审打分，不合格携反馈重试</p>
        </div>
      </div>

      <h3 className="section-title">智能体大脑（LLM）</h3>
      <div className="card llm-card">
        {providers.llm.configured ? (
          <p>
            <span className="badge ok">已配置</span> {providers.llm.provider} /{' '}
            {providers.llm.model}
            {providers.llm.supportsVision ? '（支持视觉审查）' : '（不支持视觉，跳过审查环节）'}
          </p>
        ) : (
          <p>
            <span className="badge off">未配置</span>
            设置 <code>ANTHROPIC_API_KEY</code> 或 <code>OPENAI_API_KEY</code> 后，「美术总监 /
            提示词工程师 / 审查官」将由 LLM 驱动；当前使用内置规则模板。
          </p>
        )}
      </div>

      <h3 className="section-title">后处理</h3>
      <div className="card llm-card">
        <p>
          <span className={`badge ${providers.postprocess.available ? 'ok' : 'off'}`}>
            {providers.postprocess.available ? '可用' : '未启用'}
          </span>
          {providers.postprocess.available
            ? '已启用 sharp，可生成尺寸变体、PNG/WebP 副本与导出包。'
            : '未安装可选依赖 sharp，生成主图不受影响，后处理选项会隐藏。'}
        </p>
      </div>

      <UsagePanel />

      <h3 className="section-title">图像生成引擎</h3>
      <div className="provider-grid">
        {providers.imageProviders.map((p) => (
          <div key={p.id} className="card provider-card">
            <div className="provider-head">
              <strong>{p.label}</strong>
              <span className={`badge ${p.configured ? 'ok' : 'off'}`}>
                {p.configured ? '可用' : '未配置'}
              </span>
            </div>
            <p className="muted">
              模型：{p.models.join('、')}（默认 {p.defaultModel}）
            </p>
            <p className="muted">
              输出：{p.outputFormat.toUpperCase()} · 负向词：
              {p.supportsNegativePrompt ? '支持' : '不支持'}
            </p>
            {!p.configured && p.requires.length > 0 && (
              <p className="muted">
                需要环境变量：<code>{p.requires.join(', ')}</code>
              </p>
            )}
            {p.note && <p className="hint">{p.note}</p>}
            {p.supportsHealthCheck && <ProviderCheckButton id={p.id} />}
          </div>
        ))}
      </div>

      {providers.audioProviders && providers.audioProviders.length > 0 && (
        <>
          <h3 className="section-title">音频生成引擎</h3>
          <div className="provider-grid">
            {providers.audioProviders.map((p) => (
              <div key={p.id} className="card provider-card">
                <div className="provider-head">
                  <strong>{p.label}</strong>
                  <span className={`badge ${p.configured ? 'ok' : 'off'}`}>
                    {p.configured ? '可用' : '未配置'}
                  </span>
                </div>
                <p className="muted">
                  模型：{p.models.join('、')}（默认 {p.defaultModel}）· 输出{' '}
                  {p.outputFormat.toUpperCase()}
                </p>
                {!p.configured && p.requires.length > 0 && (
                  <p className="muted">
                    需要环境变量：<code>{p.requires.join(', ')}</code>
                  </p>
                )}
                {p.note && <p className="hint">{p.note}</p>}
                {p.supportsHealthCheck && <ProviderCheckButton id={p.id} />}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
