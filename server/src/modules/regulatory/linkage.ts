// 监管联查规则（V2 Task 18）：四级穿透链路编排
// 预置 linkage_rules 表的读取 + 按 drill_path 逐级调 penetration 下钻方法
import type { FastifyRequest } from "fastify";
import { queryAll, queryOne } from "../../db/index.js";
import { camelize } from "../../utils/case.js";
import { drillADS, drillDWS, drillDWD, drillODS } from "../monitoring/penetration.js";

/** 联查规则 */
export interface LinkageRule {
  id: string;
  sceneId: string;
  sourceSystem: string | null;
  entryPoint: string | null;
  drillPath: string[]; // parsed from JSON
  targetLayer: string | null;
}

/** 列出联查规则（可按 sceneId 过滤） */
export function listRules(sceneId?: string): LinkageRule[] {
  const rows = sceneId
    ? queryAll<{ id: string; scene_id: string; source_system: string | null; entry_point: string | null; drill_path: string | null; target_layer: string | null }>(
        "SELECT id, scene_id, source_system, entry_point, drill_path, target_layer FROM linkage_rules WHERE scene_id = ? ORDER BY id",
        [sceneId],
      )
    : queryAll<{ id: string; scene_id: string; source_system: string | null; entry_point: string | null; drill_path: string | null; target_layer: string | null }>(
        "SELECT id, scene_id, source_system, entry_point, drill_path, target_layer FROM linkage_rules ORDER BY id",
      );
  return rows.map((r) => {
    const camel = camelize(r) as Record<string, unknown>;
    let drillPath: string[] = [];
    if (r.drill_path) {
      try { drillPath = JSON.parse(r.drill_path); } catch { drillPath = []; }
    }
    return {
      id: r.id,
      sceneId: r.scene_id,
      sourceSystem: r.source_system,
      entryPoint: r.entry_point,
      drillPath,
      targetLayer: r.target_layer,
    };
  });
}

/** 取单条规则 */
export function getRule(id: string): LinkageRule | null {
  const row = queryOne<{ id: string; scene_id: string; source_system: string | null; entry_point: string | null; drill_path: string | null; target_layer: string | null }>(
    "SELECT id, scene_id, source_system, entry_point, drill_path, target_layer FROM linkage_rules WHERE id = ?",
    [id],
  );
  if (!row) return null;
  let drillPath: string[] = [];
  if (row.drill_path) {
    try { drillPath = JSON.parse(row.drill_path); } catch { drillPath = []; }
  }
  return {
    id: row.id,
    sceneId: row.scene_id,
    sourceSystem: row.source_system,
    entryPoint: row.entry_point,
    drillPath,
    targetLayer: row.target_layer,
  };
}

/**
 * 执行联查规则：从入口实体（ADS indicatorId）按 drill_path 逐级调 drill 方法，
 * 返回完整穿透链 { rule, entry, chain: [{layer, data}] }
 * drill_path 形如 ["ads","dws","dwd","ods"]
 */
export function executeRule(id: string, entryEntity: string): {
  rule: LinkageRule | null;
  entry: string;
  chain: Array<{ layer: string; data: unknown }>;
} | null {
  const rule = getRule(id);
  if (!rule) return null;
  const chain: Array<{ layer: string; data: unknown }> = [];
  // entryEntity 是 ADS indicatorId（首层入口）
  let currentId: string | number = entryEntity;
  for (const layer of rule.drillPath) {
    if (layer === "ads") {
      const data = drillADS(String(currentId));
      chain.push({ layer: "ads", data });
      // 下一层 DWS 用第一个 blockId
      const firstBlock = data.dwsBlocks[0];
      if (!firstBlock) break;
      currentId = firstBlock.blockId;
    } else if (layer === "dws") {
      const data = drillDWS(String(currentId));
      chain.push({ layer: "dws", data });
      const firstDetail = data.dwdDetails[0];
      if (!firstDetail) break;
      currentId = firstDetail.detailId;
    } else if (layer === "dwd") {
      const data = drillDWD(Number(currentId));
      if (!data) break;
      chain.push({ layer: "dwd", data });
      const firstDoc = data.odsDocs[0];
      if (!firstDoc) break;
      currentId = firstDoc.docId;
    } else if (layer === "ods") {
      const data = drillODS(Number(currentId));
      if (!data) break;
      chain.push({ layer: "ods", data });
    }
  }
  return { rule, entry: entryEntity, chain };
}
