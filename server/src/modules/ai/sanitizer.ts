// 人工智能与数据脱敏 - 脱敏管道（Apache Ranger 脱敏等价）
// 算法：mask（保留首尾，中间*）/ hash（sha256 前8位）/ replace（占位符）/ range（金额归区间）
// 字段识别：身份证/银行卡/手机号/姓名/金额/账户号/统一社会信用代码
// sanitizeForAI(payload, policies)：递归遍历，按策略匹配字段名/值模式脱敏，返回副本（不改原对象）
// 脱敏事件通过 recordAudit 记录（含原字段指纹=hash前缀、算法、操作人）
import { createHash } from "node:crypto";
import { recordAudit } from "../platform/audit.js";
import { logger } from "../../utils/logger.js";

export type SanitizerAlgorithm = "mask" | "hash" | "replace" | "range";

/** 脱敏策略（供 sanitizeForAI 使用，字段名驼峰） */
export interface SanitizationRule {
  name: string;
  fieldPattern: string; // 正则源字符串
  algorithm: SanitizerAlgorithm;
  replaceValue?: string | null;
  roleScope?: string; // "*" 或逗号分隔角色；空视为 "*"
}

/** 脱敏调用选项 */
export interface SanitizeOptions {
  operator?: string | null; // 操作人 userId（用于审计）
  role?: string | null; // 调用者角色（用于策略范围过滤）
}

// ===================== 字段值识别正则 =====================
const ID_CARD_RE = /^[1-9]\d{16}[\dXx]$/; // 身份证 18 位
const BANK_CARD_RE = /^\d{12,19}$/; // 银行卡数字串
const PHONE_RE = /^1\d{10}$/; // 手机号 11 位 1 开头
const USCC_RE = /^[0-9A-HJ-NPQRTUWXY]{18}$/; // 统一社会信用代码 18 位
const ACCOUNT_NO_RE = /^6228\d+$/; // 账户号 6228 开头
const CN_NAME_RE = /^[\u4e00-\u9fa5]{2,4}$/; // 中文姓名

// ===================== 脱敏算法 =====================

/** 掩码：保留首尾，中间替换为 *，按值类型选择保留策略 */
export function maskValue(value: string): string {
  if (!value) return value;
  if (ID_CARD_RE.test(value) || BANK_CARD_RE.test(value) || ACCOUNT_NO_RE.test(value)) {
    if (value.length <= 8) return "*".repeat(value.length);
    return value.slice(0, 4) + "*".repeat(Math.min(value.length - 8, 8)) + value.slice(-4);
  }
  if (PHONE_RE.test(value)) {
    return value.slice(0, 3) + "****" + value.slice(-4);
  }
  if (CN_NAME_RE.test(value)) {
    return value[0]! + "*".repeat(value.length - 1);
  }
  // 通用：保留首尾
  if (value.length <= 2) return "*".repeat(value.length);
  return value[0]! + "*".repeat(Math.min(value.length - 2, 6)) + value.slice(-1);
}

/** 哈希：sha256 前 8 位 */
export function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 8);
}

/** 替换：替换为占位符 */
export function replaceWith(value: string, placeholder?: string | null): string {
  return placeholder ?? "[REDACTED]";
}

/** 区间化：金额归入区间 */
export function rangeBucket(value: string): string {
  const num = parseFloat(value.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(num)) return value;
  const wan = num / 10000; // 归一为万元
  if (wan < 1000) return "0-1000万";
  if (wan < 5000) return "1000-5000万";
  if (wan < 10000) return "5000万-1亿";
  if (wan < 50000) return "1-5亿";
  return "5亿以上";
}

/** 应用脱敏算法 */
function applyAlgorithm(
  value: string,
  algorithm: SanitizerAlgorithm,
  replaceVal?: string | null,
): string {
  switch (algorithm) {
    case "mask":
      return maskValue(value);
    case "hash":
      return hashValue(value);
    case "replace":
      return replaceWith(value, replaceVal);
    case "range":
      return rangeBucket(value);
    default:
      return value;
  }
}

// ===================== 策略匹配 =====================

interface CompiledPolicy extends SanitizationRule {
  regex: RegExp | null;
}

/** 安全编译正则（失败返回 null） */
function safeRegex(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, "i");
  } catch {
    logger.warn({ pattern }, "脱敏策略正则编译失败");
    return null;
  }
}

/** 按角色过滤策略 */
function filterByRole(policies: SanitizationRule[], role: string | null): SanitizationRule[] {
  return policies.filter((p) => {
    const scope = p.roleScope ?? "*";
    if (scope === "*" || scope === "") return true;
    if (!role) return false;
    return scope
      .split(",")
      .map((s) => s.trim())
      .includes(role);
  });
}

/** 匹配字段名命中的首个策略 */
function matchPolicy(fieldName: string, policies: CompiledPolicy[]): CompiledPolicy | undefined {
  for (const p of policies) {
    if (!p.regex) continue;
    if (p.regex.test(fieldName)) return p;
  }
  return undefined;
}

// ===================== 递归脱敏 =====================

interface SanitizeFingerprint {
  field: string;
  algorithm: string;
  fingerprint: string; // 原字段值 hash 前 8 位
}

function sanitizeNode(
  node: unknown,
  path: string,
  policies: CompiledPolicy[],
  fingerprints: SanitizeFingerprint[],
): unknown {
  if (node === null || node === undefined) return node;
  if (Array.isArray(node)) {
    return node.map((item, i) => sanitizeNode(item, path ? `${path}[${i}]` : `[${i}]`, policies, fingerprints));
  }
  if (typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      const fieldPath = path ? `${path}.${key}` : key;
      const matched = matchPolicy(key, policies);
      if (matched && (typeof value === "string" || typeof value === "number" || typeof value === "boolean")) {
        const original = String(value);
        const sanitized = applyAlgorithm(original, matched.algorithm, matched.replaceValue);
        fingerprints.push({
          field: fieldPath,
          algorithm: matched.algorithm,
          fingerprint: hashValue(original),
        });
        out[key] = sanitized;
      } else {
        out[key] = sanitizeNode(value, fieldPath, policies, fingerprints);
      }
    }
    return out;
  }
  return node;
}

/**
 * 脱敏管道：递归遍历 payload，按 policies 匹配字段名应用脱敏
 * 返回脱敏后的副本（不修改原对象）；脱敏事件写 audit_logs
 */
export function sanitizeForAI(
  payload: unknown,
  policies: SanitizationRule[],
  opts: SanitizeOptions = {},
): unknown {
  const activePolicies = filterByRole(policies, opts.role ?? null);
  const compiled: CompiledPolicy[] = activePolicies.map((p) => ({
    ...p,
    regex: safeRegex(p.fieldPattern),
  }));
  const fingerprints: SanitizeFingerprint[] = [];
  const sanitized = sanitizeNode(payload, "", compiled, fingerprints);

  // 脱敏事件落审计（含原字段指纹、算法、操作人）
  if (fingerprints.length > 0) {
    recordAudit({
      userId: opts.operator ?? null,
      action: "sanitize",
      target: "ai.sanitizer",
      ip: null,
      detail: {
        operator: opts.operator ?? null,
        role: opts.role ?? null,
        fields: fingerprints,
      },
    });
    logger.debug({ count: fingerprints.length }, "脱敏管道处理完成");
  }
  return sanitized;
}
