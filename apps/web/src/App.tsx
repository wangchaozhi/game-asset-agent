import { useEffect, useState } from 'react';
import type { ProvidersResponse } from '@gaf/shared';
import { api } from './api';
import { Gallery } from './components/Gallery';
import { GeneratePanel } from './components/GeneratePanel';
import { ProviderStatus } from './components/ProviderStatus';

type Tab = 'generate' | 'gallery' | 'system';

export function App() {
  const [tab, setTab] = useState<Tab>('generate');
  const [providers, setProviders] = useState<ProvidersResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    api
      .providers()
      .then(setProviders)
      .catch((err: Error) => setLoadError(err.message));
  }, []);

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
          <button
            className={tab === 'generate' ? 'tab active' : 'tab'}
            onClick={() => setTab('generate')}
          >
            生成素材
          </button>
          <button
            className={tab === 'gallery' ? 'tab active' : 'tab'}
            onClick={() => setTab('gallery')}
          >
            素材画廊
          </button>
          <button
            className={tab === 'system' ? 'tab active' : 'tab'}
            onClick={() => setTab('system')}
          >
            系统状态
          </button>
        </nav>
      </header>

      <main className="main">
        {loadError && <div className="alert error">无法连接服务端：{loadError}</div>}
        {!providers && !loadError && <div className="loading">加载中…</div>}
        {providers && (
          <>
            <div style={{ display: tab === 'generate' ? 'block' : 'none' }}>
              <GeneratePanel providers={providers} />
            </div>
            {tab === 'gallery' && <Gallery />}
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
      </footer>
    </div>
  );
}
