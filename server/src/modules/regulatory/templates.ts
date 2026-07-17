// 采集任务模板模块：CRUD + instantiate（从模板创建 collection_task）
import { execute, queryAll, queryOne, transaction } from "../../db/index.js";
import { camelize } from "../../utils/case.js";
import { logger } from "../../utils/logger.js";

/** 模板请求体 */
export interface TemplateBody {
  id?: string;
  sceneId: string;
  name: string;
  connectorType: string;
  stream?: string;
  scheduleCron?: string;
  transformPipeline?: unknown;   // JSON
  fieldMapping?: unknown;        // JSON
}

/** row → API 驼峰化 + JSON 字段解析 */
function templateRowToApi(row: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!row) return {};
  const camel = camelize(row) as Record<string, unknown>;
  for (const k of ["transformPipeline", "fieldMapping"]) {
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

/** 列出全部模板（可按 sceneId 过滤） */
export function listTemplates(sceneId?: string): Array<Record<string, unknown>> {
  const rows = sceneId
    ? queryAll<Record<string, unknown>>(
        "SELECT * FROM collection_task_templates WHERE scene_id = ? ORDER BY id",
        [sceneId],
      )
    : queryAll<Record<string, unknown>>(
        "SELECT * FROM collection_task_templates ORDER BY id",
      );
  return rows.map((r) => templateRowToApi(r));
}

/** 取单个模板 */
export function getTemplate(id: string): Record<string, unknown> | null {
  const row = queryOne<Record<string, unknown>>(
    "SELECT * FROM collection_task_templates WHERE id = ?",
    [id],
  );
  return row ? templateRowToApi(row) : null;
}

/** 创建模板 */
export function createTemplate(body: TemplateBody): Record<string, unknown> {
  const id = body.id || `tpl-${Date.now()}`;
  transaction(() => {
    execute(
      `INSERT INTO collection_task_templates
        (id, scene_id, name, connector_type, stream, schedule_cron, transform_pipeline, field_mapping)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        body.sceneId,
        body.name,
        body.connectorType,
        body.stream || null,
        body.scheduleCron || "0 2 * * *",
        body.transformPipeline ? JSON.stringify(body.transformPipeline) : null,
        body.fieldMapping ? JSON.stringify(body.fieldMapping) : null,
      ],
    );
  });
  return getTemplate(id) as Record<string, unknown>;
}

/** 更新模板 */
export function updateTemplate(id: string, body: Partial<TemplateBody>): Record<string, unknown> | null {
  const existing = getTemplate(id);
  if (!existing) return null;
  const merged = { ...existing, ...body } as TemplateBody;
  transaction(() => {
    execute(
      `UPDATE collection_task_templates SET
        scene_id = ?, name = ?, connector_type = ?, stream = ?, schedule_cron = ?,
        transform_pipeline = ?, field_mapping = ?
       WHERE id = ?`,
      [
        merged.sceneId,
        merged.name,
        merged.connectorType,
        merged.stream || null,
        merged.scheduleCron || "0 2 * * *",
        merged.transformPipeline ? JSON.stringify(merged.transformPipeline) : null,
        merged.fieldMapping ? JSON.stringify(merged.fieldMapping) : null,
        id,
      ],
    );
  });
  return getTemplate(id);
}

/** 删除模板 */
export function deleteTemplate(id: string): boolean {
  const r = execute("DELETE FROM collection_task_templates WHERE id = ?", [id]);
  return r.changes > 0;
}

/**
 * 从模板实例化采集任务
 * - 复制模板字段到 collection_tasks（生成新 id）
 * - 关联场景对应的 model_id
 * @returns 新建任务的 id
 */
export function instantiateTemplate(templateId: string, overrides: { name?: string; sourceId?: string; enabled?: number } = {}): { taskId: string; template: Record<string, unknown> } {
  const tpl = getTemplate(templateId);
  if (!tpl) throw new Error(`模板不存在: ${templateId}`);
  const tplRow = tpl as {
    sceneId: string;
    name: string;
    connectorType: string;
    stream?: string;
    scheduleCron: string;
    transformPipeline?: unknown;
    fieldMapping?: unknown;
  };
  // 查场景关联的 model_id
  const scene = queryOne<{ model_id: string | null }>(
    "SELECT model_id FROM regulatory_scenes WHERE id = ?",
    [tplRow.sceneId],
  );
  const taskId = `T-${Date.now()}`;
  transaction(() => {
    execute(
      `INSERT INTO collection_tasks
        (id, name, source, mode, schedule, last_status, throughput, last_run,
         source_id, sink_type, sink_target, write_mode, transform_pipeline,
         concurrency, retry_max, retry_interval_sec, timeout_sec, priority,
         depends_on, enabled, scene_id, model_id, field_mapping)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        taskId,
        overrides.name || tplRow.name,
        tplRow.connectorType,
        "增量",
        tplRow.scheduleCron,
        "成功",
        "—",
        new Date().toISOString().slice(0, 16).replace("T", " "),
        overrides.sourceId || null,
        "ods-generic",
        `ods_${tplRow.stream || tplRow.connectorType}`,
        "append",
        tplRow.transformPipeline ? JSON.stringify(tplRow.transformPipeline) : null,
        1, 3, 60, null, 5, null,
        overrides.enabled ?? 1,
        tplRow.sceneId,
        scene?.model_id || null,
        tplRow.fieldMapping ? JSON.stringify(tplRow.fieldMapping) : null,
      ],
    );
  });
  logger.info({ templateId, taskId, sceneId: tplRow.sceneId, modelId: scene?.model_id }, "从模板实例化采集任务");
  return { taskId, template: tpl };
}
