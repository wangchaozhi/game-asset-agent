# 后续开发路线图（Roadmap）

> 本文档规划 GameAsset Forge v0.1.0 之后的功能演进。
> 每项功能标注：**优先级**（P0 必做 / P1 重要 / P2 有价值）、**工作量**（S ≤ 1 天 / M 2–4 天 / L ≥ 1 周）、
> 以及落在现有架构的哪个扩展点（见 [ARCHITECTURE.md](ARCHITECTURE.md) 的「扩展点」一节）。
> 发版节奏：每完成一个里程碑打 `v0.x.0` 标签，Release CI 自动发布。
>
> **实现进度（截至当前）**：v0.2 ~ v0.5 全部功能已落地；v0.6 已完成 Docker 部署、鉴权、成本统计、任务取消。
> 状态图例：✅ 已实现 · 🟡 基础版 · ⬜ 待办。

## 总览

| 里程碑 | 主题           | 核心产出                                          |
| ------ | -------------- | ------------------------------------------------- |
| v0.2   | 素材可用性     | 后处理管线、批量导出、画廊增强                    |
| v0.3   | 模型生态扩展   | Replicate / ComfyUI / 国内模型、Provider 健康检查 |
| v0.4   | 智能体能力升级 | 参考图、风格锚定、对话式修图、审查策略可配置      |
| v0.5   | 音频与动画素材 | 音效/BGM 生成、精灵表切分打包                     |
| v0.6   | 平台化与部署   | 项目空间、SQLite、Docker、鉴权、成本统计          |

---

## v0.2 素材可用性（让产出直接进游戏引擎）

**目标**：缩短「生成 → 可用」的最后一公里。当前产出是单张原图，游戏开发实际需要多分辨率变体、透明背景、打包下载。

### 1. 素材后处理管线 `P0 · M`

> 状态：已落地基础版（可选 sharp、尺寸变体、PNG/WebP 副本、进度日志与画廊下载链接）。

- 在流水线 `pipeline.ts` 的 save 步骤前插入可选 postprocess 环节（新增 `packages/server/src/postprocess/`）
- 引入 `sharp` 作为**可选依赖**（optionalDependencies，加载失败时跳过后处理并提示，保持零原生依赖可跑）
- 能力：尺寸变体（@0.5x/@1x/@2x）、PNG ↔ WebP 转换、缩略图（画廊加载提速）
- Schema 扩展：`createJobSchema` 增加 `postprocess?: { variants?: number[]; format?: 'png'|'webp' }`

### 2. 透明背景（去底）`P1 · M` ✅

> 状态：已实现方案 A（sprite/icon「透明背景」开关 + 提示词引导纯色底 + sharp 四角色键抠图，产出透明 PNG 变体）。方案 B（rembg）留作后续。

- sprite / icon 类型可选「透明背景」开关
- 方案 A：提示词层面强制纯色背景 + sharp 色键抠图（零外部依赖，先做）
- 方案 B：接入 rembg（本地 HTTP 服务）作为一个 postprocess Provider（后续）

### 3. 批量导出 `P0 · S`

> 状态：已落地基础版（任务导出、素材多选导出、manifest.json、变体随包导出）。

- `GET /api/jobs/:id/export` 与 `GET /api/assets/export?ids=`：服务端打 zip（用 `archiver`），内含素材 + `manifest.json`（提示词/参数元数据）
- 画廊工具栏加「多选 → 导出」

### 4. 画廊与任务管理增强 `P1 · M` ✅

> 状态：已实现任务历史页（列表 + 状态 + 用同参数重生成 + 取消/导出）、画廊按 Provider 筛选与名称/提示词搜索、素材双击重命名、单素材「重生成」（带版本链 parentAssetId）。

- 任务历史页：列出历史任务、状态、一键「用同参数重新生成」
- 画廊：按风格/Provider 筛选、搜索（名称/提示词）、素材重命名
- 单素材「重新生成」：复用原 prompt（可编辑后提交），产出并排对比

