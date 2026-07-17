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

/** 生成风险预警 ID：RW + YYYYMMDDHHmmss + 6 位随机
 *  原实现 RW+YYYYMMDDHHmm+3 位随机，每分钟仅 1000 个 ID，并发评估 ~37 条即 50% PK 冲突，
 *  INSERT 抛错会让该预警静默丢失（rule-engine 无 try/catch）。扩到秒粒度+6 位随机大幅降低冲突。 */
function generateWarningId(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const rand = Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");
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
  // 已禁用的规则不得继续推理/生成预警/触发自动派单，否则管理员"停用"操作无效。
  // (rules.ts PUT 仅改 enabled=0，evaluateRule 必须在此处显式拦截)
  if (!rule.enabled) {
    return { hit: false, ruleId, ruleName: rule.name, level: "", domain: rule.domain ?? "", events: [] };
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

/**
 * V2 监管模型评估桥接（Task 16）
 * - 从 collection_task_runs 拉取本次 runId 的 ODS 记录作为 facts
 * - 调 regulatory/models.ts evaluateModelForRun 编译 rule_dsl 推理
 * - 命中后由 evaluateModelForRun 内部 emit 'monitoring.rule.hit'，触发风险线索入库链路
 *
 * 与 evaluateRule 的差异：
 *   evaluateRule 针对 DWS rules 表（V1 监控规则），命中写 risk_warnings
 *   evaluateRegulatoryModel 针对 regulatory_models 表（V2 监管模型），命中写 risk_clues（经事件链）
 *
 * 保留现有 evaluateRule 不变，新方法独立导出（SubTask 16.3）。
 */
export async function evaluateRegulatoryModel(
  modelId: string,
  runId: string,
): Promise<{ modelId: string; runId: string; hitCount: number }> {
  // 动态导入避免循环依赖：regulatory/models.ts 通过 eventbus 间接引用本模块
  const { evaluateModelForRun } = await import("../regulatory/models.js");
  const result = await evaluateModelForRun(modelId, runId);
  logger.info(
    { modelId, runId, hitCount: result.hitCount, totalFacts: result.hits.length },
    "监管模型评估完成（由 collection.task.done 触发）",
  );
  return { modelId, runId, hitCount: result.hitCount };
}

/**
 * 注册监管模型评估桥接监听器（SubTask 16.2）
 * - 订阅 collection.task.done → 若 task 绑定 modelId，自动调 evaluateRegulatoryModel
 * 供 main.ts 启动时调用
 */
export function registerRegulatoryModelListener(): void {
  eventBus.on("collection.task.done", async (payload: unknown) => {
    try {
      const p = (payload as { taskId?: string; runId?: string; modelId?: string; sceneId?: string } | undefined) ?? {};
      if (!p.modelId) {
        logger.debug({ taskId: p.taskId, runId: p.runId }, "[regulatory-bridge] 任务未绑定 modelId，跳过模型评估");
        return;
      }
      if (!p.runId) {
        logger.warn({ taskId: p.taskId }, "[regulatory-bridge] collection.task.done 缺少 runId，跳过");
        return;
      }
      await evaluateRegulatoryModel(p.modelId, p.runId);
    } catch (err) {
      logger.error(
        { err: (err as Error).message, payload },
        "[regulatory-bridge] collection.task.done 处理失败",
      );
    }
  });
  logger.info("监管模型评估桥接监听器已注册（collection.task.done → evaluateRegulatoryModel）");
}
