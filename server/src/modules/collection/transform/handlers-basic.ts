// 5 类基础 Transform：field-mapping / type-cast / clean / dedup / filter
import type { TransformHandler } from "./types.js";
import { TransformStepError } from "./types.js";
import { Parser } from "expr-eval";

// ===================== field-mapping =====================
// 重命名/筛选字段。config: { mapping: { srcField: dstField }, includeOnly: boolean }
export const fieldMappingHandler: TransformHandler = {
  type: "field-mapping",
  apply(record, _state, config) {
    const mapping = (config.mapping || {}) as Record<string, string>;
    const includeOnly = config.includeOnly === true;
    if (includeOnly) {
      const out: Record<string, unknown> = {};
      for (const [src, dst] of Object.entries(mapping)) {
        if (src in record) out[dst] = record[src];
      }
      return out;
    }
    const out: Record<string, unknown> = { ...record };
    for (const [src, dst] of Object.entries(mapping)) {
      if (src in out) {
        out[dst] = out[src];
        if (src !== dst) delete out[src];
      }
    }
    return out;
  },
};

// ===================== type-cast =====================
// 类型转换。config: { fields: { fieldName: { target: 'number|boolean|date|decimal', format?: string } } }
export const typeCastHandler: TransformHandler = {
  type: "type-cast",
  apply(record, _state, config) {
    const out = { ...record };
    const fields = (config.fields || {}) as Record<
      string,
      { target: "number" | "boolean" | "date" | "decimal"; format?: string }
    >;
    for (const [field, spec] of Object.entries(fields)) {
      if (!(field in out)) continue;
      const v = out[field];
      try {
        out[field] = castValue(v, spec.target, spec.format);
      } catch (err) {
        throw new TransformStepError("type-cast", `字段 ${field} 类型转换失败: ${(err as Error).message}`, record);
      }
    }
    return out;
  },
};

function castValue(
  v: unknown,
  target: "number" | "boolean" | "date" | "decimal",
  format?: string,
): unknown {
  if (v === null || v === undefined) return v;
  switch (target) {
    case "number": {
      const n = Number(v);
      if (Number.isNaN(n)) throw new Error(`无法转为 number: ${String(v)}`);
      return n;
    }
    case "decimal": {
      const n = Number(v);
      if (Number.isNaN(n)) throw new Error(`无法转为 decimal: ${String(v)}`);
      // 解析 format 如 "0.00" → 2 位小数；不传默认 2 位
      const m = format ? /\.(\d+)/.exec(format) : null;
      const decimals = m ? m[1].length : 2;
      return Number(n.toFixed(decimals));
    }
    case "boolean": {
      if (typeof v === "boolean") return v;
      const s = String(v).toLowerCase().trim();
      if (["true", "1", "yes", "y", "t"].includes(s)) return true;
      if (["false", "0", "no", "n", "f"].includes(s)) return false;
      throw new Error(`无法转为 boolean: ${String(v)}`);
    }
    case "date": {
      const d = new Date(v as string);
      if (Number.isNaN(d.getTime())) throw new Error(`无法转为 date: ${String(v)}`);
      return format ? formatDate(d, format) : d.toISOString();
    }
  }
}

function formatDate(d: Date, format: string): string {
  // 简化版：YYYY-MM-DD / YYYY-MM-DD HH:mm:ss
  const pad = (n: number) => String(n).padStart(2, "0");
  if (format === "YYYY-MM-DD") {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  if (format === "YYYY-MM-DD HH:mm:ss") {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
  return d.toISOString();
}

// ===================== clean =====================
// 清洗：trim/defaults/regex 替换。config: { trim: string[], defaults: {field:value}, replace: [{field, pattern, replacement}] }
export const cleanHandler: TransformHandler = {
  type: "clean",
  apply(record, _state, config) {
    const out = { ...record };
    const trim = (config.trim || []) as string[];
    for (const f of trim) {
      if (typeof out[f] === "string") out[f] = (out[f] as string).trim();
    }
    const defaults = (config.defaults || {}) as Record<string, unknown>;
    for (const [f, v] of Object.entries(defaults)) {
      if (out[f] === undefined || out[f] === null || out[f] === "") out[f] = v;
    }
    const replaces = (config.replace || []) as Array<{
      field: string; pattern: string; replacement: string;
    }>;
    for (const r of replaces) {
      if (typeof out[r.field] === "string") {
        out[r.field] = (out[r.field] as string).replace(new RegExp(r.pattern, "g"), r.replacement);
      }
    }
    return out;
  },
};

// ===================== dedup =====================
// 主键去重（内存窗口）。config: { keys: string[], window?: number }
// state: { seen: Set<string>, window: number[] }
export const dedupHandler: TransformHandler = {
  type: "dedup",
  init(config) {
    const window = Number(config.window) || 0; // 0=无窗口（全内存）
    return { seen: new Set<string>(), window: [], maxWindow: window };
  },
  apply(record, state, config) {
    const keys = (config.keys || []) as string[];
    if (keys.length === 0) return record;
    const key = keys.map((k) => String(record[k] ?? "")).join("\u0001");
    const seen = state.seen as Set<string>;
    if (seen.has(key)) return null; // 重复，丢弃
    seen.add(key);
    // 简单窗口管理：若 maxWindow > 0，仅保留最近 maxWindow 个 key
    const maxWindow = state.maxWindow as number;
    if (maxWindow > 0) {
      const window = state.window as string[];
      window.push(key);
      if (window.length > maxWindow) {
        const old = window.shift()!;
        seen.delete(old);
      }
    }
    return record;
  },
};

// ===================== filter =====================
// 表达式过滤（基于 expr-eval）。config: { expr: 'amount > 100 && status == "active"' }
export const filterHandler: TransformHandler = {
  type: "filter",
  init(config) {
    const expr = String(config.expr || "");
    if (!expr) throw new TransformStepError("filter", "filter 缺少 expr 配置", {});
    const compiled = new Parser().parse(expr);
    return {
      evaluate: (r: Record<string, unknown>) => compiled.evaluate(r as never) as unknown,
    };
  },
  apply(record, state) {
    const evaluate = state.evaluate as (r: Record<string, unknown>) => unknown;
    try {
      const ok = evaluate(record);
      return ok ? record : null;
    } catch (err) {
      throw new TransformStepError("filter", `filter 表达式求值失败: ${(err as Error).message}`, record);
    }
  },
};

export const basicHandlers: TransformHandler[] = [
  fieldMappingHandler,
  typeCastHandler,
  cleanHandler,
  dedupHandler,
  filterHandler,
];