### 5. 无缝贴图自检 `P2 · S` ✅

> 状态：已实现。texture 产出后按 50% 偏移环绕拼接生成接缝预览图，画廊「接缝自检」中展开查看。

- texture 类型产出后，将图片左右/上下平移 50% 拼接生成「接缝预览图」，随素材一起展示，方便肉眼验收

---

## v0.3 模型生态扩展（兼容更多引擎）

**目标**：覆盖主流托管与本地生态。全部通过 `imagegen/providers/` 新增实现 + registry 注册一行完成，前端零改动。

### 1. Replicate Provider `P1 · M` ✅

> 状态：已实现。`models/{owner}/{name}/predictions` 创建预测 → 轮询直至 succeeded → 下载结果；内置 FLUX schnell/dev、SDXL；含 healthCheck。

- 聚合大量开源模型（FLUX、SDXL 等）；实现异步预测轮询（create prediction → poll until succeeded）
- `requires: ['REPLICATE_API_TOKEN']`，models 列表可配置

### 2. ComfyUI Provider `P1 · L` ✅

> 状态：已实现。内置参数化 txt2img workflow（prompt/negative/尺寸/seed/checkpoint 槽位），支持 `DATA_DIR/workflows/<model>.json` 自定义模板；轮询 `/history` 取图，进度经 `onProgress` 桥接到 SSE（WebSocket 逐节点进度留作后续增强）。

- 本地 ComfyUI 的 `/prompt` API + WebSocket 进度
- 设计：内置一个参数化的 txt2img workflow JSON 模板（prompt/尺寸/seed 槽位），高级用户可放置自定义 workflow 文件到 `DATA_DIR/workflows/`
- 进度事件桥接到现有 SSE（ComfyUI 的节点进度 → JobProgressEvent）

### 3. 国内模型 Provider `P2 · M` ✅

> 状态：已实现通义万相（DashScope，异步任务轮询，`preferredPromptLanguage: 'zh'`）。即梦（火山引擎，需 AK/SK V4 签名）留作后续。

- 即梦（火山引擎）、通义万相等；各自独立 Provider 文件，密钥经环境变量
- 注意：部分服务提示词中文更佳 —— Provider 增加 `preferredPromptLanguage` 能力位，提示词工程师智能体按此决定输出语言

### 4. LLM 适配扩展 `P2 · S` ✅

> 状态：已实现 Gemini 适配器（`llm/gemini.ts`，支持视觉）；`createLlm` 已是小型注册表，`LLM_PROVIDER` 支持 `anthropic | openai | gemini | none`。

- Gemini 适配器（`llm/gemini.ts`）；LLM 侧同样做成小型注册表，`LLM_PROVIDER` 支持更多取值

### 5. Provider 健康检查 `P1 · S` ✅

> 状态：已实现。图像/音频 Provider 可选 `healthCheck()`，`POST /api/providers/:id/check`，系统状态页每个 Provider 带「测试连接」按钮（显示延迟）。

- `ImageProvider` 增加可选 `healthCheck(): Promise<{ok, message}>`
- `POST /api/providers/:id/check`；系统状态页加「测试连接」按钮（本地 SD WebUI / ComfyUI 尤其需要）

---

## v0.4 智能体能力升级（质量与一致性）

**目标**：从「单发生成」进化到「可控、一致、可迭代」，这是与裸用绘图工具拉开差距的核心。

### 1. 参考图输入 `P0 · L` ✅

> 状态：已实现。`POST /api/uploads`（base64 data URL）+ `ImageGenInput.referenceImage`；SD WebUI img2img、Stability image-to-image、gpt-image-1 edits 三处按能力实现；前端表单含上传区与去噪强度滑块。

- 上传参考图（风格参照 / image-to-image）：`POST /api/uploads` + `ImageGenInput` 增加 `referenceImage?`
- 各 Provider 按能力实现（SD WebUI img2img、Stability image-to-image、gpt-image-1 参考图）
- 前端生成表单加图片上传区

