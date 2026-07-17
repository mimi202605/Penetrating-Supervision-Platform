-- ============================================================
-- 穿透式监管平台 数据库 Schema（SQLite）
-- 分层说明（对应 Apache Doris 数仓语义）：
--   ODS 原始层：外部系统采集的原始数据，保持原貌
--   DWD 明细层：清洗/标准化后的维度与明细
--   DWS 汇总层：业务汇总指标、风险/工单/规则主题
--   ADS 应用层：审计、AI 调用日志、脱敏策略等应用支撑
-- 所有列名使用 snake_case；API 返回 JSON 时统一转驼峰
-- ============================================================

-- ------------------------------------------------------------
-- DWD 明细层：组织机构（集团/板块/二级/三级）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organizations (
  id         TEXT PRIMARY KEY,             -- 组织ID
  name       TEXT NOT NULL,                -- 组织名称
  level      INTEGER NOT NULL,             -- 层级 1集团/2板块/3二级/4三级（与前端 level 约定）
  parent_id  TEXT,                          -- 上级组织ID
  type       TEXT,                          -- 组织类型描述（集团总部/二级单位/三级单位）
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_org_parent ON organizations(parent_id);
CREATE INDEX IF NOT EXISTS idx_org_level  ON organizations(level);

-- ------------------------------------------------------------
-- DWD 明细层：用户与角色
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,           -- 用户ID
  username      TEXT NOT NULL UNIQUE,       -- 登录名
  password_hash TEXT NOT NULL,              -- 密码哈希（dev 环境存明文，生产应 bcrypt）
  role          TEXT NOT NULL,              -- 角色 admin/group_admin/inspector/duty_officer/leader
  org_id        TEXT,                       -- 所属组织ID
  name          TEXT,                       -- 显示名
  created_at    TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (org_id) REFERENCES organizations(id)
);
CREATE INDEX IF NOT EXISTS idx_user_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_user_org  ON users(org_id);

-- ------------------------------------------------------------
-- DWD 明细层：银行账户
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounts (
  id          TEXT PRIMARY KEY,             -- 账户ID
  org_id      TEXT,                         -- 所属组织
  name        TEXT,                         -- 账户名称
  account_no  TEXT,                         -- 账号（脱敏形式）
  type        TEXT,                         -- 账户类型（基本户/一般户/结算户）
  created_at  TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (org_id) REFERENCES organizations(id)
);
CREATE INDEX IF NOT EXISTS idx_account_org ON accounts(org_id);

-- ------------------------------------------------------------
-- DWD 明细层：交易对手方
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS counterparties (
  id    TEXT PRIMARY KEY,                   -- 对手方ID
  name  TEXT NOT NULL,                      -- 名称
  meta  TEXT,                               -- 附加说明（境外/新建/关联等）
  created_at TEXT DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------
-- ODS 原始层：交易流水（采集自司库系统）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
  id               TEXT PRIMARY KEY,        -- 流水ID
  account_id       TEXT,                    -- 账户ID
  counterparty_id  TEXT,                    -- 对手方ID
  amount           REAL NOT NULL,           -- 金额（元）
  ts               TEXT NOT NULL,           -- 交易时间
  type             TEXT,                    -- 类型 inflow/outflow
  raw_json         TEXT,                    -- 原始报文（JSON 字符串）
  created_at       TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (account_id) REFERENCES accounts(id),
  FOREIGN KEY (counterparty_id) REFERENCES counterparties(id)
);
CREATE INDEX IF NOT EXISTS idx_txn_account ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_txn_cp      ON transactions(counterparty_id);
CREATE INDEX IF NOT EXISTS idx_txn_ts      ON transactions(ts);

