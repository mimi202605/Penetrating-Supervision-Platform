// 3 类监管专用 Transform：entity-resolve / relationship-extract / evidence-snapshot
import type { TransformHandler } from "./types.js";
import { TransformStepError } from "./types.js";
import { addNodeSync, addEdgeSync } from "../../monitoring/graph.js";
import { Parser as ExprParser } from "expr-eval";

// ===================== entity-resolve =====================
// 实体消歧：按 org_code+name 归一为统一实体 ID
// config: { orgCodeField, nameField, outputField: 'entityId', mode?: 'strict'|'fuzzy' }
// state: { cache: Map<string, string>, counter: number }
export const entityResolveHandler: TransformHandler = {
  type: "entity-resolve",
  init() {
    return { cache: new Map<string, string>(), counter: 0 };
  },
  apply(record, state, config) {
    const orgField = String(config.orgCodeField || "orgCode");
    const nameField = String(config.nameField || "name");
    const outField = String(config.outputField || "entityId");
    const mode = (config.mode as "strict" | "fuzzy") || "strict";
    const cache = state.cache as Map<string, string>;
    const orgCode = String(record[orgField] ?? "").trim();
    const name = String(record[nameField] ?? "").trim();
    if (!orgCode || !name) {
      // 字段缺失：透传，但不写 entityId
      return record;
    }
    // 生成归一 key：strict = orgCode+name；fuzzy = orgCode+name 首字
    const key = mode === "fuzzy"
      ? `${orgCode}|${name.replace(/\s+/g, "").toLowerCase()}`
      : `${orgCode}|${name}`;
    let entityId = cache.get(key);
    if (!entityId) {
      state.counter = (state.counter as number) + 1;
      entityId = `ENT-${String(state.counter).padStart(6, "0")}`;
      cache.set(key, entityId);
    }
    return { ...record, [outField]: entityId };
  },
};

// ===================== relationship-extract =====================
// 关系抽取：从记录中抽取节点+边写入图谱
// config: {
//   nodes: [{ idField, labelField, type: 'account|counterparty|org|person' }],
//   edges: [{ fromField, toField, label?, weightField? }],
//   passThrough: true  // 默认透传原 record
// }
export const relationshipExtractHandler: TransformHandler = {
  type: "relationship-extract",
  apply(record, _state, config, _ctx) {
    const nodes = (config.nodes || []) as Array<{
      idField: string; labelField: string; type: "account" | "counterparty" | "org" | "person";
    }>;
    const edges = (config.edges || []) as Array<{
      fromField: string; toField: string; label?: string; weightField?: string;
    }>;
    try {
      for (const n of nodes) {
        const id = record[n.idField];
        if (!id) continue;
        addNodeSync({
          id: String(id),
          label: String(record[n.labelField] ?? id),
          type: n.type,
        });
      }
      for (const e of edges) {
        const src = record[e.fromField];
        const tgt = record[e.toField];
        if (!src || !tgt) continue;
        const weight = e.weightField ? Number(record[e.weightField]) || 1 : 1;
        addEdgeSync({
          source: String(src),
          target: String(tgt),
          label: e.label,
          weight,
        });
      }
    } catch (err) {
      throw new TransformStepError(
        "relationship-extract",
        `关系抽取失败: ${(err as Error).message}`,
        record,
      );
    }
    // 默认透传
    return record;
  },
};

// ===================== evidence-snapshot =====================
// 命中规则时冻结 record 快照到 ctx.evidence 数组
// config: { ruleId?: string, condition?: 'expr' (expr-eval 表达式), alwaysSnapshot?: boolean }
// 命中（或 alwaysSnapshot=true）→ 把当前 record 深拷贝写入 ctx.evidence，原 record 透传
export const evidenceSnapshotHandler: TransformHandler = {
  type: "evidence-snapshot",
  init(config) {
    const condExpr = config.condition ? String(config.condition) : "";
    let compiled: { evaluate: (r: Record<string, unknown>) => unknown } | undefined;
    if (condExpr) {
      const expr = new ExprParser().parse(condExpr);
      compiled = { evaluate: (r) => expr.evaluate(r as never) as unknown };
    }
    return { compiled };
  },
  apply(record, state, config, ctx) {
    const ruleId = config.ruleId as string | undefined;
    const always = config.alwaysSnapshot === true;
    const compiled = state.compiled as
      | { evaluate: (r: Record<string, unknown>) => unknown }
      | undefined;
    let hit = always;
    if (!hit && compiled) {
      try {
        hit = !!compiled.evaluate(record);
      } catch (err) {
        throw new TransformStepError(
          "evidence-snapshot",
          `条件求值失败: ${(err as Error).message}`,
          record,
        );
      }
    }
    if (hit) {
      // 写入 ctx.evidence（深拷贝避免后续 transform 污染证据）
      if (!ctx.evidence) ctx.evidence = [];
      ctx.evidence.push({
        ruleId,
        snapshot: JSON.parse(JSON.stringify(record)) as Record<string, unknown>,
        ts: new Date().toISOString(),
      });
    }
    return record;
  },
};

export const regulatoryHandlers: TransformHandler[] = [
  entityResolveHandler,
  relationshipExtractHandler,
  evidenceSnapshotHandler,
];
