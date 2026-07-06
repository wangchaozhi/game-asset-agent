/**
 * 从 LLM 的自由文本输出中稳健地抽取 JSON。
 * 兼容 ```json 代码块、前后缀说明文字等常见情况。
 */
export function extractJson<T = unknown>(text: string): T | null {
  const trimmed = text.trim();

  // 1) 优先尝试直接解析
  const direct = tryParse<T>(trimmed);
  if (direct !== null) return direct;

  // 2) 去掉 markdown 代码块围栏
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fenced) {
    const parsed = tryParse<T>(fenced[1].trim());
    if (parsed !== null) return parsed;
  }

  // 3) 扫描第一个平衡的 {...} 或 [...]
  for (const open of ['{', '[']) {
    const start = trimmed.indexOf(open);
    if (start === -1) continue;
    const candidate = scanBalanced(trimmed, start);
    if (candidate) {
      const parsed = tryParse<T>(candidate);
      if (parsed !== null) return parsed;
    }
  }
  return null;
}

function tryParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** 从 start 开始扫描出一个括号平衡的 JSON 片段（考虑字符串与转义） */
function scanBalanced(text: string, start: number): string | null {
  const open = text[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === open) {
      depth++;
    } else if (ch === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}
