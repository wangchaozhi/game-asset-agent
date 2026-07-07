# GameAsset Forge · 游戏素材工坊

多智能体协作的游戏素材生成平台：一句话需求 → 美术总监拆解 → 提示词工程师优化 → 图像引擎生成 → 审查官质检，产出可直接使用的游戏素材（精灵、图标、无缝贴图、背景、UI、概念图）。

## 特性

- **多智能体流水线** —— 美术总监 / 提示词工程师 / 审查官三个 LLM 智能体协作，审查按 `ReviewPolicy` 分维度打分，不合格自动携反馈重试
- **多模型兼容**
  - 图像引擎：OpenAI Images（gpt-image-1 / dall-e-3）、Stability AI、Replicate（FLUX/SDXL）、通义万相、本地 SD WebUI（A1111）、本地 ComfyUI、内置 Mock 生成器
  - 音频引擎：ElevenLabs 音效、Stability Stable Audio、内置 Mock 合成器（音效 / BGM）
  - LLM 大脑：Anthropic Claude、Google Gemini、任意 OpenAI 兼容端点（OpenAI / DeepSeek / Ollama / vLLM …）
- **进阶生成能力** —— 参考图 img2img、透明背景去底、无缝贴图接缝自检、风格档案锚定、角色描述卡 + seed 一致性、精灵表合成（Phaser/Unity JSON）、固定种子复现
- **零密钥可跑通** —— 未配置任何 API Key 时使用内置确定性 SVG / WAV 生成器 + 规则模板，全流程可体验
- **Web 界面** —— 图像 / 音频生成、SSE 实时进度、素材画廊（搜索 / 筛选 / 重命名 / 重生成 / 导出）、任务历史、风格档案、成本统计、系统状态
- **部署与运维** —— 多阶段 Dockerfile + docker-compose、单管理员 Token 鉴权、成本/用量统计、任务取消
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

| 环境变量              | 说明                                                           | 默认                        |
| --------------------- | -------------------------------------------------------------- | --------------------------- |
| `PORT` / `HOST`       | 服务端监听地址                                                 | `8787` / `127.0.0.1`        |
| `DATA_DIR`            | 素材数据目录（相对路径基于 `packages/server`）                 | `./data`                    |
| `QUEUE_CONCURRENCY`   | 并发执行的生成任务数                                           | `1`                         |
| `AUTH_TOKEN`          | 设置后所有 `/api` 需 Bearer 鉴权，前端弹出登录页               | —（关闭）                   |
| `LLM_PROVIDER`        | `anthropic` / `openai` / `gemini` / `none`，缺省按密钥自动检测 | 自动                        |
| `ANTHROPIC_API_KEY`   | 启用 Claude 作为智能体大脑                                     | —                           |
| `OPENAI_API_KEY`      | 启用 OpenAI 兼容 LLM + OpenAI Images                           | —                           |
| `OPENAI_BASE_URL`     | OpenAI 兼容端点（DeepSeek/Ollama 等）                          | `https://api.openai.com/v1` |
| `GEMINI_API_KEY`      | 启用 Google Gemini 作为智能体大脑                              | —                           |
| `LLM_MODEL`           | 智能体使用的模型                                               | 随 provider                 |
| `STABILITY_API_KEY`   | 启用 Stability AI（图像 + Stable Audio）                       | —                           |
| `REPLICATE_API_TOKEN` | 启用 Replicate（FLUX / SDXL）                                  | —                           |
| `DASHSCOPE_API_KEY`   | 启用通义万相                                                   | —                           |
| `SD_WEBUI_URL`        | 本地 SD WebUI 地址（需 `--api`）                               | —                           |
| `COMFYUI_URL`         | 本地 ComfyUI 地址                                              | —                           |
| `ELEVENLABS_API_KEY`  | 启用 ElevenLabs 音效                                           | —                           |

### Docker 部署

```bash
docker compose up -d --build   # 访问 http://localhost:8787
```

镜像多阶段构建（编译 shared/web，tsx 运行服务端），数据持久化到 `gaf-data` 卷；密钥在 `docker-compose.yml` 的 `environment` 中按需填写。

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