### 2. 项目风格锚定 `P0 · M` ✅

> 状态：已实现。Store 增加 `styleProfiles` 集合 + CRUD 路由；风格档案页管理；生成表单可选档案，提示词工程师注入其关键词/色板/参考图；画廊「存风格」一键存档。

- 新增「项目」概念的前置版本：**风格档案（Style Profile）**——把一次满意产出的风格要素（关键词、色板、参考图）存档
- 美术总监/提示词工程师智能体读取风格档案，保证跨批次风格一致
- 存储：Store 增加 `styleProfiles` 集合；前端画廊里「存为风格档案」

### 3. 对话式修图 `P1 · L` 🟡

> 状态：基础版。画廊「重生成」复用原素材参数并写入版本链（`AssetRecord.parentAssetId`）；有编辑能力的 Provider（gpt-image-1 edits / SD img2img）配合参考图即可迭代。素材详情页对话框与真 inpaint 局部编辑留作后续。

- 对单个素材追加指令（“把剑柄改成金色”）：
  - 有编辑能力的 Provider（gpt-image-1 edits、SD inpaint）走真编辑
  - 无编辑能力的 Provider 走「提示词工程师改写 + 重生成」
- 素材详情页增加对话框，形成素材的版本链（`AssetRecord` 增加 `parentAssetId`）

### 4. 审查策略可配置 `P1 · S` ✅

> 状态：已实现。`ReviewPolicy`（enabled / threshold / weights）请求级可覆盖；审查官分维度打分（subject/style/composition/defects）→ 加权总分，画廊展示各维度评分条。

- 把审查官的通过阈值、评审维度权重、是否启用提炼为 `ReviewPolicy`（请求级可覆盖，默认全局配置）
- 审查维度细分：主体符合度 / 风格匹配 / 构图可用性 / 瑕疵，分别打分，反馈更精准

### 5. 角色一致性 `P2 · L` 🟡

> 状态：基础版。角色描述卡（`characterSheet`）注入提示词 + 固定 `seed` 复用 + 参考图，可保持同一角色跨帧一致；成体系的 Character Sheet 管理界面留作后续。

- 同一角色多姿态/多表情：参考图 + seed 复用 + 角色描述卡（Character Sheet）注入提示词
- 依赖 1（参考图）与 2（风格锚定）先落地

---

## v0.5 音频与动画素材

**目标**：素材类型从图像扩展到声音与动画，复用同一套智能体/Provider/队列骨架。

### 1. 音效与 BGM 生成 `P1 · L` ✅

> 状态：已实现。`packages/server/src/audiogen/` 复用注册表模式；Provider：内置 Mock WAV 合成器（零密钥确定性）、ElevenLabs Sound Effects、Stability Stable Audio；`assetType` 扩展 `sfx | bgm`，独立 `runAudioJob` 流水线（跳过视觉审查），前端「音频生成」页 + 画廊 `<audio>` 播放器。

- 新增 `packages/server/src/audiogen/`，复制图像 Provider 注册表模式（接口：`AudioProvider.generate → {data, format: 'wav'|'mp3'}`）
- 首批 Provider：ElevenLabs Sound Effects、Stability Stable Audio
- `assetType` 扩展 `sfx | bgm`；美术总监智能体的规划提示词按类型分支；审查官对音频降级放行（暂无听觉评审）
- 前端画廊对音频素材渲染 `<audio>` 播放器

### 2. 精灵表（Spritesheet）流水线 `P2 · L` ✅

> 状态：已实现。sprite 任务勾选后把各帧统一网格合成 sprite sheet（sharp）+ 输出 TexturePacker/Phaser 兼容 JSON 图集；前端 JS 逐帧循环预览，导出包含 `spritesheet/` 目录。

