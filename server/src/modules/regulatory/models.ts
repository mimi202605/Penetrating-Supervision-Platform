// 监管模型模块：CRUD + testModel（json-rules-engine 编译 rule_dsl 跑全量数据返回命中）
import { Engine } from "json-rules-engine";
import { execute, queryAll, queryOne, transaction } from "../../db/index.js";
import { camelize } from "../../utils/case.js";
import { eventBus } from "../platform/eventbus.js";
import { logger } from "../../utils/logger.js";
import { listIndicators, deleteIndicatorsByModel } from "./indicators.js";

/** 监管模型请求体 */
export interface ModelBody {
  id?: string;
  sceneId: string;
  domain: string;
  category?: string;          // rule/ml/agent
  name: string;
  description?: string;
  ruleType?: string;          // enterprise/manager/employee/professional-manager
  indicatorCount?: number;
  ruleDsl?: unknown;          // JSON: json-rules-engine RuleProperties
  thresholdJson?: unknown;    // JSON: { yellow, orange, red }
  scheduleCron?: string;
  status?: string;            // draft/testing/online/offline
  version?: string;
  ownerDept?: string;
  effectiveness?: string;
}

/** row → API 驼峰化 + JSON 字段解析 */
function modelRowToApi(row: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!row) return {};
  const camel = camelize(row) as Record<string, unknown>;
  for (const k of ["ruleDsl", "thresholdJson"]) {
    if (typeof camel[k] === "string" && camel[k]) {
      try {
        camel[k] = JSON.parse(camel[k] as string);
      } catch {
        // 保留原值
      }
    }
  }
  return camel;
}

/** 列出全部监管模型（可按 sceneId 过滤） */
export function listModels(sceneId?: string): Array<Record<string, unknown>> {
  const rows = sceneId
    ? queryAll<Record<string, unknown>>(
        "SELECT * FROM regulatory_models WHERE scene_id = ? ORDER BY id",
        [sceneId],
      )
    : queryAll<Record<string, unknown>>(
        "SELECT * FROM regulatory_models ORDER BY id",
      );
  return rows.map((r) => modelRowToApi(r));
}

/** 取单个模型（含指标列表） */
export function getModel(id: string): Record<string, unknown> | null {
  const row = queryOne<Record<string, unknown>>(
    "SELECT * FROM regulatory_models WHERE id = ?",
    [id],
  );
  if (!row) return null;
  const api = modelRowToApi(row);
  const indicators = listIndicators(id);
  return { ...api, indicators };
}

