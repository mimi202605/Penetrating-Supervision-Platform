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
