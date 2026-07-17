// 监管指标模块：CRUD（model_indicators 表）
import { execute, queryAll, queryOne, transaction } from "../../db/index.js";
import { camelize } from "../../utils/case.js";

/** 指标请求体 */
export interface IndicatorBody {
  id?: string;
  modelId: string;
  name: string;
  expr?: string;
  dataSource?: string;
  unit?: string;
}

/** 列出指定模型的指标 */
export function listIndicators(modelId: string): Array<Record<string, unknown>> {
  const rows = queryAll<Record<string, unknown>>(
    "SELECT * FROM model_indicators WHERE model_id = ? ORDER BY id",
    [modelId],
  );
  return rows.map((r) => camelize(r));
}

/** 取单个指标 */
export function getIndicator(id: string): Record<string, unknown> | null {
  const row = queryOne<Record<string, unknown>>(
    "SELECT * FROM model_indicators WHERE id = ?",
    [id],
  );
  return row ? camelize(row) : null;
}

/** 创建指标 */
export function createIndicator(body: IndicatorBody): Record<string, unknown> {
  const id = body.id || `ind-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  transaction(() => {
    execute(
      `INSERT INTO model_indicators (id, model_id, name, expr, data_source, unit)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, body.modelId, body.name, body.expr || null, body.dataSource || null, body.unit || null],
    );
  });
  return getIndicator(id) as Record<string, unknown>;
}

/** 更新指标 */
export function updateIndicator(id: string, body: Partial<IndicatorBody>): Record<string, unknown> | null {
  const existing = getIndicator(id);
  if (!existing) return null;
  const merged = { ...existing, ...body } as IndicatorBody;
  transaction(() => {
    execute(
      `UPDATE model_indicators SET model_id = ?, name = ?, expr = ?, data_source = ?, unit = ? WHERE id = ?`,
      [merged.modelId, merged.name, merged.expr || null, merged.dataSource || null, merged.unit || null, id],
    );
  });
  return getIndicator(id);
}

/** 删除指标 */
export function deleteIndicator(id: string): boolean {
  const r = execute("DELETE FROM model_indicators WHERE id = ?", [id]);
  return r.changes > 0;
}

/** 按模型批量删除指标 */
export function deleteIndicatorsByModel(modelId: string): number {
  const r = execute("DELETE FROM model_indicators WHERE model_id = ?", [modelId]);
  return r.changes;
}
