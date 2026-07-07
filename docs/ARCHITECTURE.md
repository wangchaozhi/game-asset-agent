# 架构设计

## 设计目标

1. **多模型兼容**：图像引擎与 LLM 都可插拔，新增一个服务商不改动上层代码
2. **可降级**：没有任何 API Key 也能端到端跑通（mock 引擎 + 规则模板智能体）
3. **契约单一来源**：前后端共享同一份类型与校验 Schema（`@gaf/shared`）
4. **零原生依赖**：JSON 文件存储 + SVG 占位生成，任何机器 `npm install` 即可运行

## 总览

```
┌──────────────────────────── apps/web (React + Vite) ────────────────────────────┐
│  生成表单        SSE 实时进度        素材画廊        系统状态                      │
└──────────────┬───────────────────────────────────────────────────────────────────┘
               │ REST + SSE（契约类型来自 @gaf/shared）
┌──────────────▼──────────────── packages/server (Fastify) ────────────────────────┐
│  routes/          jobs · assets · providers · SSE                                │
│  queue/           进程内 FIFO 队列（受控并发）                                     │
│  agents/          ┌─────────────────────────────────────────────┐                │
│                   │  多智能体流水线（pipeline.ts 编排）           │                │
│                   │  ① director    美术总监：需求 → 素材规划      │                │
│                   │  ② promptsmith 提示词工程师：规划 → 提示词    │                │
│                   │  ③ provider    图像引擎：提示词 → 图像        │                │
│                   │  ④ critic      审查官：打分，不合格回到 ② 重试 │                │
│                   └─────────────────────────────────────────────┘                │
│  llm/             LLM 适配层     anthropic（官方 SDK）│ openai-compatible │ null  │
│  imagegen/        图像 Provider 注册表                                            │
│                   mock │ openai-images │ stability │ sd-webui │ (可扩展…)        │
│  db/ + storage/   JSON 元数据存储 + 素材文件落盘（/files/ 静态服务）               │
│  events.ts        任务事件总线（流水线发布 → SSE 订阅转发）                        │
└──────────────────────────────────────────────────────────────────────────────────┘
```

## 多智能体流水线

编排逻辑在 `packages/server/src/agents/pipeline.ts`，每个智能体是一个纯函数模块，
显式注入依赖（LLM 客户端、存储、事件总线），便于单测与替换。

| 智能体                     | 职责                                                         | LLM 缺席时的降级行为                     |
| -------------------------- | ------------------------------------------------------------ | ---------------------------------------- |
| 美术总监 `director`        | 把一句话需求拆成 N 条互有差异、可直接生成的素材规划          | 模板：描述 + 差异化修饰词                |
| 提示词工程师 `promptsmith` | 结合素材类型模板与风格预设生成优化提示词；重试时吸收审查反馈 | 模板拼接：类型模板 + 风格关键词 + 质量词 |
| 审查官 `critic`            | 用视觉 LLM 对产出打分（0-10），给出中文改进意见              | 直接放行（SVG 输出同样跳过）             |

关键决策：

- **失败隔离**：单个素材失败只记录日志，不影响批次内其它素材；全部失败才判任务失败
- **反馈闭环**：审查不通过时，反馈文本注入提示词工程师的下一次改写（最多 `maxRetries` 次）
- **静默降级**：任何智能体的 LLM 调用异常都回退到规则模板，保证流水线永不因 LLM 阻断

## 多模型适配

### 图像 Provider（`imagegen/`）

统一接口（`types.ts`）：

```ts
interface ImageProvider {
  id;
  label;
  requires;
  models;
  defaultModel;
  supportsNegativePrompt;
  outputFormat;
  isConfigured(): boolean;
  generate(input: ImageGenInput, model?: string): Promise<ImageGenResult>;
}
```

**新增一个模型服务的步骤**：在 `imagegen/providers/` 实现该接口 → 在 `registry.ts` 中
`register(...)` 一行。前端的引擎下拉框、配置状态展示、API 校验全部自动生效
（数据来自 `GET /api/providers`）。

内置图像 Provider：

