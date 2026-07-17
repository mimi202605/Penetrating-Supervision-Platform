// 监管场景模块：CRUD + 按域查询 + 场景含模型/指标联查
import { execute, queryAll, queryOne, transaction } from "../../db/index.js";
import { camelize } from "../../utils/case.js";
import { logger } from "../../utils/logger.js";

/** 监管场景请求体 */
export interface SceneBody {
  id?: string;
  domain: string;          // investment/property/finance/accounting/salary/finance-risk/...
  issueCode?: string;
  name: string;
  description?: string;
  dataSources?: unknown;   // JSON 数组
  indicators?: unknown;    // JSON
  threshold?: unknown;     // JSON
  freq?: string;           // realtime/hourly/daily/monthly
  modelId?: string;
  enabled?: number;
}

/** row → API 驼峰化 + JSON 字段解析 */
function sceneRowToApi(row: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!row) return {};
  const camel = camelize(row) as Record<string, unknown>;
  for (const k of ["dataSources", "indicators", "threshold"]) {
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

/** 列出全部监管场景（可按 domain 过滤） */
export function listScenes(domain?: string): Array<Record<string, unknown>> {
  const rows = domain
    ? queryAll<Record<string, unknown>>(
        "SELECT * FROM regulatory_scenes WHERE domain = ? ORDER BY id",
        [domain],
      )
    : queryAll<Record<string, unknown>>(
        "SELECT * FROM regulatory_scenes ORDER BY id",
      );
  return rows.map((r) => sceneRowToApi(r));
}

/** 取单个场景 */
export function getScene(id: string): Record<string, unknown> | null {
  const row = queryOne<Record<string, unknown>>(
    "SELECT * FROM regulatory_scenes WHERE id = ?",
    [id],
  );
  return row ? sceneRowToApi(row) : null;
}

/** 创建场景 */
export function createScene(body: SceneBody): Record<string, unknown> {
  const id = body.id || `scene-${Date.now()}`;
  transaction(() => {
    execute(
      `INSERT INTO regulatory_scenes
        (id, domain, issue_code, name, description, data_sources, indicators, threshold, freq, model_id, enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        body.domain,
        body.issueCode || null,
        body.name,
        body.description || null,
        body.dataSources ? JSON.stringify(body.dataSources) : null,
        body.indicators ? JSON.stringify(body.indicators) : null,
        body.threshold ? JSON.stringify(body.threshold) : null,
        body.freq || "daily",
        body.modelId || null,
        body.enabled ?? 1,
      ],
    );
  });
  return getScene(id) as Record<string, unknown>;
}

/** 更新场景 */
export function updateScene(id: string, body: Partial<SceneBody>): Record<string, unknown> | null {
  const existing = getScene(id);
  if (!existing) return null;
  const merged = { ...existing, ...body } as SceneBody;
  transaction(() => {
    execute(
      `UPDATE regulatory_scenes SET
        domain = ?, issue_code = ?, name = ?, description = ?,
        data_sources = ?, indicators = ?, threshold = ?, freq = ?,
        model_id = ?, enabled = ?
       WHERE id = ?`,
      [
        merged.domain,
        merged.issueCode || null,
        merged.name,
        merged.description || null,
        merged.dataSources ? JSON.stringify(merged.dataSources) : null,
        merged.indicators ? JSON.stringify(merged.indicators) : null,
        merged.threshold ? JSON.stringify(merged.threshold) : null,
        merged.freq || "daily",
        merged.modelId || null,
        merged.enabled ?? 1,
        id,
      ],
    );
  });
  return getScene(id);
}

/** 删除场景 */
export function deleteScene(id: string): boolean {
  const r = execute("DELETE FROM regulatory_scenes WHERE id = ?", [id]);
  return r.changes > 0;
}

/** 取场景 + 关联模型 + 指标（联查） */
export function getSceneWithModel(id: string): Record<string, unknown> | null {
  const scene = getScene(id);
  if (!scene) return null;
  const models = queryAll<Record<string, unknown>>(
    "SELECT * FROM regulatory_models WHERE scene_id = ? ORDER BY id",
    [id],
  );
  const modelIds = models.map((m) => (m as { id: string }).id);
  let indicators: Array<Record<string, unknown>> = [];
  if (modelIds.length > 0) {
    const placeholders = modelIds.map(() => "?").join(",");
    indicators = queryAll<Record<string, unknown>>(
      `SELECT * FROM model_indicators WHERE model_id IN (${placeholders}) ORDER BY model_id, id`,
      modelIds,
    );
  }
  logger.debug({ sceneId: id, modelCount: models.length, indicatorCount: indicators.length }, "查询场景含模型+指标");
  return {
    ...scene,
    models: models.map((m) => camelize(m)),
    indicators: indicators.map((i) => camelize(i)),
  };
}

void logger; // 预留日志使用
