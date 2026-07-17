// 智慧监督中心 - 规则引擎：基于 json-rules-engine 推理命中
// 规则 DSL 存储于 rules.dsl_json（JSON 字符串），解析为 Engine 的 conditions/event
// 命中则：①插入 risk_warnings（pending）②eventBus.emit('risk.warning.created') ③返回命中结果
import { Engine } from "json-rules-engine";
import { queryOne, execute } from "../../db/index.js";
import { eventBus } from "../platform/eventbus.js";
import { incRiskEvaluation } from "../../health.js";
import { logger } from "../../utils/logger.js";

/** 规则数据库行 */
interface RuleRow {
  id: string;
  name: string;
  domain: string | null;
  dsl_json: string;
  priority: number;
  enabled: number;
  version: number;
}

/** json-rules-engine 的事件类型 */
interface RuleEvent {
  type: string;
  params?: Record<string, unknown>;
}

/** 规则 DSL 结构（与 json-rules-engine RuleProperties 对齐） */
interface RuleDsl {
  conditions: unknown;
  event: RuleEvent;
  name?: string;
  priority?: number;
}

/** facts 键值对 */
export type RuleFacts = Record<string, unknown>;

/** 命中明细项 */
interface RawItem {
  label: string;
  value: string;
}

/** 评估结果 */
export interface EvaluateResult {
  hit: boolean;
  ruleId: string;
  ruleName: string;
  level: string;
  domain: string;
  warning?: {
    id: string;
    title: string;
    triggeredAt: string;
  };
  events: RuleEvent[];
}

/** 格式化当前时间为 YYYY-MM-DD HH:mm */
function nowFormatted(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 生成风险预警 ID：RW + YYYYMMDDHHmm + 3 位随机 */
function generateWarningId(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}`;
  const rand = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");
  return `RW${stamp}${rand}`;
}

/** 将 facts 转为 raw 明细数组 */
function factsToRaw(facts: RuleFacts): RawItem[] {
  return Object.entries(facts)
    .filter(([, v]) => v !== undefined && v !== null)
    .slice(0, 8)
    .map(([k, v]) => ({ label: k, value: typeof v === "object" ? JSON.stringify(v) : String(v) }));
}

/**
 * 规则推理：按 ruleId 加载 DSL，对 facts 推理
 * 命中则生成 risk_warnings（pending）并推送事件
 */
export async function evaluateRule(
  ruleId: string,
  facts: RuleFacts,
): Promise<EvaluateResult> {
  incRiskEvaluation();
  const rule = queryOne<RuleRow>("SELECT id, name, domain, dsl_json, priority, enabled, version FROM rules WHERE id = ?", [ruleId]);
  if (!rule) {
    return { hit: false, ruleId, ruleName: "", level: "", domain: "", events: [] };
  }

  let dsl: RuleDsl;
  try {
    dsl = JSON.parse(rule.dsl_json) as RuleDsl;
  } catch (err) {
    logger.warn({ err: (err as Error).message, ruleId }, "规则 DSL 解析失败");
    return { hit: false, ruleId, ruleName: rule.name, level: "", domain: rule.domain ?? "", events: [] };
  }

  // 构建 json-rules-engine 实例：允许未定义 fact/condition，避免缺字段抛错
  const engine = new Engine(
    [{ conditions: dsl.conditions as never, event: dsl.event, name: rule.name, priority: rule.priority }],
    { allowUndefinedFacts: true, allowUndefinedConditions: true },
  );

  const results = await engine.run(facts);
  const events = results.events as RuleEvent[];
  const hit = events.length > 0;
  const level = (events[0]?.params?.level as string) || "medium";
  const domain = (events[0]?.params?.domain as string) || rule.domain || "";

  const base: EvaluateResult = {
    hit,
    ruleId,
    ruleName: rule.name,
    level,
    domain,
    events,
  };

  if (!hit) return base;

  // 命中：插入 risk_warnings（pending）
  const warningId = generateWarningId();
  const triggeredAt = nowFormatted();
  const subject =
    (facts.subject as string) ||
    (facts.orgName as string) ||
    (facts.subjectName as string) ||
    rule.domain ||
    "";
  const title = (events[0]?.params?.title as string) || rule.name;
  const clue = `规则【${rule.name}】命中，触发事实：${Object.entries(facts)
    .slice(0, 4)
    .map(([k, v]) => `${k}=${v}`)
    .join("；")}`;
  const rawJson = JSON.stringify(factsToRaw(facts));

  execute(
    `INSERT INTO risk_warnings (id, title, domain, level, subject, rule, triggered_at, status, clue, related_order_id, raw_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, NULL, ?)`,
    [warningId, title, domain, level, subject, rule.name, triggeredAt, clue, rawJson],
  );

  const warning = { id: warningId, title, triggeredAt };
  // 推送事件至调度指挥中心（Task 6 消费自动派单）
  eventBus.emit("risk.warning.created", {
    warning: { id: warningId, title, domain, level, subject, rule: rule.name, triggeredAt, status: "pending" },
    ruleId,
  });
  logger.info({ warningId, ruleId, level, domain }, "规则命中，生成风险预警");

  return { ...base, warning };
}