-- ------------------------------------------------------------
-- DWS 汇总层：风险预警（智慧监督中心产物）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS risk_warnings (
  id               TEXT PRIMARY KEY,        -- 预警ID
  title            TEXT NOT NULL,           -- 标题
  domain           TEXT,                    -- 风险领域
  level            TEXT NOT NULL,           -- 级别 high/medium/low
  subject          TEXT,                    -- 风险主体
  rule             TEXT,                    -- 命中规则名
  triggered_at     TEXT,                    -- 触发时间（YYYY-MM-DD HH:mm）
  status           TEXT NOT NULL DEFAULT 'pending', -- pending/processing/resolved
  clue             TEXT,                    -- 线索描述
  related_order_id TEXT,                    -- 关联工单ID
  raw_json         TEXT,                    -- 原始字段明细（JSON 数组，前端 raw）
  created_at       TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rw_domain ON risk_warnings(domain);
CREATE INDEX IF NOT EXISTS idx_rw_level  ON risk_warnings(level);
CREATE INDEX IF NOT EXISTS idx_rw_status ON risk_warnings(status);

-- ------------------------------------------------------------
-- DWS 汇总层：核查工单（调度指挥中心）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS work_orders (
  id              TEXT PRIMARY KEY,         -- 工单ID
  risk_source     TEXT,                     -- 风险来源（资金异动/决策越权等）
  owner           TEXT,                     -- 责任人
  current_node    TEXT NOT NULL,            -- 当前节点 verify/rectify/review/archive
  progress        INTEGER NOT NULL DEFAULT 0, -- 进度 0-100
  status          TEXT NOT NULL DEFAULT 'processing', -- processing/archived
  risk_warning_id TEXT,                     -- 关联风险预警ID
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (risk_warning_id) REFERENCES risk_warnings(id)
);
CREATE INDEX IF NOT EXISTS idx_wo_status ON work_orders(status);
CREATE INDEX IF NOT EXISTS idx_wo_node   ON work_orders(current_node);
CREATE INDEX IF NOT EXISTS idx_wo_owner  ON work_orders(owner);

-- ------------------------------------------------------------
-- DWS 汇总层：监控规则（json-rules-engine DSL）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rules (
  id         TEXT PRIMARY KEY,              -- 规则ID
  name       TEXT NOT NULL,                 -- 规则名称
  domain     TEXT,                          -- 所属领域
  dsl_json   TEXT NOT NULL,                 -- 规则 DSL（JSON 字符串，json-rules-engine 格式）
  priority   INTEGER DEFAULT 1,             -- 优先级
  enabled    INTEGER NOT NULL DEFAULT 1,    -- 是否启用 1/0
  version    INTEGER DEFAULT 1,             -- 版本号
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rule_domain  ON rules(domain);
CREATE INDEX IF NOT EXISTS idx_rule_enabled ON rules(enabled);

-- ------------------------------------------------------------
-- DWS 汇总层：采集任务（数据采集中心编排）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS collection_tasks (
  id           TEXT PRIMARY KEY,            -- 任务ID
  name         TEXT NOT NULL,               -- 任务名称
  source       TEXT,                        -- 数据源（浪潮 iGIX/司库 MySQL/司库 Oracle/其他）
  mode         TEXT,                        -- 采集模式 全量/增量/CDC
  schedule     TEXT,                        -- 调度表达式（cron 或 实时）
  last_status  TEXT,                        -- 最近状态 成功/失败/运行中
  throughput   TEXT,                        -- 吞吐量描述
  last_run     TEXT,                        -- 最近运行时间
  created_at   TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ct_status ON collection_tasks(last_status);

-- ------------------------------------------------------------
-- ODS 原始层：数据源登记
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS data_sources (
  id          TEXT PRIMARY KEY,             -- 数据源ID
  name        TEXT NOT NULL,                -- 名称
  type        TEXT,                         -- 接入类型（REST API/binlog CDC/JDBC）
  status      TEXT NOT NULL DEFAULT 'online', -- online/offline/error
  records     TEXT,                         -- 数据量描述
  update_freq TEXT,                         -- 更新频率
  owner       TEXT,                         -- 负责人
  created_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ds_status ON data_sources(status);

-- ------------------------------------------------------------
-- ODS 原始层：采集日志
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS collection_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id       TEXT NOT NULL,              -- 任务ID
  status        TEXT NOT NULL,              -- 成功/失败/运行中
  started_at    TEXT,                       -- 开始时间
  finished_at   TEXT,                       -- 结束时间
  records_count INTEGER DEFAULT 0,          -- 采集记录数
  error         TEXT,                       -- 错误信息
  created_at    TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (task_id) REFERENCES collection_tasks(id)
);
CREATE INDEX IF NOT EXISTS idx_clog_task   ON collection_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_clog_status ON collection_logs(status);

-- ------------------------------------------------------------
-- ODS 原始层：数据质量问题
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS data_quality_issues (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    TEXT,                          -- 关联采集任务
  field      TEXT,                          -- 问题字段
  rule       TEXT,                          -- 校验规则
  severity   TEXT,                          -- 严重级别 high/medium/low
  detail     TEXT,                          -- 详情
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (task_id) REFERENCES collection_tasks(id)
);
CREATE INDEX IF NOT EXISTS idx_dq_task     ON data_quality_issues(task_id);
CREATE INDEX IF NOT EXISTS idx_dq_severity ON data_quality_issues(severity);

-- ------------------------------------------------------------
-- ADS 应用层：审计日志（Ranger 等价）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT,                          -- 操作人ID
  action     TEXT NOT NULL,                 -- 操作类型 login/logout/create/update/delete/query
  target     TEXT,                          -- 操作目标
  ip         TEXT,                          -- 来源 IP
  detail     TEXT,                          -- 详情（JSON 字符串）
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_user   ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_time   ON audit_logs(created_at);

-- ------------------------------------------------------------
-- DWD 明细层：关系图谱节点（账户-交易对手-组织-人员四级）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS graph_nodes (
  id    TEXT PRIMARY KEY,                   -- 节点ID
  label TEXT NOT NULL,                      -- 显示名
  type  TEXT NOT NULL,                      -- account/counterparty/org/person
  meta  TEXT                                -- 附加说明
);
CREATE INDEX IF NOT EXISTS idx_gn_type ON graph_nodes(type);

-- ------------------------------------------------------------
-- DWD 明细层：关系图谱边
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS graph_edges (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,                     -- 起点 ID
  target TEXT NOT NULL,                     -- 终点 ID
  label  TEXT,                              -- 边描述（持有/8,600万元 →/亲属控股 等）
  weight REAL DEFAULT 1                     -- 权重
);
CREATE INDEX IF NOT EXISTS idx_ge_source ON graph_edges(source);
CREATE INDEX IF NOT EXISTS idx_ge_target ON graph_edges(target);

-- ------------------------------------------------------------
-- ADS 应用层：脱敏策略（Ranger 脱敏等价）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sanitizer_policies (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,             -- 策略名
  field_pattern  TEXT NOT NULL,             -- 字段匹配模式（正则）
  algorithm      TEXT NOT NULL,             -- 算法 mask/hash/replace/range
  replace_value  TEXT,                      -- replace 算法的占位值
  enabled        INTEGER NOT NULL DEFAULT 1,
  role_scope     TEXT,                      -- 适用角色（逗号分隔，* 表示全部）
  created_at     TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sp_enabled ON sanitizer_policies(enabled);

-- ------------------------------------------------------------
-- ADS 应用层：AI 调用全链路日志
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_call_logs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         TEXT,                     -- 调用者
  endpoint        TEXT NOT NULL,            -- 端点
  input_summary   TEXT,                     -- 脱敏后入参摘要
  output_summary  TEXT,                     -- 出参摘要
  latency_ms      INTEGER DEFAULT 0,        -- 耗时
  token           INTEGER DEFAULT 0,        -- token 消耗
  created_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_aicall_user ON ai_call_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_aicall_ep   ON ai_call_logs(endpoint);

-- ============================================================
-- V2 扩展：数据源管理与采集任务系统
-- change-id: collection-system-v2
-- 说明：所有 ALTER TABLE 用幂等方式处理已存在列（应用层 db/index.ts 预检）；
--       CREATE TABLE IF NOT EXISTS 保证可重复执行。
-- ============================================================

-- ------------------------------------------------------------
-- V2 扩展：data_sources 增加连接器类型、健康度、场景关联
-- ------------------------------------------------------------
ALTER TABLE data_sources ADD COLUMN connector_type TEXT;        -- kingdee-eas-openapi / sap-bapi / ...
ALTER TABLE data_sources ADD COLUMN endpoint TEXT;              -- 主机/URL
ALTER TABLE data_sources ADD COLUMN auth_type TEXT;             -- basic/token/oauth2/cert
ALTER TABLE data_sources ADD COLUMN health_score INTEGER DEFAULT 100;
ALTER TABLE data_sources ADD COLUMN last_check_at TEXT;
ALTER TABLE data_sources ADD COLUMN capabilities TEXT;          -- JSON 数组
ALTER TABLE data_sources ADD COLUMN schema_catalog TEXT;        -- JSON：discover 结果
ALTER TABLE data_sources ADD COLUMN scene_id TEXT;              -- 关联监管场景
ALTER TABLE data_sources ADD COLUMN config_json TEXT;           -- 非敏感配置 JSON（endpoint/username/dcCode 等非凭据字段）

-- ------------------------------------------------------------
-- V2 扩展：collection_tasks 增加 source/sink/transform/调度策略
-- ------------------------------------------------------------
ALTER TABLE collection_tasks ADD COLUMN source_id TEXT;
ALTER TABLE collection_tasks ADD COLUMN sink_type TEXT;
ALTER TABLE collection_tasks ADD COLUMN sink_target TEXT;
ALTER TABLE collection_tasks ADD COLUMN write_mode TEXT;         -- overwrite/append/upsert
ALTER TABLE collection_tasks ADD COLUMN transform_pipeline TEXT; -- JSON 步骤数组
ALTER TABLE collection_tasks ADD COLUMN field_mapping TEXT;      -- JSON
ALTER TABLE collection_tasks ADD COLUMN filter_condition TEXT;
ALTER TABLE collection_tasks ADD COLUMN concurrency INTEGER DEFAULT 1;
ALTER TABLE collection_tasks ADD COLUMN retry_max INTEGER DEFAULT 3;
ALTER TABLE collection_tasks ADD COLUMN retry_interval_sec INTEGER DEFAULT 60;
ALTER TABLE collection_tasks ADD COLUMN timeout_sec INTEGER;
ALTER TABLE collection_tasks ADD COLUMN priority INTEGER DEFAULT 5;
ALTER TABLE collection_tasks ADD COLUMN depends_on TEXT;         -- JSON：上游任务 ID
ALTER TABLE collection_tasks ADD COLUMN checkpoint_state TEXT;   -- JSON：断点
ALTER TABLE collection_tasks ADD COLUMN enabled INTEGER DEFAULT 1;
ALTER TABLE collection_tasks ADD COLUMN scene_id TEXT;
ALTER TABLE collection_tasks ADD COLUMN model_id TEXT;

-- ------------------------------------------------------------
-- V2 新增：连接器目录（可热插拔，前端按此渲染）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS connectors (
  type            TEXT PRIMARY KEY,
  display_name    TEXT NOT NULL,
  category        TEXT NOT NULL,         -- erp/db/file/mq/saas
  capabilities    TEXT,                  -- JSON 数组
  auth            TEXT,                  -- basic/token/oauth2/cert/none
  spec_json       TEXT NOT NULL,         -- JsonSchema 配置规范
  secret_fields   TEXT,                  -- JSON 数组
  enabled         INTEGER NOT NULL DEFAULT 1,
  version         TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------
-- V2 新增：数据源凭据（密钥入此表，加密存储，与登记表解耦）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS data_source_secrets (
  source_id      TEXT PRIMARY KEY,
  secret_blob    BLOB NOT NULL,          -- AES-256-GCM 密文（IV 前置）
  secret_key_ref TEXT,                   -- 环境变量名
  updated_at     TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (source_id) REFERENCES data_sources(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- V2 新增：数据源健康历史（用于趋势图）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS data_source_health (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id   TEXT NOT NULL,
  checked_at  TEXT NOT NULL,
  latency_ms  INTEGER,
  status      TEXT,                       -- online/offline/degraded
  error       TEXT,
  FOREIGN KEY (source_id) REFERENCES data_sources(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_dsh_source ON data_source_health(source_id, checked_at);

-- ------------------------------------------------------------
-- V2 新增：任务执行历史（Job/Task 级粒度）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS collection_task_runs (
  id            TEXT PRIMARY KEY,         -- run-<taskId>-<ts>
  task_id       TEXT NOT NULL,
  attempt       INTEGER DEFAULT 1,
  status        TEXT NOT NULL,            -- running/success/failed/killed
  started_at    TEXT NOT NULL,
  finished_at   TEXT,
  records_read  INTEGER DEFAULT 0,
  records_write INTEGER DEFAULT 0,
  records_dirty INTEGER DEFAULT 0,
  bytes_read    INTEGER DEFAULT 0,
  error         TEXT,
  checkpoint    TEXT,                     -- 本次结束的断点状态
  FOREIGN KEY (task_id) REFERENCES collection_tasks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ctr_task ON collection_task_runs(task_id, started_at);

-- ------------------------------------------------------------
-- V2 新增：断点（CDC/增量任务专用，独立于任务以支持多实例）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS collection_checkpoints (
  task_id    TEXT NOT NULL,
  shard_id   TEXT NOT NULL,               -- 分片标识
  state      TEXT NOT NULL,               -- JSON
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (task_id, shard_id)
);

-- ------------------------------------------------------------
-- V2 新增：脏数据隔离表（DataX errorLimit 等价）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dirty_records (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    TEXT NOT NULL,
  run_id     TEXT NOT NULL,
  step_id    TEXT,                        -- 出错的 transform 步骤
  raw_json   TEXT,                        -- 原始记录
  error      TEXT,                        -- 错误信息
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (task_id) REFERENCES collection_tasks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_dirty_task ON dirty_records(task_id, created_at);

-- ------------------------------------------------------------
-- V2 新增：对账（InLong Audit 等价）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS collection_audit (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id       TEXT NOT NULL,
  audit_point   TEXT NOT NULL,            -- reader_in/reader_out/writer_in/writer_out
  log_ts        TEXT NOT NULL,            -- 分钟级时间戳
  count         INTEGER DEFAULT 0,
  bytes         INTEGER DEFAULT 0,
  delay_ms      INTEGER DEFAULT 0,
  FOREIGN KEY (task_id) REFERENCES collection_tasks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_audit_task ON collection_audit(task_id, log_ts, audit_point);

-- ------------------------------------------------------------
-- V2 新增：血缘（四级穿透溯源）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS data_lineage (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id      TEXT NOT NULL,
  source_id    TEXT NOT NULL,
  source_table TEXT,
  sink_table   TEXT NOT NULL,
  field_map    TEXT,                      -- JSON：字段映射
  layer        TEXT,                      -- ods/dwd/dws/ads
  scene_id     TEXT,
  doc_id       TEXT,                      -- 原始单据 ID
  created_at   TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_lineage_penetrate ON data_lineage(scene_id, layer);
CREATE INDEX IF NOT EXISTS idx_lineage_task ON data_lineage(task_id);

-- ------------------------------------------------------------
-- V2 新增：监管场景目录（11+4 场景）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS regulatory_scenes (
  id            TEXT PRIMARY KEY,         -- scene-investment-overdebt
  domain        TEXT NOT NULL,            -- investment/property/finance/accounting/salary/finance-risk/military/overseas/procurement/contract
  issue_code    TEXT,                     -- over_debt/irrelevant_diversification/salary_anomaly/...
  name          TEXT NOT NULL,
  description   TEXT,
  data_sources  TEXT,                     -- JSON：连接器 type 数组
  indicators    TEXT,                     -- JSON
  threshold     TEXT,                     -- JSON
  freq          TEXT,                     -- realtime/hourly/daily/monthly
  model_id      TEXT,
  enabled       INTEGER DEFAULT 1,
  created_at    TEXT DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------
-- V2 新增：监管模型 registry（198 模型）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS regulatory_models (
  id              TEXT PRIMARY KEY,       -- m-overdebt-001
  scene_id        TEXT NOT NULL,
  domain          TEXT NOT NULL,
  category        TEXT,                   -- rule/ml/agent
  name            TEXT NOT NULL,
  description     TEXT,
  rule_type       TEXT,                   -- enterprise/manager/employee/professional-manager
  indicator_count INTEGER,
  rule_dsl        TEXT,                   -- json-rules-engine DSL
  threshold_json  TEXT,
  schedule_cron   TEXT,
  status          TEXT,                   -- draft/testing/online/offline
  version         TEXT,
  owner_dept      TEXT,
  effectiveness   TEXT,
  created_at      TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (scene_id) REFERENCES regulatory_scenes(id)
);

-- ------------------------------------------------------------
-- V2 新增：模型指标
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS model_indicators (
  id          TEXT PRIMARY KEY,
  model_id    TEXT NOT NULL,
  name        TEXT NOT NULL,
  expr        TEXT,                       -- 指标公式 SQL/DSL
  data_source TEXT,                       -- 数据来源
  unit        TEXT,
  FOREIGN KEY (model_id) REFERENCES regulatory_models(id)
);

-- ------------------------------------------------------------
-- V2 新增：采集任务模板（开箱即用）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS collection_task_templates (
  id            TEXT PRIMARY KEY,
  scene_id      TEXT NOT NULL,
  name          TEXT NOT NULL,
  connector_type TEXT NOT NULL,
  stream        TEXT,
  schedule_cron TEXT,
  transform_pipeline TEXT,                -- JSON
  field_mapping TEXT,                     -- JSON
  FOREIGN KEY (scene_id) REFERENCES regulatory_scenes(id)
);

-- ------------------------------------------------------------
-- V2 新增：风险线索池（集中式线索池，T+5 销警）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS risk_clues (
  id            TEXT PRIMARY KEY,
  scene_id      TEXT NOT NULL,
  model_id      TEXT NOT NULL,
  entity_type   TEXT,                     -- person/org/project/supplier/contract/payment
  entity_id     TEXT,
  risk_level    TEXT,                     -- yellow/orange/red
  risk_value    TEXT,
  description   TEXT,
  status        TEXT DEFAULT 'pending',   -- pending/confirmed/dispatched/disposed/closed/transferred
  detected_at   TEXT NOT NULL,
  due_at        TEXT,                     -- T+5 工作日
  assigned_to   TEXT,
  org_code      TEXT,
  evidence_json TEXT,
  work_order_id TEXT,                     -- 关联 dispatch 工单
  FOREIGN KEY (scene_id) REFERENCES regulatory_scenes(id),
  FOREIGN KEY (model_id) REFERENCES regulatory_models(id)
);
CREATE INDEX IF NOT EXISTS idx_clue_status ON risk_clues(status, due_at);
CREATE INDEX IF NOT EXISTS idx_clue_scene ON risk_clues(scene_id, risk_level);

-- ------------------------------------------------------------
-- V2 新增：风险处置记录
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS risk_disposals (
  id            TEXT PRIMARY KEY,
  clue_id       TEXT NOT NULL,
  step          TEXT,                     -- receive/dispose/approve/close
  handler       TEXT NOT NULL,
  role_code     TEXT,
  comment       TEXT,
  attachment    TEXT,
  created_at    TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (clue_id) REFERENCES risk_clues(id)
);
CREATE INDEX IF NOT EXISTS idx_disp_clue ON risk_disposals(clue_id, created_at);

-- ------------------------------------------------------------
-- V2 新增：联查规则（预置 60+）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS linkage_rules (
  id           TEXT PRIMARY KEY,
  scene_id     TEXT NOT NULL,
  source_system TEXT,
  entry_point  TEXT,
  drill_path   TEXT,                      -- JSON
  target_layer TEXT,
  FOREIGN KEY (scene_id) REFERENCES regulatory_scenes(id)
);

-- ------------------------------------------------------------
-- V2 新增：监管岗位目录（30 集团岗 + 45 直属岗）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS regulatory_positions (
  code          TEXT PRIMARY KEY,
  layer         TEXT NOT NULL,            -- group/subsidiary
  category      TEXT NOT NULL,
  role_type     TEXT,                     -- handler/approver/receiver/disposer
  name          TEXT NOT NULL,
  data_scope    TEXT
);

-- ------------------------------------------------------------
-- V2 新增：模型级数据授权
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS position_model_grant (
  position_code TEXT NOT NULL,
  model_id      TEXT NOT NULL,
  permission    TEXT,                     -- view/dispose/approve
  PRIMARY KEY (position_code, model_id)
);

-- ------------------------------------------------------------
-- V2 新增：ODS 落地表（sink.ts 写入）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ods_generic (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id      TEXT NOT NULL,
  run_id       TEXT NOT NULL,
  stream       TEXT NOT NULL,             -- 来源 stream
  record_json  TEXT NOT NULL,             -- 原始记录 JSON
  ingested_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ods_stream ON ods_generic(stream, ingested_at);
CREATE INDEX IF NOT EXISTS idx_ods_task ON ods_generic(task_id, run_id);
