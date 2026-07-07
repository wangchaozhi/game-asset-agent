import { useState } from 'react';
import { api, setAuthToken } from '../api';

interface Props {
  onSuccess: () => void;
}

/** 单管理员登录：输入访问令牌，校验通过后写入本地存储 */
export function Login({ onSuccess }: Props) {
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const submit = async () => {
    setError(null);
    if (!token.trim()) {
      setError('请输入访问令牌');
      return;
    }
    setChecking(true);
    setAuthToken(token.trim());
    try {
      await api.providers(); // 用受保护接口验证令牌
      onSuccess();
    } catch {
      setAuthToken(null);
      setError('令牌无效，请重试');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <span className="brand-mark">◆</span>
        <h2>GameAsset Forge</h2>
        <p className="muted">该实例已启用访问令牌保护，请输入令牌继续。</p>
        <input
          type="password"
          placeholder="访问令牌（AUTH_TOKEN）"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        {error && <div className="alert error">{error}</div>}
        <button className="primary" onClick={submit} disabled={checking}>
          {checking ? '验证中…' : '进入'}
        </button>
      </div>
    </div>
  );
}
