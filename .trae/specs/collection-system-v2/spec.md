# 数据源管理与采集任务系统 V2 Spec

> change-id: `collection-system-v2`
> 对齐文档：`中央企业穿透式监管方案交流V0.1-202607.pdf`、`大型央企集团穿透式监管平台（一平台三中心）5年落地实操方案.md`、`.trae/specs/build-supervision-backend/spec.md`
> 编制日期：2026-07-17

---

## Why

`build-supervision-backend` 已落地三中心骨架，但数据采集模块仍是"占位级"实现：
- [schema.sql](file:///workspace/server/src/db/schema.sql) 的 `data_sources` 仅 7 列、`collection_tasks` 仅调度字段，无连接器类型、凭据、字段映射、断点、Transform 管道。
- [scheduler.ts](file:///workspace/server/src/modules/collection/scheduler.ts) 仅 node-cron 单机调度，无 DAG/断点/重试/限流。
- [sources.ts](file:///workspace/server/src/modules/collection/sources.ts) / [tasks.ts](file:///workspace/server/src/modules/collection/tasks.ts) 仅随机生成吞吐量，无真实连接器、无 schema 发现、无非标数据处理。
- 无监管场景/监管模型 registry，无法对齐 V0.1"11+4 采集模型 + 五个自动闭环 + 四级穿透溯源"。
- [SourcesPage.tsx](file:///workspace/src/pages/SourcesPage.tsx) / [TasksPage.tsx](file:///workspace/src/pages/TasksPage.tsx) 仍是 [SkeletonPage.tsx](file:///workspace/src/pages/SkeletonPage.tsx) 占位。

V0.1 要求 2026 年底 11 类突出问题模型上线、2027 年底 10 大领域全覆盖，采集层是"五个统一"中的"统一采集"基座，必须先于模型层落地。本期目标：**把采集模块从占位升级为可运行的多协议采集 + 非标处理 + 监管闭环基座**，覆盖金蝶 EAS Cloud、SAP、司库、财务共享等系统，并打通"采集→Transform→监管模型→风险线索→派单→销警"的最小闭环。

> 落地策略：分布式组件（SeaTunnel/DolphinScheduler/NiFi/Drools/Flowable/NebulaGraph/Doris）在本沙箱以**同语义轻量实现**承载（better-sqlite3 + node-cron + json-rules-engine + 进程内 EventBus + 内存图谱），保证业务模型、API 契约、数据流转与方案一致，可平滑替换为生产级分布式组件（与 `build-supervision-backend` 一致）。

---

## What Changes

### 新增：连接器目录与凭据安全

- 新增 `server/src/modules/collection/connectors/` 目录，承载插件化连接器（SeaTunnel Source 等价抽象）。
- 连接器声明 JsonSchema `spec` + `capabilities` + `secretFields`，前端按 spec 动态渲染表单（Airbyte 等价）。
- 凭据与登记分离：`data_sources` 仅存非敏感元数据，`data_source_secrets` 存 AES-256-GCM 加密凭据，密钥引用环境变量。
- 首批落地 6 个连接器：`kingdee-eas-openapi`、`sap-odata`、`jdbc-mysql`、`cdc-mysql`、`treasury-sys`（REST 模拟）、`file-csv`。其余 14 类（sap-bapi/sap-idoc/igix-rest/finance-shared/hr-system/...）以 registry 元数据预置，实现留待后续。

### 新增：采集任务运行时升级

- `collection_tasks` 扩展：`source_id` / `sink_target` / `write_mode` / `transform_pipeline` / `field_mapping` / `filter_condition` / `concurrency` / `retry_max` / `retry_interval_sec` / `timeout_sec` / `priority` / `depends_on` / `checkpoint_state` / `enabled`。
- 新增 `collection_task_runs`（Job/Task 级执行历史，含 records_read/write/dirty、bytes、checkpoint）。
- 新增 `collection_checkpoints`（按 task_id + shard_id 存断点，支持分片并行恢复）。
- `scheduler.ts` 升级：保留 node-cron，叠加 DAG 依赖拓扑排序、优先级队列、断点续传、指数退避重试、令牌桶限流、超时熔断。

### 新增：Transform 管道（NiFi Processor 等价）

- 新增 `server/src/modules/collection/transform/` 目录，承载可编排 Transform 管道。
- 内置 10 类 Transform：`field-mapping` / `type-cast` / `clean` / `dedup` / `filter` / `mask` / `flatten` / `enrich` / `script`（vm2 沙箱）/ `sql`（alasql）。
- 监管专用 3 类：`entity-resolve`（实体消歧）、`relationship-extract`（关系抽取喂图谱）、`evidence-snapshot`（命中规则冻结证据）。
- 脏数据治理：每步独立 `onError` 策略（skip/fail/quarantine），任务级 `errorLimit`（rate+count），超阈值 fail，脏数据入 `dirty_records` 表。

### 新增：监管场景与监管模型 registry

- 新增 `regulatory_scenes`（11+4 场景目录，绑定十大领域 + 数据来源 + 指标 + 阈值 + 频次 + 模型 ID）。
- 新增 `regulatory_models`（198 模型 registry，含 rule_dsl/threshold_json/schedule_cron/owner_dept/effectiveness）。
- 新增 `model_indicators`（指标公式 + 数据来源）。
- 新增 `collection_task_templates`（开箱即用模板，对齐浪潮 300+ 数据集预置）。
- 首批预置 5 个监管模型 + 5 个采集任务模板（财务/司库领域先行，对齐 V0.1 第 30 页资金类模型）：
  - `m-fin-dup-pay-001` 重复支付预警
  - `m-fin-private-pay-001` 非工作时间大额对私支付
  - `m-fin-fake-trade-001` 融资性贸易/空转走单
  - `m-fin-guarantee-001` 超股比担保
  - `m-fin-funding-due-001` 融资到期预警

### 新增：风险闭环运营（五个自动 · T+5 销警）

- 新增 `risk_clues`（集中式线索池，含 risk_level/entity/evidence_json/due_at T+5）。
- 新增 `risk_disposals`（派单/处置/审批/关闭全流程留痕）。
- 复用现有 [dispatch/workflow.ts](file:///workspace/server/src/modules/dispatch/workflow.ts) 状态机扩展为 `detect→dispatch→receive→dispose→approve→close→archive` 七态（兼容现有 verify→rectify→review→archive）。
- 复用 [eventbus.ts](file:///workspace/server/src/modules/platform/eventbus.ts)：模型命中 → 自动写线索 → 自动派单 → T+5 超时通报 → 整改销号 → 规则反哺。
- 复用 [rule-engine.ts](file:///workspace/server/src/modules/monitoring/rule-engine.ts)：监管模型 DSL 编译为 json-rules-engine 事实集。

### 新增：四级穿透溯源

- 扩展 `data_lineage` 表：加 `layer`（ods/dwd/dws/ads）、`scene_id`、`doc_id`（原始单据 ID）。
- [penetration.ts](file:///workspace/server/src/modules/monitoring/penetration.ts) 新增四级下钻 API：`ads/:indicatorId → dws/:blockId → dwd/:detailId → ods/:docId`。
- 新增 `linkage_rules`（联查规则预置，对齐浪潮 60+），首批预置 10 条（资金管理 5 + 投资管理 3 + 合同 2）。

### 新增：AI 智能体编排层

- 扩展 [ai/](file:///workspace/server/src/modules/ai) 模块：新增 `agents/` 子目录，registry 化 16 类智能体（对齐 V0.1 第 32 页）。
- 首批落地 3 个：`info-extract`（信息抽取）、`text-compare`（文本比对，标书查重/阴阳合同）、`report-generate`（风险报告生成）。
- 遵循 MCP/A2A 开放协议契约（智能体入参/出参标准化为 JSON），未配置 LLM 时返回结构化占位响应（与 [ai-service.ts](file:///workspace/server/src/modules/ai/ai-service.ts) 现状一致）。
- 多智能体协同：首批以 LangGraph 等价状态图（`orchestrator.ts`）编排"信息抽取 → 图谱构建 → 报告生成"链路。

### 新增：前端页面升级

- [SourcesPage.tsx](file:///workspace/src/pages/SourcesPage.tsx)：连接器目录分类标签 + 数据源列表（含健康度进度条）+ 新建抽屉（按 spec 动态渲染表单）+ 测试连接/发现 schema。
- [TasksPage.tsx](file:///workspace/src/pages/TasksPage.tsx)：任务列表（含运行状态/进度/吞吐量/脏数据数）+ 4 步向导（选数据源→选流→配 Transform→配调度）。
- [CollectionOverviewPage.tsx](file:///workspace/src/pages/CollectionOverviewPage.tsx)：补连接器统计卡片 + 监管场景覆盖卡片。

### 不变更

- 现有三中心骨架（[app.ts](file:///workspace/server/src/app.ts)、[main.ts](file:///workspace/server/src/main.ts)、路由前缀 `/api/v1`）不变。
- 前端路由、主题、UI token 体系不变。
- 现有 [src/mock/](file:///workspace/src/mock) 保留作回退。
- 现有 [src/api/types.ts](file:///workspace/src/api/types.ts) 类型不破坏，仅追加新类型。

---

## Impact

- **Affected specs**：
  - `build-supervision-backend/spec.md` §数据采集中心：由"占位执行器"升级为"连接器 + 运行时 + Transform"。
  - `build-supervision-backend/spec.md` §智慧监督中心：扩展监管模型 registry + 风险线索闭环。
  - `build-supervision-backend/spec.md` §调度指挥中心：工单状态机扩展为七态。
  - V0.1 §四系统建设、§六运营闭环、§七模型中心：本期落地数据底座与最小闭环。
- **Affected code**：
  - 新增：`server/src/modules/collection/connectors/`（6 连接器 + registry）、`server/src/modules/collection/transform/`（13 Transform + 引擎）、`server/src/modules/regulatory/`（scenes/models/indicators/templates）、`server/src/modules/risk/`（clues/disposals）、`server/src/modules/ai/agents/`（3 智能体 + orchestrator）。
  - 修改：[schema.sql](file:///workspace/server/src/db/schema.sql)（ALTER + 新表）、[seed.ts](file:///workspace/server/src/db/seed.ts)（预置数据）、[sources.ts](file:///workspace/server/src/modules/collection/sources.ts) / [tasks.ts](file:///workspace/server/src/modules/collection/tasks.ts) / [scheduler.ts](file:///workspace/server/src/modules/collection/scheduler.ts) / [quality.ts](file:///workspace/server/src/modules/collection/quality.ts) / [routes.ts](file:///workspace/server/src/modules/collection/routes.ts)、[penetration.ts](file:///workspace/server/src/modules/monitoring/penetration.ts)、[workflow.ts](file:///workspace/server/src/modules/dispatch/workflow.ts)、[rule-engine.ts](file:///workspace/server/src/modules/monitoring/rule-engine.ts)、[health.ts](file:///workspace/server/src/health.ts)（新指标）、[config.ts](file:///workspace/server/src/config.ts)（加密密钥）、[src/api/index.ts](file:///workspace/src/api/index.ts) + [types.ts](file:///workspace/src/api/types.ts)（新端点）、[src/pages/SourcesPage.tsx](file:///workspace/src/pages/SourcesPage.tsx) / [TasksPage.tsx](file:///workspace/src/pages/TasksPage.tsx) / [CollectionOverviewPage.tsx](file:///workspace/src/pages/CollectionOverviewPage.tsx)、[package.json](file:///workspace/package.json)（vm2/alasql/pdfplumber 等价依赖）。
  - 不变：`src/components/**`、`src/store/**`、`src/mock/**`、现有页面布局。

---

## 技术映射（V0.2 方案组件 → 本期实现）

| 方案组件 | 本期实现 | 说明 |
|---------|---------|------|
| SeaTunnel Source/Sink API | `connectors/registry.ts` + TypeScript interface | 同语义抽象，可平滑替换 |
| Airbyte Connector Catalog (JsonSchema) | `connectors/registry.ts` + `connectionSpec` | 同 |
| Airbyte check/discover | `sources.ts` 的 `test`/`discover` | 同 |
| DataX Job→Task→Split | `tasks.ts` 运行时 + 内存 split | 同语义，单机分片 |
| DolphinScheduler DAG | `scheduler.ts` 拓扑排序 + 优先级队列 | node-cron 保留触发 |
| NiFi Processor/FlowFile | `transform/engine.ts` + Record | 同 |
| NiFi ExecuteScript | `transform/script.ts` (vm2 沙箱) | 同 |
| NiFi ExecuteStreamCommand | `transform/external.ts` (child_process) | 同 |
| DataX errorLimit | `dirty_records` 表 + errorLimit | 同 |
| InLong Audit 对账 | `collection_audit` 表 + 4 审计点 | 同 |
| Drools 规则推理 | 复用 `json-rules-engine`（已在 build-supervision-backend 引入） | 同 |
| Flowable 工作流 | 复用 [workflow.ts](file:///workspace/server/src/modules/dispatch/workflow.ts) 状态机扩展 | 同 |
| NebulaGraph 图谱 | 复用 [graph.ts](file:///workspace/server/src/modules/monitoring/graph.ts) 邻接表 | 同 |
| Doris 数仓分层 | 复用 better-sqlite3 + ODS/DWD/DWS/ADS 注释 | 同 |
| LangChain/LangGraph | `ai/agents/orchestrator.ts` 状态图 | 同 |
| KMS 凭据加密 | `crypto` AES-256-GCM + 环境变量密钥引用 | 生产替换为 Vault |

---

## 数据模型（DDL）

### 扩展 data_sources

```sql
ALTER TABLE data_sources ADD COLUMN connector_type TEXT;
ALTER TABLE data_sources ADD COLUMN endpoint TEXT;
ALTER TABLE data_sources ADD COLUMN auth_type TEXT;
ALTER TABLE data_sources ADD COLUMN health_score INTEGER DEFAULT 100;
ALTER TABLE data_sources ADD COLUMN last_check_at TEXT;
ALTER TABLE data_sources ADD COLUMN capabilities TEXT;       -- JSON 数组
ALTER TABLE data_sources ADD COLUMN schema_catalog TEXT;     -- JSON：discover 结果
ALTER TABLE data_sources ADD COLUMN scene_id TEXT;           -- 关联监管场景（V0.1 业务谁主管）
```

### 扩展 collection_tasks

```sql
ALTER TABLE collection_tasks ADD COLUMN source_id TEXT;
ALTER TABLE collection_tasks ADD COLUMN sink_type TEXT;
ALTER TABLE collection_tasks ADD COLUMN sink_target TEXT;
ALTER TABLE collection_tasks ADD COLUMN write_mode TEXT;        -- overwrite/append/upsert
ALTER TABLE collection_tasks ADD COLUMN transform_pipeline TEXT;-- JSON 步骤数组
ALTER TABLE collection_tasks ADD COLUMN field_mapping TEXT;     -- JSON
ALTER TABLE collection_tasks ADD COLUMN filter_condition TEXT;
ALTER TABLE collection_tasks ADD COLUMN concurrency INTEGER DEFAULT 1;
ALTER TABLE collection_tasks ADD COLUMN retry_max INTEGER DEFAULT 3;
ALTER TABLE collection_tasks ADD COLUMN retry_interval_sec INTEGER DEFAULT 60;
ALTER TABLE collection_tasks ADD COLUMN timeout_sec INTEGER;
ALTER TABLE collection_tasks ADD COLUMN priority INTEGER DEFAULT 5;
ALTER TABLE collection_tasks ADD COLUMN depends_on TEXT;        -- JSON：上游任务 ID
ALTER TABLE collection_tasks ADD COLUMN checkpoint_state TEXT;  -- JSON：断点
ALTER TABLE collection_tasks ADD COLUMN enabled INTEGER DEFAULT 1;
ALTER TABLE collection_tasks ADD COLUMN scene_id TEXT;
ALTER TABLE collection_tasks ADD COLUMN model_id TEXT;
```

### 新增表

```sql
-- 连接器目录
CREATE TABLE IF NOT EXISTS connectors (
  type            TEXT PRIMARY KEY,
  display_name    TEXT NOT NULL,
  category        TEXT NOT NULL,        -- erp/db/file/mq/saas
  capabilities    TEXT,                 -- JSON
  auth            TEXT,                 -- basic/token/oauth2/cert/none
  spec_json       TEXT NOT NULL,        -- JsonSchema
  secret_fields   TEXT,                 -- JSON 数组
  enabled         INTEGER NOT NULL DEFAULT 1,
  version         TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

-- 凭据（加密）
CREATE TABLE IF NOT EXISTS data_source_secrets (
  source_id      TEXT PRIMARY KEY,
  secret_blob    BLOB NOT NULL,         -- AES-256-GCM
  secret_key_ref TEXT,                  -- 环境变量名
  updated_at     TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (source_id) REFERENCES data_sources(id) ON DELETE CASCADE
);

-- 健康历史
CREATE TABLE IF NOT EXISTS data_source_health (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id   TEXT NOT NULL,
  checked_at  TEXT NOT NULL,
  latency_ms  INTEGER,
  status      TEXT,                     -- online/offline/degraded
  error       TEXT,
  FOREIGN KEY (source_id) REFERENCES data_sources(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_dsh_source ON data_source_health(source_id, checked_at);

-- 任务执行历史
CREATE TABLE IF NOT EXISTS collection_task_runs (
  id            TEXT PRIMARY KEY,
  task_id       TEXT NOT NULL,
  attempt       INTEGER DEFAULT 1,
  status        TEXT NOT NULL,          -- running/success/failed/killed
  started_at    TEXT NOT NULL,
  finished_at   TEXT,
  records_read  INTEGER DEFAULT 0,
  records_write INTEGER DEFAULT 0,
  records_dirty INTEGER DEFAULT 0,
  bytes_read    INTEGER DEFAULT 0,
  error         TEXT,
  checkpoint    TEXT,
  FOREIGN KEY (task_id) REFERENCES collection_tasks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ctr_task ON collection_task_runs(task_id, started_at);

-- 断点
CREATE TABLE IF NOT EXISTS collection_checkpoints (
  task_id    TEXT NOT NULL,
  shard_id   TEXT NOT NULL,
  state      TEXT NOT NULL,             -- JSON
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (task_id, shard_id)
);

-- 脏数据
CREATE TABLE IF NOT EXISTS dirty_records (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    TEXT NOT NULL,
  run_id     TEXT NOT NULL,
  step_id    TEXT,
  raw_json   TEXT,
  error      TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (task_id) REFERENCES collection_tasks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_dirty_task ON dirty_records(task_id, created_at);

-- 对账
CREATE TABLE IF NOT EXISTS collection_audit (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id       TEXT NOT NULL,
  audit_point   TEXT NOT NULL,          -- reader_in/reader_out/writer_in/writer_out
  log_ts        TEXT NOT NULL,
  count         INTEGER DEFAULT 0,
  bytes         INTEGER DEFAULT 0,
  delay_ms      INTEGER DEFAULT 0,
  FOREIGN KEY (task_id) REFERENCES collection_tasks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_audit_task ON collection_audit(task_id, log_ts, audit_point);

-- 血缘（扩展）
CREATE TABLE IF NOT EXISTS data_lineage (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id      TEXT NOT NULL,
  source_id    TEXT NOT NULL,
  source_table TEXT,
  sink_table   TEXT NOT NULL,
  field_map    TEXT,
  layer        TEXT,                    -- ods/dwd/dws/ads
  scene_id     TEXT,
  doc_id       TEXT,
  created_at   TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_lineage_penetrate ON data_lineage(scene_id, layer);

-- 监管场景
CREATE TABLE IF NOT EXISTS regulatory_scenes (
  id            TEXT PRIMARY KEY,
  domain        TEXT NOT NULL,          -- investment/property/finance/accounting/salary/finance-risk/military/overseas/procurement/contract
  issue_code    TEXT,                   -- over_debt/irrelevant_diversification/salary_anomaly/...
  name          TEXT NOT NULL,
  description   TEXT,
  data_sources  TEXT,                   -- JSON：连接器 type 数组
  indicators    TEXT,                   -- JSON
  threshold     TEXT,                   -- JSON
  freq          TEXT,                   -- realtime/hourly/daily/monthly
  model_id      TEXT,
  enabled       INTEGER DEFAULT 1,
  created_at    TEXT DEFAULT (datetime('now'))
);

-- 监管模型
CREATE TABLE IF NOT EXISTS regulatory_models (
  id              TEXT PRIMARY KEY,
  scene_id        TEXT NOT NULL,
  domain          TEXT NOT NULL,
  category        TEXT,                 -- rule/ml/agent
  name            TEXT NOT NULL,
  description     TEXT,
  rule_type       TEXT,                 -- enterprise/manager/employee/professional-manager
  indicator_count INTEGER,
  rule_dsl        TEXT,                 -- json-rules-engine DSL
  threshold_json  TEXT,
  schedule_cron   TEXT,
  status          TEXT,                 -- draft/testing/online/offline
  version         TEXT,
  owner_dept      TEXT,
  effectiveness   TEXT,
  created_at      TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (scene_id) REFERENCES regulatory_scenes(id)
);

-- 指标
CREATE TABLE IF NOT EXISTS model_indicators (
  id          TEXT PRIMARY KEY,
  model_id    TEXT NOT NULL,
  name        TEXT NOT NULL,
  expr        TEXT,
  data_source TEXT,
  unit        TEXT,
  FOREIGN KEY (model_id) REFERENCES regulatory_models(id)
);

-- 采集任务模板
CREATE TABLE IF NOT EXISTS collection_task_templates (
  id            TEXT PRIMARY KEY,
  scene_id      TEXT NOT NULL,
  name          TEXT NOT NULL,
  connector_type TEXT NOT NULL,
  stream        TEXT,
  schedule_cron TEXT,
  transform_pipeline TEXT,
  field_mapping TEXT,
  FOREIGN KEY (scene_id) REFERENCES regulatory_scenes(id)
);

-- 风险线索
CREATE TABLE IF NOT EXISTS risk_clues (
  id            TEXT PRIMARY KEY,
  scene_id      TEXT NOT NULL,
  model_id      TEXT NOT NULL,
  entity_type   TEXT,
  entity_id     TEXT,
  risk_level    TEXT,                   -- yellow/orange/red
  risk_value    TEXT,
  description   TEXT,
  status        TEXT DEFAULT 'pending', -- pending/confirmed/dispatched/disposed/closed/transferred
  detected_at   TEXT NOT NULL,
  due_at        TEXT,
  assigned_to   TEXT,
  org_code      TEXT,
  evidence_json TEXT,
  work_order_id TEXT,                   -- 关联 dispatch 工单
  FOREIGN KEY (scene_id) REFERENCES regulatory_scenes(id),
  FOREIGN KEY (model_id) REFERENCES regulatory_models(id)
);
CREATE INDEX IF NOT EXISTS idx_clue_status ON risk_clues(status, due_at);

-- 处置记录
CREATE TABLE IF NOT EXISTS risk_disposals (
  id            TEXT PRIMARY KEY,
  clue_id       TEXT NOT NULL,
  step          TEXT,                   -- receive/dispose/approve/close
  handler       TEXT NOT NULL,
  role_code     TEXT,
  comment       TEXT,
  attachment    TEXT,
  created_at    TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (clue_id) REFERENCES risk_clues(id)
);

-- 联查规则
CREATE TABLE IF NOT EXISTS linkage_rules (
  id           TEXT PRIMARY KEY,
  scene_id     TEXT NOT NULL,
  source_system TEXT,
  entry_point  TEXT,
  drill_path   TEXT,                    -- JSON
  target_layer TEXT,
  FOREIGN KEY (scene_id) REFERENCES regulatory_scenes(id)
);

-- 监管岗位
CREATE TABLE IF NOT EXISTS regulatory_positions (
  code          TEXT PRIMARY KEY,
  layer         TEXT NOT NULL,          -- group/subsidiary
  category      TEXT NOT NULL,
  role_type     TEXT,                   -- handler/approver/receiver/disposer
  name          TEXT NOT NULL,
  data_scope    TEXT
);

CREATE TABLE IF NOT EXISTS position_model_grant (
  position_code TEXT NOT NULL,
  model_id      TEXT NOT NULL,
  permission    TEXT,
  PRIMARY KEY (position_code, model_id)
);
```

---

## 连接器 Registry 契约

```ts
// server/src/modules/collection/connectors/registry.ts
export interface ConnectorSpec {
  type: string;                    // kingdee-eas-openapi / sap-odata / jdbc-mysql / ...
  displayName: string;
  category: 'erp' | 'db' | 'file' | 'mq' | 'saas';
  capabilities: ('full' | 'incremental' | 'cdc' | 'discover' | 'schema-evolution')[];
  auth: 'basic' | 'token' | 'oauth2' | 'cert' | 'none';
  connectionSpec: object;          // JsonSchema，前端按此渲染
  secretFields: string[];
  icon?: string;
}

export interface ConnectorInstance {
  spec: ConnectorSpec;
  test(config: Record<string, unknown>): Promise<{ status: 'online'|'offline'|'degraded'; latencyMs: number; error?: string }>;
  discover(config: Record<string, unknown>): Promise<StreamCatalog>;
  read(ctx: ReadContext): AsyncIterable<Record<string, unknown>>;  // Reader
}

export interface StreamCatalog {
  streams: Array<{
    name: string;                  // salary_records / payment_flow / ...
    fields: Array<{ name: string; type: string; nullable: boolean }>;
    supportedModes: ('full'|'incremental'|'cdc')[];
    incrementalField?: string;     // 增量水位线字段
  }>;
}

export interface ReadContext {
  config: Record<string, unknown>;
  stream: string;
  mode: 'full' | 'incremental' | 'cdc';
  checkpoint?: Record<string, unknown>;   // 断点
  filter?: string;
  split?: { id: string; range: [unknown, unknown] };
}
```

首批 6 个连接器实现（其余 14 类仅 registry 元数据，`test/discover/read` 抛 `NOT_IMPLEMENTED`）：

| type | test | discover | read | 实现要点 |
|---|---|---|---|---|
| `kingdee-eas-openapi` | ✓（HTTP /eas/v2/auth/login） | ✓（拉主数据元数据） | ✓（list 接口分页 + 增量水位线） | token 缓存 + 重试 |
| `sap-odata` | ✓（HTTP $metadata） | ✓（$metadata 解析） | ✓（$filter + $skiptoken 分页） | OData v2/v4 兼容 |
| `jdbc-mysql` | ✓（SELECT 1） | ✓（information_schema） | ✓（PK 范围分片） | better-sqlite3 模拟，接口对齐 mysql2 |
| `cdc-mysql` | ✓（SHOW MASTER STATUS） | ✓（SHOW TABLES） | ✓（binlog 位点模拟，按 id 范围增量） | 单机模拟 CDC |
| `treasury-sys` | ✓（GET /health） | ✓（静态 catalog） | ✓（mock 数据流） | 模拟司库 REST |
| `file-csv` | ✓（fs.access） | ✓（首行解析列） | ✓（流式读取） | papaparse |

---

## Transform 管道契约

```ts
// server/src/modules/collection/transform/engine.ts
export interface TransformStep {
  id: string;
  type: 'field-mapping' | 'type-cast' | 'clean' | 'dedup' | 'filter' | 'mask'
      | 'flatten' | 'enrich' | 'script' | 'sql' | 'entity-resolve'
      | 'relationship-extract' | 'evidence-snapshot';
  name: string;
  config: Record<string, unknown>;
  onError: 'skip' | 'fail' | 'quarantine';
}

export interface TransformPipeline {
  steps: TransformStep[];
  errorLimit: { rate: number; count: number };
}

export interface TransformContext {
  taskId: string;
  runId: string;
  sceneId?: string;
  modelId?: string;
  checkpoint?: Record<string, unknown>;
}

export interface Record {
  data: Record<string, unknown>;
  metadata: { source: string; _lineage: string; _ts: number };
}

export interface TransformResult {
  records: Record[];
  dirtyCount: number;
  evidence?: Record<string, unknown>[];   // evidence-snapshot 产出
}

export class TransformEngine {
  constructor(pipeline: TransformPipeline, ctx: TransformContext);
  run(input: AsyncIterable<Record>): Promise<TransformResult>;
}
```

每类 Transform 实现为 `transform/{type}.ts`，统一接口 `(record, config, ctx) => Record | null`（null 表示过滤）。

---

## 采集任务运行时契约

```ts
// server/src/modules/collection/runtime.ts
export interface JobRunResult {
  runId: string;
  status: 'success' | 'failed' | 'killed' | 'partial';
  recordsRead: number;
  recordsWrite: number;
  recordsDirty: number;
  bytesRead: number;
  checkpoint: Record<string, unknown>;
  error?: string;
}

export class CollectionRuntime {
  async runTask(taskId: string, opts?: { resume?: boolean }): Promise<JobRunResult>;
  // 内部分流：
  // 1. 加载任务 + 数据源 + 凭据解密
  // 2. 实例化连接器
  // 3. 按 mode 决定 split 策略（full: PK 范围; incremental: 水位线; cdc: binlog shard）
  // 4. 并发执行 split（concurrency 限制）
  // 5. 每个 split 流：reader → transform engine → sink
  // 6. 每 split 完成写 checkpoint
  // 7. 失败重试（retry_max + 指数退避）
  // 8. 超时熔断（timeout_sec）
  // 9. 写 collection_task_runs + collection_audit + data_lineage
  // 10. 触发监管模型评估（EventBus）
}
```

---

## API 契约（新增端点）

所有端点前缀 `/api/v1`，复用现有 [auth.ts](file:///workspace/server/src/modules/platform/auth.ts) JWT 鉴权与 [rbac.ts](file:///workspace/server/src/modules/platform/rbac.ts) 角色控制。

### 连接器与数据源

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/collection/connectors` | 列出连接器目录（含 spec） |
| GET | `/collection/connectors/:type` | 单个连接器详情 |
| GET | `/collection/sources` | 数据源列表（已有，扩展返回 connector_type/health_score） |
| POST | `/collection/sources` | 新建数据源（含凭据加密入库） |
| PUT | `/collection/sources/:id` | 更新 |
| DELETE | `/collection/sources/:id` | 删除（级联删凭据） |
| POST | `/collection/sources/test` | 测试连接（不落库） |
| POST | `/collection/sources/:id/test` | 测试已存数据源 |
| POST | `/collection/sources/:id/discover` | 发现 schema，返回 StreamCatalog |
| GET | `/collection/sources/:id/health-history` | 健康度历史 |
| POST | `/collection/sources/:id/health-check` | 手动健康检查 |

### 采集任务

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/collection/tasks` | 列表（已有，扩展返回 source_id/scene_id/model_id） |
| POST | `/collection/tasks` | 新建（含 transform_pipeline/field_mapping/depends_on） |
| PUT/DELETE | `/collection/tasks/:id` | 更新/删除 |
| POST | `/collection/tasks/:id/start` | 启动 |
| POST | `/collection/tasks/:id/stop` | 停止 |
| POST | `/collection/tasks/:id/trigger` | 手动触发一次 |
| GET | `/collection/tasks/:id/runs` | 运行历史 |
| GET | `/collection/tasks/:id/checkpoint` | 断点状态 |
| GET | `/collection/tasks/:id/runs/:runId/dirty` | 脏数据列表 |
| GET | `/collection/tasks/:id/audit` | 对账数据 |

### Transform

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/collection/transforms/types` | 列出 13 类 Transform 类型与配置 schema |
| POST | `/collection/transforms/preview` | 试运行（输入样本 + 管道，返回结果） |

### 监管场景与模型

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/regulatory/scenes` | 场景列表（按 domain 过滤） |
| GET | `/regulatory/scenes/:id` | 详情 |
| GET | `/regulatory/models` | 模型列表 |
| GET | `/regulatory/models/:id` | 详情（含指标） |
| POST | `/regulatory/models/:id/test` | 试运行模型 |
| GET | `/regulatory/templates` | 采集任务模板列表 |
| POST | `/regulatory/templates/:id/instantiate` | 从模板创建采集任务 |

### 风险闭环

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/risk/clues` | 线索列表（按 status/risk_level/scene_id/org_code 过滤） |
| GET | `/risk/clues/:id` | 详情（含 evidence） |
| POST | `/risk/clues/:id/dispatch` | 派单（创建 dispatch 工单并关联） |
| POST | `/risk/clues/:id/dispose` | 处置记录 |
| POST | `/risk/clues/:id/close` | 销警关闭 |
| GET | `/risk/my-todos` | 当前用户待办 |
| POST | `/risk/todos/:id/claim` | 认领 |
| POST | `/risk/todos/:id/complete` | 完成 |

### 穿透与联查

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/penetration/ads/:indicatorId` | 汇总指标下钻 |
| GET | `/penetration/dws/:blockId` | 板块下钻 |
| GET | `/penetration/dwd/:detailId` | 明细下钻 |
| GET | `/penetration/ods/:docId` | 原始单据 |
| GET | `/penetration/lineage?sceneId=` | 血缘图 |
| GET | `/linkage/rules` | 联查规则列表 |
| POST | `/linkage/rules/:id/execute` | 执行联查 |

### AI 智能体

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/ai/agents` | 智能体 registry |
| POST | `/ai/agents/:id/invoke` | 调用单个智能体 |
| POST | `/ai/agents/orchestrate` | 多智能体编排 |

所有 AI 端点强制经过 [sanitizer.ts](file:///workspace/server/src/modules/ai/sanitizer.ts) 脱敏管道（与 build-supervision-backend 一致）。

---

## 非功能性需求

- **性能**：连接器 test ≤3s；discover ≤10s；单 split 1000 条/s；Transform 试运行 ≤5s；穿透查询 ≤500ms（2 跳）。
- **安全**：凭据 AES-256-GCM 加密；密钥不入库不入日志；API 返回凭据字段一律脱敏；AI 输入强制脱敏；所有写操作落 [audit_logs](file:///workspace/server/src/db/schema.sql)。
- **可靠性**：断点续传失败率 0（CDC 任务重启不丢线索）；重试上限 retry_max；errorLimit 超阈值 fail；T+5 超时线索自动通报。
- **可观测**：[health.ts](file:///workspace/server/src/health.ts) 新增指标 `collection_records_total{task_id,point}`、`collection_dirty_total{task_id}`、`source_health_score{source_id}`、`risk_clues_pending_total`。
- **兼容**：现有 `/collection/sources`、`/collection/tasks`、`/collection/overview`、`/collection/trend` 响应结构向后兼容（仅追加字段，不删除/改类型）。
- **幂等**：seed.ts 二次启动不重复灌入（按 id 去重）；schema.sql `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ADD COLUMN` 用 `try-catch` 容错已存在列。

---

## 范围外（本期不做）

- 分布式引擎对接（SeaTunnel/Zeta/Flink）：API 已对齐，运行时仍为单机。
- 14 类未实现连接器的真实接入（仅 registry 元数据）。
- 大模型微调、知识库训练：仅保留智能体调用契约。
- 跨境数据合规、军品保密隔离：仅 schema 预留 `scene_id`/`org_code` 字段。
- 国资委报送接口：仅预留 ADS 层。
- NebulaGraph 真实部署：复用现有内存图谱。
