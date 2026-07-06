# API 参考

Base URL：`http://127.0.0.1:8787`（可经 `PORT`/`HOST` 修改）。
所有请求/响应均为 JSON（SSE 端点除外）。类型定义见 `packages/shared/src/types.ts`。

## Providers

### `GET /api/providers`

返回可用的图像引擎与 LLM 状态，前端据此渲染选项。

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
      "outputFormat": "svg"
    }
  ],
  "llm": {
    "configured": true,
    "provider": "anthropic",
    "model": "claude-opus-4-8",
    "supportsVision": true
  }
}
```

### `GET /api/health`

`{ "ok": true, "queue": { "pending": 0, "active": 0 } }`

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
  "maxRetries": 1
}
```

- `assetType`: `sprite | icon | texture | background | ui | concept`
- `count`: 1–8；`width/height`: 64–2048；`maxRetries`: 0–3
- 返回 `201` + Job 对象；参数错误返回 `400 { error, issues[] }`

### `GET /api/jobs?limit=50` — 任务列表（新→旧）

### `GET /api/jobs/:id` — 任务详情

### `GET /api/jobs/:id/events` — SSE 实时进度

`text/event-stream`，事件类型：

| event      | data               | 说明                                                                |
| ---------- | ------------------ | ------------------------------------------------------------------- |
| `snapshot` | `Job`              | 连接建立时补发当前任务快照                                          |
| `progress` | `JobProgressEvent` | 流水线阶段日志（plan/prompt/generate/review/retry/save/error/done） |
| `status`   | `{ status }`       | 任务状态变更                                                        |
| `end`      | `Job`              | 终态（completed/failed），随后服务端断流                            |

```js
const es = new EventSource('/api/jobs/<id>/events');
es.addEventListener('progress', (e) => console.log(JSON.parse(e.data)));
es.addEventListener('end', () => es.close());
```

## Assets

### `GET /api/assets?jobId=&limit=200` — 素材列表（新→旧）

### `GET /api/assets/:id` — 素材元数据

### `DELETE /api/assets/:id` — 删除素材（记录 + 文件）

### `GET /files/:fileName` — 素材文件（静态服务）

`AssetRecord` 的 `fileName` 字段即此处的文件名，前端直接 `<img src="/files/<fileName>">`。