| id                | 服务             | 说明                                                                            |
| ----------------- | ---------------- | ------------------------------------------------------------------------------- |
| `mock`            | 内置 SVG 生成器  | 零密钥；按素材类型绘制确定性占位图（同提示词同输出），支撑无 Key 体验与原型开发 |
| `openai-images`   | OpenAI Images    | gpt-image-1 / dall-e-3；含 gpt-image-1 参考图 edits                             |
| `stability`       | Stability AI     | Core / SD3.5 / Ultra；含 image-to-image                                         |
| `replicate`       | Replicate        | FLUX / SDXL 等开源模型；异步预测轮询                                            |
| `tongyi-wanxiang` | 通义万相         | 阿里云 DashScope；中文提示词更佳（`preferredPromptLanguage: 'zh'`）             |
| `sd-webui`        | 本地 A1111 WebUI | 任意本地 Checkpoint，需 `--api`；含 img2img                                     |
| `comfyui`         | 本地 ComfyUI     | 内置参数化 workflow，支持 `DATA_DIR/workflows/` 自定义模板                      |

图像 Provider 还支持可选 `healthCheck()`（连通性检查）与参考图能力位。

### 音频 Provider（`audiogen/`）

与图像 Provider 同构的注册表（`AudioProvider.generate → {data, format:'wav'|'mp3'}`）。
音频任务由独立的 `runAudioJob` 编排（复用队列 / 事件 / 存储，跳过视觉审查）。

| id             | 服务                   | 说明                                  |
| -------------- | ---------------------- | ------------------------------------- |
| `mock-audio`   | 内置 WAV 合成器        | 零密钥；确定性合成音效 / BGM 占位音频 |
| `elevenlabs`   | ElevenLabs Sound FX    | 音效与短氛围音                        |
| `stable-audio` | Stability Stable Audio | 音效与器乐 BGM                        |

### LLM 适配（`llm/`）

最小统一接口：`complete({ system, prompt, images?, maxTokens? }) → string`。

- `anthropic.ts`：Claude，使用官方 `@anthropic-ai/sdk`，支持视觉（审查官可用）
- `openaiCompat.ts`：任何 OpenAI Chat Completions 兼容端点（改 `OPENAI_BASE_URL` 即可接 DeepSeek / Ollama / vLLM）
- LLM 输出统一经 `util/json.ts` 的容错解析（支持代码块围栏、前后缀噪声）

## 数据与实时性

- **存储**：`db/store.ts` 为 JSON 文件存储（防抖 + tmp/rename 原子写）。选型理由：
  元数据量小、单进程队列无并发写方、零原生依赖；上层是仓储接口，未来可无痛换 SQLite
- **素材文件**：`DATA_DIR/assets/<uuid>.<ext>`，经 `@fastify/static` 以 `/files/` 提供
- **实时进度**：流水线 → `JobEventBus`（进程内 EventEmitter）→ SSE 路由。
  连接时先补发任务快照，再推增量事件；15s 心跳保活；终态事件后服务端主动断流
- **崩溃恢复**：进程重启时把非终态任务标记为失败，避免幽灵任务

## 工程化

- **monorepo**：npm workspaces；`@gaf/shared` 编译为 dist 供 server（tsx 运行时）与 web（vite 打包）消费
- **类型策略**：TS strict + NodeNext（相对导入带 `.js` 后缀）；web 用 bundler resolution
- **测试**：Vitest 覆盖纯逻辑（Schema、提示词模板、规划降级、JSON 抽取、存储、注册表、mock 生成器确定性）
- **CI**：GitHub Actions 跑 lint → typecheck → test → build
- **运行时**：服务端由 `tsx` 直接运行 TS（开发 `watch`，生产同命令），省去发布产物管线

## 扩展点

| 想做的事                          | 改动位置                                                       |
| --------------------------------- | -------------------------------------------------------------- |
| 接入 Replicate / ComfyUI / 即梦等 | `imagegen/providers/` 新文件 + registry 注册                   |
| 接入 Gemini 等其它 LLM            | `llm/` 新适配器 + `createLlm` 分支                             |
| 音效 / 音乐生成                   | 新增 `audiogen/` 目录，复用同样的 Provider 注册表模式          |
| 素材后处理（缩放/去底/切图）      | pipeline 的 save 步骤前插入 postprocess 环节（可选依赖 sharp） |
| 换数据库                          | 保持 `Store` 公开方法签名，替换内部实现                        |
