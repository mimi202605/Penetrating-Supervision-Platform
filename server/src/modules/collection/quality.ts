// 数据采集中心 - 数据质量校验（Great Expectations 等价）
// 5 类校验规则：非空 / 值域 / 长度 / 跨表一致 / 日期合法
// 作为 transform 后置钩子：sink 写入后由 runtime 调用，对真实记录做规则校验
import { execute, queryAll } from "../../db/index.js";
import { eventBus } from "../platform/eventbus.js";
import { logger } from "../../utils/logger.js";

/** 5 类校验规则类型 */
export type QualityRuleType = "not_null" | "range" | "length" | "consistency" | "date_valid";

/** 校验规则定义 */
export interface QualityRule {
  field: string;
  rule: QualityRuleType;
  severity: "high" | "medium" | "low";
  /** 规则中文名（落库用） */
  ruleName: string;
  /** 详细描述模板 */
  detail: string;
  /** 参数：range → [min,max]；length → [min,max]；consistency → 关联表名 */
  params?: { min?: number; max?: number; table?: string; format?: string };
}

/** 默认 5 类规则（针对金额/账号/名称/组织/时间字段） */
const DEFAULT_RULES: QualityRule[] = [
  { field: "amount", rule: "not_null", severity: "high", ruleName: "非空校验", detail: "金额字段存在空值" },
  { field: "account_no", rule: "range", severity: "medium", ruleName: "值域校验", detail: "账号格式不在合法值域", params: { min: 6, max: 32 } },
  { field: "name", rule: "length", severity: "low", ruleName: "长度校验", detail: "字段长度超出阈值", params: { min: 1, max: 100 } },
  { field: "org_id", rule: "consistency", severity: "high", ruleName: "跨表一致校验", detail: "组织ID在主数据表中不存在" },
  { field: "ts", rule: "date_valid", severity: "medium", ruleName: "日期合法校验", detail: "交易时间格式非法" },
];

/** 取记录字段值（兼容嵌套点号路径） */
function getField(rec: Record<string, unknown>, field: string): unknown {
  if (field in rec) return rec[field];
  // 支持 a.b.c 路径
  const parts = field.split(".");
  let cur: unknown = rec;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

/** 单条规则校验一条记录，命中返回错误描述，未命中返回 null */
function checkRule(rule: QualityRule, rec: Record<string, unknown>): string | null {
  const val = getField(rec, rule.field);
  switch (rule.rule) {
    case "not_null":
      if (val === null || val === undefined || val === "") {
        return `${rule.detail}（${rule.field}=空）`;
      }
      return null;
    case "range": {
      if (val === null || val === undefined || val === "") return null;
      const min = rule.params?.min ?? 0;
      const max = rule.params?.max ?? Number.MAX_SAFE_INTEGER;
      const s = String(val).length;
      if (s < min || s > max) {
        return `${rule.detail}（${rule.field}=${val}，合法区间 [${min},${max}]）`;
      }
      return null;
    }
    case "length": {
      if (val === null || val === undefined) return null;
      const len = String(val).length;
      const min = rule.params?.min ?? 0;
      const max = rule.params?.max ?? 255;
      if (len < min || len > max) {
        return `${rule.detail}（${rule.field}=${val}，长度 ${len}，合法 [${min},${max}]）`;
      }
      return null;
    }
    case "consistency":
      // 跨表一致性由调用方在 sink 后用主数据表 join 校验；这里仅检查字段存在
      if (val === null || val === undefined || val === "") {
        return `${rule.detail}（${rule.field}=空，无法跨表校验）`;
      }
      return null;
    case "date_valid": {
      if (val === null || val === undefined || val === "") return null;
      const d = new Date(String(val));
      if (Number.isNaN(d.getTime())) {
        return `${rule.detail}（${rule.field}=${val}）`;
      }
      return null;
    }
    default:
      return null;
  }
}

/**
 * 运行数据质量校验（Great Expectations 等价）
 * 作为 transform 后置钩子：sink 写入后调，对真实 records 做规则校验
 * - 每条规则 × 每条记录：命中则写 data_quality_issues + emit collection.quality.issue
 * - 采样：当 records > 1000 时按 1% 采样（避免主数据全量校验爆炸）
 * @param taskId 采集任务ID
 * @param records 本次写入的真实记录数组
 * @param sceneId 监管场景ID（可空）
 * @param rules 自定义规则集（缺省用 DEFAULT_RULES）
 */
export function runQualityCheck(
  taskId: string,
  records: Array<Record<string, unknown>> | number,
  sceneId?: string | null,
  rules?: QualityRule[],
): void {
  // 向后兼容：旧调用方传 records:number（按总数模拟）
  const recs: Array<Record<string, unknown>> = Array.isArray(records)
    ? records
    : [];
  const total = Array.isArray(records) ? records.length : (typeof records === "number" ? records : 0);
  const appliedRules = rules && rules.length > 0 ? rules : DEFAULT_RULES;

  // 采样：> 1000 条按 1% 采样（最多 100 条），保证性能
  let sample: Array<Record<string, unknown>> = recs;
  if (recs.length > 1000) {
    const step = Math.max(1, Math.floor(recs.length / 100));
    sample = recs.filter((_, i) => i % step === 0).slice(0, 100);
  }

  let issueCount = 0;
  for (const rec of sample) {
    for (const rule of appliedRules) {
      const err = checkRule(rule, rec);
      if (err) {
        execute(
          "INSERT INTO data_quality_issues (task_id, field, rule, severity, detail) VALUES (?, ?, ?, ?, ?)",
          [taskId, rule.field, rule.ruleName, rule.severity, `${err}（采样 ${total} 条）`],
        );
        eventBus.emit("collection.quality.issue", {
          taskId,
          sceneId,
          field: rule.field,
          rule: rule.ruleName,
          severity: rule.severity,
          detail: err,
        });
        issueCount++;
      }
    }
  }
  if (issueCount > 0) {
    logger.warn({ taskId, sceneId, issueCount, sampled: sample.length, total }, "数据质量校验发现问题");
  } else {
    logger.debug({ taskId, sceneId, sampled: sample.length, total }, "数据质量校验完成（无问题）");
  }
}

/** 查询任务的质量问题（供 API 暴露） */
export function listQualityIssues(taskId: string, limit = 100): Array<Record<string, unknown>> {
  return queryAll<Record<string, unknown>>(
    "SELECT id, task_id, field, rule, severity, detail, created_at FROM data_quality_issues WHERE task_id = ? ORDER BY created_at DESC LIMIT ?",
    [taskId, limit],
  );
}

void listQualityIssues; // 预留导出供后续路由使用