- 多帧生成（同角色 N 个动作帧，依赖 v0.4 角色一致性）→ sharp 合成 sprite sheet + 输出 JSON 元数据（帧尺寸/序列），兼容 Phaser/Unity 导入格式
- 前端帧序列预览（CSS steps 动画）

---

## v0.6 平台化与部署

**目标**：从单人本地工具走向可部署、可多人使用的服务。

| 功能            | 优先级/工作量 | 状态 | 方案要点                                                                                                                     |
| --------------- | ------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------- |
| Docker 部署     | P0 · S        | ✅   | 多阶段 Dockerfile（build shared/web → tsx 运行 server）+ docker-compose（挂载 DATA_DIR 卷、密钥占位）；GHCR 发布留作 CI 增强 |
| 鉴权            | P1 · M        | ✅   | 单管理员 API Token（`AUTH_TOKEN` + `onRequest` Bearer 校验，SSE 走 `?token=`）+ 前端登录页 / 退出                            |
| 成本统计        | P2 · M        | ✅   | LLM 请求经 `TrackingLlm` 估算 token、图像记录张数，按 provider/model 汇总；系统状态页成本面板；持久化到 db.json              |
| 任务取消        | P2 · S        | ✅   | `POST /api/jobs/:id/cancel`：队列中直接移除；执行中置取消标记，流水线在阶段边界终止（新增 `canceled` 状态）                  |
| SQLite 存储迁移 | P1 · M        | ⬜   | 保持 `Store` 公开接口不变，内部换 `better-sqlite3`（可选原生依赖）；启动时自动从 db.json 迁移                                |
| 项目空间        | P1 · L        | ⬜   | Project 实体（素材/任务/风格档案按项目组织），前端顶部项目切换器                                                             |
| 国际化          | P2 · M        | ⬜   | 前端文案抽离 i18n（中/英），shared 预设已含双语字段                                                                          |
| E2E 测试        | P1 · M        | ⬜   | Playwright 覆盖「创建任务 → SSE 进度 → 画廊出图」主链路（mock Provider，CI 可跑）                                            |

> 说明：v0.6 已交付 4 项（Docker / 鉴权 / 成本统计 / 任务取消）。剩余 4 项（SQLite、项目空间、i18n、E2E）体量较大或引入新依赖（原生 better-sqlite3 / Playwright），作为下一阶段推进；当前 JSON 存储在单进程下已满足，i18n 的双语字段已在 shared 预设就位。

---

## 非目标（当前阶段明确不做）

- **3D 模型生成**：生态尚不稳定、后处理链路重，观望到 v0.6 之后再评估
- **自研绘图模型/微调**：定位是编排与工作流层，模型能力交给 Provider 生态
- **实时协同编辑**：多人同时编辑同一素材的场景价值有限，项目空间粒度的隔离足够

## 工程约定（每个里程碑通用）

1. 新功能先补 `docs/`（本文件勾销 + API.md 增量），契约类型先落 `@gaf/shared`
2. 单测覆盖纯逻辑（Provider 参数映射、Schema、智能体降级路径），主链路补 E2E（v0.6 起）
3. 保持「零密钥可跑通」不变式：任何新能力在未配置时必须优雅降级或隐藏
4. 完成后 `npm run lint && npm test && npm run build` 全绿 → 打 tag 发版

## 后续实施顺序（剩余项）

v0.2 ~ v0.5 与 v0.6 的 Docker / 鉴权 / 成本统计 / 任务取消均已交付。剩余建议顺序：

1. **SQLite 存储迁移**：抽出 `StoreBackend` 接口，`better-sqlite3` 作可选原生依赖（未安装则回退 JSON），启动时自动从 db.json 迁移
2. **E2E 测试**：Playwright 覆盖「创建任务 → SSE 进度 → 画廊出图」主链路（mock Provider，CI 可跑）
3. **项目空间**：Project 实体（素材/任务/风格档案按项目组织）+ 前端项目切换器（依赖 SQLite 更稳）
4. **国际化**：前端文案抽离 i18n（shared 预设已含双语字段）
