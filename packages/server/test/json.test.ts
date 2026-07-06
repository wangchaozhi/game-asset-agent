import { describe, expect, it } from 'vitest';
import { extractJson } from '../src/util/json.js';

describe('extractJson', () => {
  it('parses plain JSON', () => {
    expect(extractJson('{"a": 1}')).toEqual({ a: 1 });
  });

  it('parses fenced code blocks', () => {
    expect(extractJson('好的，结果如下：\n```json\n[{"x": true}]\n```\n希望有帮助')).toEqual([
      { x: true },
    ]);
  });

  it('extracts balanced JSON embedded in prose', () => {
    expect(extractJson('The answer is {"name": "he said \\"hi\\" {ok}"} thanks')).toEqual({
      name: 'he said "hi" {ok}',
    });
  });

  it('returns null for non-JSON text', () => {
    expect(extractJson('no json here')).toBeNull();
  });
});
