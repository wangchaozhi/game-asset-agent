# API 参考

Base URL：`http://127.0.0.1:8787`（可经 `PORT`/`HOST` 修改）。
所有请求/响应均为 JSON（SSE 端点除外）。类型定义见 `packages/shared/src/types.ts`。

## Providers

### `GET /api/providers`

返回可用的图像 / 音频引擎与 LLM 状态，前端据此渲染选项。

```json
{
  "imageProviders": [
    {
      "id": "mock",
      "label": "内置占位生成器 (Mock)",
      "configured": true,
      "requires": [],
      "models": ["mock-svg-v1"],
      "defaultModel": "mock-svg-v1",
      "supportsNegativePrompt": false,
      "outputFormat": "svg",
      "supportsReferenceImage": false,
      "preferredPromptLanguage": "en",
      "supportsHealthCheck": true
    }
  ],
  "audioProviders": [
    {
      "id": "mock-audio",
      "label": "内置音频合成器 (Mock)",
      "configured": true,
      "requires": [],
      "models": ["mock-synth-v1"],
      "defaultModel": "mock-synth-v1",
      "outputFormat": "wav"
    }
  ],
  "llm": {
    "configured": true,
    "provider": "anthropic",
    "model": "claude-opus-4-8",
    "supportsVision": true
  },
  "postprocess": { "available": true }
}
```

- 图像内置 Provider：`mock` / `openai-images` / `stability` / `replicate` / `tongyi-wanxiang` / `sd-webui` / `comfyui`
- 音频内置 Provider：`mock-audio` / `elevenlabs` / `stable-audio`
- LLM 适配：`anthropic` / `openai`（兼容端点）/ `gemini`

### `POST /api/providers/:id/check` — Provider 连通性检查

对支持 `healthCheck` 的图像/音频 Provider 发起探测（本地 SD WebUI / ComfyUI 尤其有用）。

`{ "ok": true, "message": "连接正常", "latencyMs": 128 }`

### `GET /api/health`

`{ "ok": true, "queue": { "pending": 0, "active": 0 } }`

### `GET /api/usage` — 成本 / 用量统计

`{ "images": [{ "key": "mock/mock-svg-v1", "provider": "mock", "calls": 12 }], "llm": [{ "key": "anthropic/claude-opus-4-8", "provider": "anthropic", "calls": 8, "tokensIn": 5200, "tokensOut": 1800 }], "updatedAt": 0 }`

### `GET /api/auth`

`{ "required": true }` —— 是否启用了 `AUTH_TOKEN` 鉴权。启用后除本端点外所有 `/api` 需 `Authorization: Bearer <token>`（SSE 走 `?token=`）。

## Jobs

### `POST /api/jobs` — 创建生成任务

请求体（zod 校验，详见 `createJobSchema`）：

```json
{
  "brief": "一套奇幻风格的药水瓶图标：生命、法力、剧毒",
  "assetType": "icon",
  "style": "pixel-art",
  "provider": "mock",
  "model": "mock-svg-v1",
  "count": 3,
  "width": 512,
  "height": 512,
  "negativePrompt": "text, watermark",
  "maxRetries": 1,
  "postprocess": {
    "variants": [0.5, 2],
    "format": "webp"
  }
}
```

- `kind`: `image`（默认）或 `audio`；音频时 `assetType` 必须为 `sfx | bgm`，可带 `durationSeconds`（0.5–30）
- `assetType`（图像）：`sprite | icon | texture | background | ui | concept`
- `count`: 1–8；`width/height`: 64–2048；`maxRetries`: 0–3
- `postprocess` 可选：`variants` 为尺寸倍率数组（0.1–2，最多 4 个），`format` 为额外输出格式 `png | webp`
- 进阶可选字段：
  - `seed`（复现/一致性）、`referenceImage`（上传返回的文件名，走 img2img）、`referenceStrength`（0–1）
  - `transparentBackground`（sprite/icon 去底，需 sharp）、`spritesheet`（多帧合成精灵表，需 sharp、帧数≥2）
  - `characterSheet`（角色描述卡）、`styleProfileId`（风格档案锚定）、`parentAssetId`（版本链）
  - `reviewPolicy`：`{ enabled?, threshold?(0–10), weights?{subject,style,composition,defects} }`
- 未安装可选依赖 `sharp` 时，任务仍会保存原图，后处理/去底/精灵表自动跳过并写入进度日志
- 返回 `201` + Job 对象；参数错误返回 `400 { error, issues[] }`

### `POST /api/jobs/:id/cancel` — 取消任务

队列中直接移除；执行中置取消标记，流水线在阶段边界终止。终态任务返回 `409`。

### `GET /api/jobs?limit=50` — 任务列表（新→旧）

### `GET /api/jobs/:id` — 任务详情

### `GET /api/jobs/:id/export` — 导出任务产物

返回 `application/zip`，包含该任务下所有素材原文件、后处理变体与 `manifest.json`。

### `GET /api/jobs/:id/events` — SSE 实时进度

`text/event-stream`，事件类型：

| event      | data               | 说明                                                                            |
| ---------- | ------------------ | ------------------------------------------------------------------------------- |
| `snapshot` | `Job`              | 连接建立时补发当前任务快照                                                      |
| `progress` | `JobProgressEvent` | 流水线阶段日志（plan/prompt/generate/review/postprocess/retry/save/error/done） |
| `status`   | `{ status }`       | 任务状态变更                                                                    |
| `end`      | `Job`              | 终态（completed/failed），随后服务端断流                                        |

```js
const es = new EventSource('/api/jobs/<id>/events');
es.addEventListener('progress', (e) => console.log(JSON.parse(e.data)));
es.addEventListener('end', () => es.close());
```

## Assets

### `GET /api/assets?jobId=&limit=200` — 素材列表（新→旧）

### `GET /api/assets/:id` — 素材元数据

### `PATCH /api/assets/:id` — 素材重命名

请求体 `{ "name": "新名称" }`（1–80 字），返回更新后的 `AssetRecord`。

### `DELETE /api/assets/:id` — 删除素材（记录 + 文件）

会同时删除原文件、`variants` 后处理变体与 `seamPreview` 接缝预览文件。

### `GET /api/assets/export?ids=<id1>,<id2>` — 批量导出素材

返回 `application/zip`，包含所选素材原文件、后处理变体与 `manifest.json`。`manifest.json` 会保留提示词、Provider、模型、评分等元数据，便于导入游戏工程或归档。

### `GET /files/:fileName` — 素材文件（静态服务）

`AssetRecord` 的 `fileName` 字段即此处的文件名，前端直接 `<img src="/files/<fileName>">`（音频用 `<audio src>`）。

## Uploads

### `POST /api/uploads` — 上传参考图

请求体 `{ "dataUrl": "data:image/png;base64,..." }`（png/jpeg/webp，≤20MB，为避免引入 multipart 依赖用 base64 data URL）。
返回 `201 { "fileName": "upload-<uuid>.png", "url": "/files/..." }`，`fileName` 可直接作为创建任务的 `referenceImage`。

## Style Profiles（风格档案）

- `GET /api/style-profiles` — 列表（新→旧）
- `POST /api/style-profiles` — 创建：`{ name, keywords[], negative[], palette[], referenceImage?, note? }`，返回 `201` + 档案
- `PUT /api/style-profiles/:id` — 更新（同上字段）
- `DELETE /api/style-profiles/:id` — 删除

创建任务时传 `styleProfileId` 即注入该档案的关键词/色板/参考图，锚定跨批次风格一致。
