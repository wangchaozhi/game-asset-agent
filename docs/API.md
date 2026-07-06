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
  },
  "postprocess": {
    "available": true
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
  "maxRetries": 1,
  "postprocess": {
    "variants": [0.5, 2],
    "format": "webp"
  }
}
```

- `assetType`: `sprite | icon | texture | background | ui | concept`
- `count`: 1–8；`width/height`: 64–2048；`maxRetries`: 0–3
- `postprocess` 可选：`variants` 为尺寸倍率数组（0.1–2，最多 4 个），`format` 为额外输出格式 `png | webp`
- 未安装可选依赖 `sharp` 时，任务仍会保存原图，后处理阶段自动跳过并写入进度日志
- 返回 `201` + Job 对象；参数错误返回 `400 { error, issues[] }`

### `GET /api/jobs?limit=50` — 任务列表（新→旧）

### `GET /api/jobs/:id` — 任务详情

### `GET /api/jobs/:id/export` — 导出任务产物

返回 `application/zip`，包含该任务下所有素材原文件、后处理变体与 `manifest.json`。

### `GET /api/jobs/:id/events` — SSE 实时进度

`text/event-stream`，事件类型：

| event      | data               | 说明                                                                |
| ---------- | ------------------ | ------------------------------------------------------------------- |
| `snapshot` | `Job`              | 连接建立时补发当前任务快照                                          |
| `progress` | `JobProgressEvent` | 流水线阶段日志（plan/prompt/generate/review/postprocess/retry/save/error/done） |
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

会同时删除原文件与 `variants` 中记录的后处理变体文件。

### `GET /api/assets/export?ids=<id1>,<id2>` — 批量导出素材

返回 `application/zip`，包含所选素材原文件、后处理变体与 `manifest.json`。`manifest.json` 会保留提示词、Provider、模型、评分等元数据，便于导入游戏工程或归档。

### `GET /files/:fileName` — 素材文件（静态服务）

`AssetRecord` 的 `fileName` 字段即此处的文件名，前端直接 `<img src="/files/<fileName>">`。
