import type { ProvidersResponse } from '@gaf/shared';

interface Props {
  providers: ProvidersResponse;
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
          </div>
        ))}
      </div>
    </div>
  );
}
