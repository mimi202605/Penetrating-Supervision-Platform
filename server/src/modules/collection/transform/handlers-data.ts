// 3 类脱敏/扁平/富化 Transform：mask / flatten / enrich
import type { TransformHandler } from "./types.js";
import { TransformStepError } from "./types.js";

// ===================== mask =====================
// 脱敏字段。config: { fields: [{ name, strategy, keepPrefix?, keepSuffix? }] }
// strategy: 'fixed'（全部****）| 'keep-edges'（保留首尾）
export const maskHandler: TransformHandler = {
  type: "mask",
  apply(record, _state, config) {
    const out = { ...record };
    const fields = (config.fields || []) as Array<{
      name: string; strategy: "fixed" | "keep-edges"; keepPrefix?: number; keepSuffix?: number;
    }>;
    for (const f of fields) {
      if (!(f.name in out)) continue;
      const v = out[f.name];
      if (typeof v !== "string" || v.length === 0) continue;
      out[f.name] = maskValue(v, f.strategy, f.keepPrefix ?? 0, f.keepSuffix ?? 0);
    }
    return out;
  },
};

function maskValue(
  v: string,
  strategy: "fixed" | "keep-edges",
  keepPrefix: number,
  keepSuffix: number,
): string {
  if (strategy === "fixed") return "****";
  // keep-edges
  if (v.length <= keepPrefix + keepSuffix) return "****";
  const prefix = v.slice(0, keepPrefix);
  const suffix = v.slice(v.length - keepSuffix);
  const maskedLen = v.length - keepPrefix - keepSuffix;
  return `${prefix}${"*".repeat(Math.min(maskedLen, 8))}${suffix}`;
}

// ===================== flatten =====================
// 嵌套展开（金蝶 FEntry 数组）。config: { field: 'FEntry', prefix?: 'entry_', mode?: 'spread'|'first' }
// spread：N 个元素 → N 条扁平记录；first：仅取首个元素并入主记录
export const flattenHandler: TransformHandler = {
  type: "flatten",
  apply(record, _state, config) {
    const field = String(config.field || "");
    const prefix = String(config.prefix || "");
    const mode = (config.mode as "spread" | "first") || "spread";
    if (!field || !(field in record)) return record;
    const arr = record[field];
    if (!Array.isArray(arr)) return record;
    if (arr.length === 0) {
      const out = { ...record };
      delete out[field];
      return out;
    }
    if (mode === "first") {
      const out = { ...record };
      const first = arr[0] as Record<string, unknown>;
      for (const [k, v] of Object.entries(first)) {
        out[`${prefix}${k}`] = v;
      }
      delete out[field];
      return out;
    }
    // spread
    return arr.map((item) => {
      const out = { ...record };
      const it = item as Record<string, unknown>;
      for (const [k, v] of Object.entries(it)) {
        out[`${prefix}${k}`] = v;
      }
      delete out[field];
      return out;
    });
  },
};

// ===================== enrich =====================
// 维表关联（组织/客商主数据）。config: { lookupField, lookupTable: {key:value}, fields: {srcField:dstField}, mode?: 'left'|'inner' }
// 左连接：找不到匹配时主记录保留；内连接：丢弃
export const enrichHandler: TransformHandler = {
  type: "enrich",
  init(config) {
    const lookupTable = (config.lookupTable || {}) as Record<string, Record<string, unknown>>;
    const fields = (config.fields || {}) as Record<string, string>;
    return { lookupTable, fields };
  },
  apply(record, state, config) {
    const lookupField = String(config.lookupField || "");
    if (!lookupField) return record;
    const lookupTable = state.lookupTable as Record<string, Record<string, unknown>>;
    const fields = state.fields as Record<string, string>;
    const mode = (config.mode as "left" | "inner") || "left";
    const key = String(record[lookupField] ?? "");
    const matched = lookupTable[key];
    if (!matched) {
      if (mode === "inner") return null;
      return record;
    }
    const out = { ...record };
    for (const [src, dst] of Object.entries(fields)) {
      if (src in matched) out[dst] = matched[src];
    }
    return out;
  },
};

export const dataHandlers: TransformHandler[] = [maskHandler, flattenHandler, enrichHandler];

void TransformStepError; // 预留：mask 内部不抛错，但保留引用避免 import 警告
