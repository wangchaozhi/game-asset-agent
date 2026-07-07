import { useEffect, useState } from 'react';
import type { GenerationRequest, ProvidersResponse } from '@gaf/shared';
import { api, getAuthToken, setAuthToken } from './api';
import { AudioPanel } from './components/AudioPanel';
import { Gallery } from './components/Gallery';
import { GeneratePanel } from './components/GeneratePanel';
import { Login } from './components/Login';
import { ProviderStatus } from './components/ProviderStatus';
import { StyleProfiles } from './components/StyleProfiles';
import { TaskHistory } from './components/TaskHistory';

type Tab = 'generate' | 'audio' | 'gallery' | 'history' | 'styles' | 'system';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'generate', label: '生成素材' },
  { id: 'audio', label: '音频生成' },
  { id: 'gallery', label: '素材画廊' },
  { id: 'history', label: '任务历史' },
  { id: 'styles', label: '风格档案' },
  { id: 'system', label: '系统状态' },
];

export function App() {
  const [tab, setTab] = useState<Tab>('generate');
  const [providers, setProviders] = useState<ProvidersResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  // 「同参重新生成」预填参数 + nonce（用于强制重建生成表单）
  const [prefill, setPrefill] = useState<Partial<GenerationRequest> | null>(null);
  const [prefillNonce, setPrefillNonce] = useState(0);

  const loadProviders = () => {
    api
      .providers()
      .then((p) => {
        setProviders(p);
        setNeedLogin(false);
        setLoadError(null);
      })
      .catch((err: Error) => setLoadError(err.message));
  };

  useEffect(() => {
    api
      .authInfo()
      .then((info) => {
        if (info.required && !getAuthToken()) {
          setNeedLogin(true);
          return;
        }
        loadProviders();
      })
      .catch((err: Error) => setLoadError(err.message));
  }, []);

  const logout = () => {
    setAuthToken(null);
    setProviders(null);
    setNeedLogin(true);
  };

  if (needLogin) {
    return <Login onSuccess={loadProviders} />;
  }

  const regenerate = (next: Partial<GenerationRequest>) => {
    setPrefill(next);
    setPrefillNonce((n) => n + 1);
    setTab('generate');
  };

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <span className="brand-mark">◆</span>
          <div>
            <h1>GameAsset Forge</h1>
            <p className="brand-sub">多智能体协作 · 游戏素材生成工坊</p>
          </div>
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? 'tab active' : 'tab'}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="main">
        {loadError && <div className="alert error">无法连接服务端：{loadError}</div>}
        {!providers && !loadError && <div className="loading">加载中…</div>}
        {providers && (
          <>
            <div style={{ display: tab === 'generate' ? 'block' : 'none' }}>
              <GeneratePanel key={prefillNonce} providers={providers} prefill={prefill} />
            </div>
            {tab === 'audio' && <AudioPanel providers={providers} />}
            {tab === 'gallery' && <Gallery onRegenerate={regenerate} />}
            {tab === 'history' && <TaskHistory onRegenerate={regenerate} />}
            {tab === 'styles' && <StyleProfiles />}
            {tab === 'system' && <ProviderStatus providers={providers} />}
          </>
        )}
      </main>

      <footer className="footer">
        {providers?.llm.configured ? (
          <span>
            智能体大脑：{providers.llm.provider} / {providers.llm.model}
            {providers.llm.supportsVision ? '（支持视觉审查）' : ''}
          </span>
        ) : (
          <span>LLM 未配置 —— 智能体以内置模板运行，配置 API Key 可启用智能规划与质量审查</span>
        )}
        {getAuthToken() && (
          <button className="logout-link" onClick={logout}>
            退出登录
          </button>
        )}
      </footer>
    </div>
  );
}
