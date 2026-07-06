# GameAsset Forge · 游戏素材工坊

多智能体协作的游戏素材生成平台：一句话需求 → 美术总监拆解 → 提示词工程师优化 → 图像引擎生成 → 审查官质检，产出可直接使用的游戏素材（精灵、图标、无缝贴图、背景、UI、概念图）。

## 特性

- **多智能体流水线** —— 美术总监 / 提示词工程师 / 审查官三个 LLM 智能体协作，审查不合格自动携反馈重试
- **多模型兼容**
  - 图像引擎：OpenAI Images（gpt-image-1 / dall-e-3）、Stability AI（Core / SD3.5 / Ultra）、本地 SD WebUI（A1111）、内置 Mock 生成器
  - LLM 大脑：Anthropic Claude（官方 SDK）、任意 OpenAI 兼容端点（OpenAI / DeepSeek / Ollama / vLLM …）
- **零密钥可跑通** —— 未配置任何 API Key 时使用内置确定性 SVG 生成器 + 规则模板，全流程可体验
- **Web 界面** —— 生成表单、SSE 实时进度、素材画廊（预览 / 下载 / 删除）、系统状态
- **工程化** —— npm workspaces monorepo、TypeScript strict、ESLint + Prettier、Vitest、GitHub Actions CI

## 快速开始

```bash
npm install
npm run dev
```

- Web 界面：http://localhost:5173
- API 服务：http://localhost:8787

无需任何配置即可用「内置占位生成器」体验完整流程；要接入真实模型：

```bash
copy .env.example .env   # Windows（macOS/Linux 用 cp）
# 编辑 .env，填入所需密钥后重启
```

> 注：服务端通过环境变量读取配置。Windows PowerShell 下可直接
> `$env:ANTHROPIC_API_KEY='sk-...'; npm run dev`，或使用任意 dotenv 加载方式。

### 生产模式

```bash
npm run build   # 构建 shared + 前端，类型检查服务端
npm start       # 服务端在 8787 同时托管 API 与前端静态文件
```

## 配置

| 环境变量            | 说明                                                | 默认                              |
| ------------------- | --------------------------------------------------- | --------------------------------- |
| `PORT` / `HOST`     | 服务端监听地址                                      | `8787` / `127.0.0.1`              |
| `DATA_DIR`          | 素材数据目录（相对路径基于 `packages/server`）      | `./data`                          |
| `QUEUE_CONCURRENCY` | 并发执行的生成任务数                                | `1`                               |
| `LLM_PROVIDER`      | `anthropic` / `openai` / `none`，缺省按密钥自动检测 | 自动                              |
| `ANTHROPIC_API_KEY` | 启用 Claude 作为智能体大脑                          | —                                 |
| `OPENAI_API_KEY`    | 启用 OpenAI 兼容 LLM + OpenAI Images                | —                                 |
| `OPENAI_BASE_URL`   | OpenAI 兼容端点（DeepSeek/Ollama 等）               | `https://api.openai.com/v1`       |
| `LLM_MODEL`         | 智能体使用的模型                                    | `claude-opus-4-8` / `gpt-4o-mini` |
| `STABILITY_API_KEY` | 启用 Stability AI                                   | —                                 |
| `SD_WEBUI_URL`      | 本地 SD WebUI 地址（需 `--api`）                    | —                                 |

## 目录结构

```
├── packages/
│   ├── shared/    # 共享类型、zod Schema、风格预设（前后端契约的单一来源）
│   └── server/    # Fastify 服务端：智能体流水线、模型适配、队列、存储、API
├── apps/
│   └── web/       # React + Vite 前端
└── docs/          # 架构与 API 文档
```

## 常用脚本

| 命令                              | 说明                                           |
| --------------------------------- | ---------------------------------------------- |
| `npm run dev`                     | 同时启动服务端（8787）与前端开发服务器（5173） |
| `npm run build`                   | 全量构建                                       |
| `npm test`                        | 运行所有单元测试（Vitest）                     |
| `npm run lint` / `npm run format` | 代码检查 / 格式化                              |
| `npm run typecheck`               | 全仓库类型检查                                 |

## 文档

- [架构设计](docs/ARCHITECTURE.md) —— 分层、多智能体流水线、扩展新 Provider 的方法
- [API 参考](docs/API.md) —— REST + SSE 端点
- [后续开发路线图](docs/ROADMAP.md) —— v0.2–v0.6 功能规划、优先级与实施顺序

## License

MIT
