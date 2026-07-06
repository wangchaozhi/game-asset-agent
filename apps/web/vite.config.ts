import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 开发时前端跑在 5173，API 请求代理到本地服务端 8787
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8787',
      '/files': 'http://127.0.0.1:8787',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
