// snake_case ↔ camelCase 转换工具
// 数据库列用 snake_case，前端契约（src/api/types.ts）要求驼峰返回

/** 单词转驼峰：triggered_at -> triggeredAt */
export function toCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/** 单词转下划线：triggeredAt -> triggered_at */
export function toSnake(key: string): string {
  return key.replace(/([A-Z])/g, (_, c) => "_" + c.toLowerCase());
}

/** 递归把对象所有键转为驼峰（数组逐项递归） */
export function camelize<T>(input: unknown): T {
  if (Array.isArray(input)) {
    return input.map((v) => camelize(v)) as unknown as T;
  }
  if (input && typeof input === "object") {
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>).map(([k, v]) => [
        toCamel(k),
        camelize(v),
      ]),
    ) as T;
  }
  return input as T;
}

/** 把对象键转为下划线 */
export function snakify<T>(input: unknown): T {
  if (Array.isArray(input)) {
    return input.map((v) => snakify(v)) as unknown as T;
  }
  if (input && typeof input === "object") {
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>).map(([k, v]) => [
        toSnake(k),
        snakify(v),
      ]),
    ) as T;
  }
  return input as T;
}