/** 创建模型 */
export function createModel(body: ModelBody): Record<string, unknown> {
  const id = body.id || `m-${Date.now()}`;
  transaction(() => {
    execute(
      `INSERT INTO regulatory_models
        (id, scene_id, domain, category, name, description, rule_type,
         indicator_count, rule_dsl, threshold_json, schedule_cron, status,
         version, owner_dept, effectiveness)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        body.sceneId,
        body.domain,
        body.category || "rule",
        body.name,
        body.description || null,
        body.ruleType || "enterprise",
        body.indicatorCount ?? 0,
        body.ruleDsl ? JSON.stringify(body.ruleDsl) : null,
        body.thresholdJson ? JSON.stringify(body.thresholdJson) : null,
        body.scheduleCron || "0 2 * * *",
        body.status || "draft",
        body.version || "1.0.0",
        body.ownerDept || null,
        body.effectiveness || null,
      ],
    );
  });
  return getModel(id) as Record<string, unknown>;
}

/** 更新模型 */
export function updateModel(id: string, body: Partial<ModelBody>): Record<string, unknown> | null {
  const existing = getModel(id);
  if (!existing) return null;
  const merged = { ...existing, ...body } as ModelBody;
  transaction(() => {
    execute(
      `UPDATE regulatory_models SET
        scene_id = ?, domain = ?, category = ?, name = ?, description = ?,
        rule_type = ?, indicator_count = ?, rule_dsl = ?, threshold_json = ?,
        schedule_cron = ?, status = ?, version = ?, owner_dept = ?, effectiveness = ?
       WHERE id = ?`,
      [
        merged.sceneId,
        merged.domain,
        merged.category || "rule",
        merged.name,
        merged.description || null,
        merged.ruleType || "enterprise",
        merged.indicatorCount ?? 0,
        merged.ruleDsl ? JSON.stringify(merged.ruleDsl) : null,
        merged.thresholdJson ? JSON.stringify(merged.thresholdJson) : null,
        merged.scheduleCron || "0 2 * * *",
        merged.status || "draft",
        merged.version || "1.0.0",
        merged.ownerDept || null,
        merged.effectiveness || null,
        id,
      ],
    );
  });
  return getModel(id);
}

/** 删除模型（连带指标） */
export function deleteModel(id: string): boolean {
  transaction(() => {
    deleteIndicatorsByModel(id);
    execute("DELETE FROM regulatory_models WHERE id = ?", [id]);
  });
  const r = queryOne<{ id: string }>("SELECT id FROM regulatory_models WHERE id = ?", [id]);
  return !r;
}

/** 试运行模型：编译 rule_dsl → 跑 facts 列表 → 返回命中明细 */
export interface ModelTestResult {
  modelId: string;
  hitCount: number;
  hits: Array<{
    facts: Record<string, unknown>;
    riskLevel: string;
    event: { type: string; params?: Record<string, unknown> };
  }>;
}

/**
 * 试运行监管模型：对每条 facts 跑 json-rules-engine，命中则收集
 * @param modelId 模型 id
 * @param factsList 待评估的事实集合数组（一条事实 = 一条业务记录的指标汇总）
 */
export async function testModel(
  modelId: string,
  factsList: Array<Record<string, unknown>>,
): Promise<ModelTestResult> {
  const model = getModel(modelId);
  if (!model) throw new Error(`模型不存在: ${modelId}`);
  const ruleDsl = model.ruleDsl as { conditions: unknown; event: { type: string; params?: Record<string, unknown> }; name?: string; priority?: number } | undefined;
  if (!ruleDsl || !ruleDsl.conditions) {
    throw new Error(`模型 ${modelId} rule_dsl 缺失或非法`);
  }
  // 构建 engine（每条 fact 独立 run，避免串扰）
  const hits: ModelTestResult["hits"] = [];
  for (const facts of factsList) {
    const engine = new Engine(
      [{ conditions: ruleDsl.conditions as never, event: ruleDsl.event, name: ruleDsl.name || (model.name as string), priority: ruleDsl.priority }],
      { allowUndefinedFacts: true, allowUndefinedConditions: true },
    );
    const results = await engine.run(facts);
    if (results.events.length > 0) {
      const ev = results.events[0] as { type: string; params?: Record<string, unknown> };
      hits.push({
        facts,
        riskLevel: (ev.params?.level as string) || (ev.params?.riskLevel as string) || "yellow",
        event: ev,
      });
    }
  }
  logger.info({ modelId, hitCount: hits.length, totalFacts: factsList.length }, "监管模型试运行完成");
  return { modelId, hitCount: hits.length, hits };
}

/**
 * 评估模型并发布命中事件（供 collection.task.done 监听器调用）
 * - 从 collection_task_runs 拉取本次 runId 的 ODS 记录
 * - 转 facts → 跑模型 → emit monitoring.rule.hit 事件
 * @returns 命中数
 */
export async function evaluateModelForRun(modelId: string, runId: string): Promise<ModelTestResult> {
  const rows = queryAll<{ record_json: string }>(
    "SELECT record_json FROM ods_generic WHERE run_id = ?",
    [runId],
  );
  const factsList = rows.map((r) => {
    try {
      return JSON.parse(r.record_json) as Record<string, unknown>;
    } catch {
      return {} as Record<string, unknown>;
    }
  });
  const result = await testModel(modelId, factsList);
  // 每条命中 emit monitoring.rule.hit 事件
  for (const hit of result.hits) {
    eventBus.emit("monitoring.rule.hit", {
      modelId,
      runId,
      riskLevel: hit.riskLevel,
      evidence: hit.facts,
      event: hit.event,
    });
  }
  return result;
}

void logger; // 预留日志
