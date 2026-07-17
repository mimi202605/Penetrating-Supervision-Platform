// schema 幂等性测试：二次 initSchema 不报错
import { test } from "node:test";
import assert from "node:assert/strict";
import { initSchema, queryAll } from "../src/db/index.ts";

test("initSchema 二次执行幂等（不报 duplicate column）", async () => {
  await initSchema();
  await initSchema();
  // 校验 V2 表已建
  const tables = queryAll<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
  );
  const names = tables.map((t) => t.name);
  for (const t of [
    "connectors",
    "data_source_secrets",
    "data_source_health",
    "collection_task_runs",
    "collection_checkpoints",
    "dirty_records",
    "collection_audit",
    "data_lineage",
    "regulatory_scenes",
    "regulatory_models",
    "model_indicators",
    "collection_task_templates",
    "risk_clues",
    "risk_disposals",
    "linkage_rules",
    "regulatory_positions",
    "position_model_grant",
    "ods_generic",
  ]) {
    assert.ok(names.includes(t), `表 ${t} 应存在`);
  }
  // 校验 data_sources 扩展列存在
  const dsCols = queryAll<{ name: string }>("PRAGMA table_info(data_sources)");
  const dsNames = dsCols.map((c) => c.name);
  for (const c of [
    "connector_type",
    "endpoint",
    "auth_type",
    "health_score",
    "last_check_at",
    "capabilities",
    "schema_catalog",
    "scene_id",
  ]) {
    assert.ok(dsNames.includes(c), `data_sources.${c} 应存在`);
  }
  // 校验 collection_tasks 扩展列
  const ctCols = queryAll<{ name: string }>("PRAGMA table_info(collection_tasks)");
  const ctNames = ctCols.map((c) => c.name);
  for (const c of [
    "source_id",
    "sink_type",
    "sink_target",
    "write_mode",
    "transform_pipeline",
    "field_mapping",
    "filter_condition",
    "concurrency",
    "retry_max",
    "retry_interval_sec",
    "timeout_sec",
    "priority",
    "depends_on",
    "checkpoint_state",
    "enabled",
    "scene_id",
    "model_id",
  ]) {
    assert.ok(ctNames.includes(c), `collection_tasks.${c} 应存在`);
  }
});
