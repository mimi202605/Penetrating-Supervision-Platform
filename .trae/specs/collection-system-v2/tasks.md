# Tasks

> change-id: `collection-system-v2`
> 实现顺序自上而下，标注 `[P]` 的子任务可与同级无依赖任务并行。
> 验证命令：`pnpm --filter server build && pnpm --filter server dev`（后端热重载）；前端 `pnpm dev`。

## Phase 1：Schema 扩展与配置基座

- [x] Task 1: schema 扩展与建表幂等
  - [x] SubTask 1.1: 在 [schema.sql](file:///workspace/server/src/db/schema.sql) 末尾追加本期全部 `ALTER TABLE data_sources` / `ALTER TABLE collection_tasks` 语句，每条 `ALTER` 用 `/* v2: ignore-duplicate-column */` 注释包裹；`CREATE TABLE IF NOT EXISTS` 新增 13 张表（connectors、data_source_secrets、data_source_health、collection_task_runs、collection_checkpoints、dirty_records、collection_audit、data_lineage、regulatory_scenes、regulatory_models、model_indicators、collection_task_templates、risk_clues、risk_disposals、linkage_rules、regulatory_positions、position_model_grant）
  - [x] SubTask 1.2: [db/index.ts](file:///workspace/server/src/db/index.ts) 加载 schema 时对 `ALTER TABLE ADD COLUMN` 做 `PRAGMA table_info` 预检，已存在列跳过；事务包裹 `[P]`
  - [x] SubTask 1.3: [config.ts](file:///workspace/server/src/config.ts) 新增 `SOURCE_SECRET_KEY`（默认 `dev-insecure-key-change-me-32byt`，长度校验 32 字符）、`SOURCE_SECRET_KEY_REF`（环境变量名，默认 `SOURCE_SECRET_KEY`）
  - [x] SubTask 1.4: 新增 `server/src/modules/collection/crypto.ts`：`encryptSecret(obj, keyRef)` / `decryptSecret(blob, keyRef)`，AES-256-GCM，IV 随机 12 字节前置存储；单元测试覆盖加解密往返 `[P]`

- [x] Task 2: 依赖安装
  - [x] SubTask 2.1: [package.json](file:///workspace/package.json) server 依赖新增 `vm2`（MIT，脚本沙箱）、`alasql`（MIT，SQL Transform）、`papaparse`（MIT，CSV 解析）、`@types/papaparse`；版本固定，校验开源协议 `[P]`

## Phase 2：连接器目录与 6 个连接器

- [x] Task 3: 连接器 registry
  - [x] SubTask 3.1: 新建 `server/src/modules/collection/connectors/registry.ts`：定义 `ConnectorSpec` / `ConnectorInstance` / `StreamCatalog` / `ReadContext` 接口（按 spec 契约）；`REGISTRY: Map<string, ConnectorInstance>`；`getConnector(type)` / `listConnectors()` `[P]`
  - [x] SubTask 3.2: 新建 `server/src/modules/collection/connectors/catalog.ts`：预置全部 20 个连接器 spec 元数据（6 个实现 + 14 个占位），spec_json 为合法 JsonSchema `[P]`
  - [x] SubTask 3.3: 新建 `server/src/modules/collection/connectors/base.ts`：`NotImplementedConnector` 基类，test/discover/read 抛 `NOT_IMPLEMENTED`，14 个占位连接器继承

- [x] Task 4: 6 个连接器实现
  - [x] SubTask 4.1: `connectors/kingdee-eas-openapi.ts`：test 走 `/eas/v2/auth/login`（mock 模式直接返回 token）；discover 返回主数据 streams（customer/supplier/material/voucher）；read 按 `lastModifiedAt` 增量分页 `[P]`
  - [x] SubTask 4.2: `connectors/sap-odata.ts`：test 走 `$metadata`；discover 解析 entity set；read 走 `$filter` + `$skiptoken` 分页 `[P]`
  - [x] SubTask 4.3: `connectors/jdbc-mysql.ts`：基于 better-sqlite3 模拟（接口对齐 mysql2）；test `SELECT 1`；discover `information_schema`；read 按 PK 范围 split `[P]`
  - [x] SubTask 4.4: `connectors/cdc-mysql.ts`：test `SHOW MASTER STATUS`（mock）；read 模拟 binlog 位点 → 按 id 范围增量拉取，checkpoint 记录 `{binlog_file, position, last_pk}` `[P]`
  - [x] SubTask 4.5: `connectors/treasury-sys.ts`：REST mock；test `/health`；discover 静态 catalog（payment_flow/account_balance/bill_info/guarantee_info）；read 生成 mock 数据流 `[P]`
  - [x] SubTask 4.6: `connectors/file-csv.ts`：基于 papaparse；test `fs.access`；discover 首行解析列；read 流式读取 + split 按行范围

## Phase 3：数据源 API 升级

- [x] Task 5: sources.ts 升级
  - [x] SubTask 5.1: [sources.ts](file:///workspace/server/src/modules/collection/sources.ts) `listSources` 扩展返回 `connector_type` / `endpoint` / `auth_type` / `health_score` / `last_check_at` / `capabilities` / `scene_id`（保持现有字段不删）
  - [x] SubTask 5.2: `createSource` / `updateSource`：凭据字段（spec.secretFields 声明的）调 `crypto.encryptSecret` 入 `data_source_secrets`，主表不存敏感字段；非敏感字段入 `data_sources.config_json` `[P]`
  - [x] SubTask 5.3: `getSource` 返回时凭据字段一律脱敏（如 password → `****`），新增 `maskSecrets()` 工具
  - [x] SubTask 5.4: `deleteSource` 级联删 `data_source_secrets` + `data_source_health`（FK ON DELETE CASCADE 已配）
  - [x] SubTask 5.5: `testSource(config)` 调 `getConnector(type).test(config)`，结果不入库 `[P]`
  - [x] SubTask 5.6: `testSourceById(id)` 从库读 + 解密凭据 + 调 test，结果写 `data_source_health` + 更新 `data_sources.health_score/last_check_at` `[P]`
  - [x] SubTask 5.7: `discoverSource(id)` 调 `getConnector(type).discover(config)`，结果写 `data_sources.schema_catalog` `[P]`
  - [x] SubTask 5.8: `getHealthHistory(id, range)` 返回 `data_source_health` 时间序列

- [x] Task 6: collection/routes.ts 扩展
  - [x] SubTask 6.1: 在 [routes.ts](file:///workspace/server/src/modules/collection/routes.ts) 注册新端点：`GET /collection/connectors`、`GET /collection/connectors/:type`、`POST /collection/sources/test`、`POST /collection/sources/:id/test`、`POST /collection/sources/:id/discover`、`GET /collection/sources/:id/health-history`、`POST /collection/sources/:id/health-check` `[P]`
  - [x] SubTask 6.2: 所有写端点经 `requireRole(['admin','group_admin'])` + `recordAudit()` 装饰器 `[P]`

> Phase 3 验证：18/18 端到端 API 测试通过（[scripts/test-phase3.sh](file:///workspace/server/scripts/test-phase3.sh)），含凭据加密入库/脱敏回显/级联删除/审计日志/401 鉴权/占位连接器 NOT_IMPLEMENTED。schema.sql 新增 `config_json` 列存非敏感配置。

## Phase 4：Transform 管道

- [x] Task 7: Transform 引擎与 13 类 Transform
  - [x] SubTask 7.1: 新建 `server/src/modules/collection/transform/engine.ts`：流式 `runTransformPipeline(input, pipeline, ctx, onDirty)`，按 steps 顺序应用；维护 dirtyCount、errorLimit 阈值检查；超阈值抛 `ErrorLimitExceeded` `[P]`
  - [x] SubTask 7.2: 新建 `transform/types.ts`：13 类 Transform 的统一签名 `(record, state, config, ctx) => ApplyResult`；`TransformType` 联合类型；`TransformStepError` / `ErrorLimitExceeded` 异常类 `[P]`
  - [x] SubTask 7.3: 实现 5 类基础：`field-mapping`（重命名/筛选 includeOnly）、`type-cast`（number/boolean/date/decimal + format）、`clean`（trim/defaults/regex replace）、`dedup`（主键去重内存窗口）、`filter`（expr-eval 表达式过滤） `[P]`
  - [x] SubTask 7.4: 实现 3 类脱敏/扁平/富化：`mask`（fixed/keep-edges 策略）、`flatten`（嵌套数组 spread/first，金蝶 FEntry）、`enrich`（维表关联 left/inner）
  - [x] SubTask 7.5: 实现 2 类脚本：`script`（vm2 沙箱，禁 require/process，5s 超时）、`sql`（alasql SELECT * FROM ? WHERE expr） `[P]`
  - [x] SubTask 7.6: 实现 3 类监管专用：`entity-resolve`（按 orgCode+name 归一为 ENT-XXXXXX）、`relationship-extract`（节点+边写入 [graph.ts](file:///workspace/server/src/modules/monitoring/graph.ts) 通过 addNodeSync/addEdgeSync）、`evidence-snapshot`（命中 condition 时冻结 record 快照到 `ctx.evidence` 数组） `[P]`
  - [x] SubTask 7.7: 新建 `transform/registry.ts`：`getTransformHandler(type)` 路由；`listTransformTypes()` 返回 13 类 + 配置 schema（供前端表单）
  - [x] SubTask 7.8: `transform/preview.ts`：`runPreview(sample, pipeline, ctx?)` 同步返回 TransformEngineResult，不入库
  - [x] SubTask 7.9: routes 注册 `GET /collection/transforms/types`、`POST /collection/transforms/preview`（[transform/routes.ts](file:///workspace/server/src/modules/collection/transform/routes.ts)）

> Phase 4 验证：21 个 Transform 单元测试 + 10 个端到端 API 测试全部通过（[tests/transform.test.ts](file:///workspace/server/tests/transform.test.ts) + [scripts/test-phase4.sh](file:///workspace/server/scripts/test-phase4.sh)）；TS 检查通过；graph.ts 新增 addNodeSync/addEdgeSync 公共 API。

## Phase 5：采集任务运行时升级

- [x] Task 8: runtime.ts 核心运行时
  - [x] SubTask 8.1: 新建 `server/src/modules/collection/runtime.ts`：`CollectionRuntime.runTask(taskId, opts)`，按 spec 契约 10 步实现 `[P]`
  - [x] SubTask 8.2: split 策略：full → 按 PK MIN/MAX 切 N 片（concurrency 控制）；incremental → 单 split 从水位线开始；cdc → 单 split 从 checkpoint 开始 `[P]`
  - [x] SubTask 8.3: 凭据解密注入 connector config；连接器实例化失败立即 fail `[P]`
  - [x] SubTask 8.4: 每个 split 流：`for await (const rec of connector.read(ctx))` → `transformEngine.run()`（流式 transform，非批量） → sink 写入 ODS/DWD 表（better-sqlite3 事务批写）
  - [x] SubTask 8.5: 每 split 完成立即写 `collection_checkpoints(task_id, shard_id, state)`；job 失败时已写 checkpoint 保留
  - [x] SubTask 8.6: 重试：catch 异常 → attempt++ ≤ retry_max → 指数退避 `retry_interval_sec * 2^attempt`；超限标 failed
  - [x] SubTask 8.7: 超时：`timeout_sec` 用 `Promise.race` + `AbortController`，超时标 killed
  - [x] SubTask 8.8: 限流：令牌桶 `concurrency` 限制并发 split 数
  - [x] SubTask 8.9: 写 `collection_task_runs`（started_at/finished_at/records_read/write/dirty/bytes/checkpoint/error） `[P]`
  - [x] SubTask 8.10: 写 `collection_audit`（4 审计点：reader_in/reader_out/writer_in/writer_out） `[P]`
  - [x] SubTask 8.11: 写 `data_lineage`（task_id→source_table→sink_table→field_map→layer=ods） `[P]`
  - [x] SubTask 8.12: 任务完成后 `eventbus.emit('collection.task.done', { taskId, sceneId, modelId, runId })`，触发监管模型评估

- [x] Task 9: scheduler.ts 升级
  - [x] SubTask 9.1: [scheduler.ts](file:///workspace/server/src/modules/collection/scheduler.ts) 保留 node-cron 触发；触发后调 `runtime.runTask` 而非旧的随机执行器 `[P]`
  - [x] SubTask 9.2: 新增 `dag.ts`：`topoSort(tasks)` 按 `depends_on` 拓扑排序；`runDag(rootTaskId)` 串行触发依赖链 `[P]`
  - [x] SubTask 9.3: 优先级队列：`pendingQueue` 按 priority desc 排序，并发上限可配（默认 4）
  - [x] SubTask 9.4: `startScheduler()` 启动时加载所有 enabled=1 任务注册 cron；`stopScheduler()` 优雅停止
  - [x] SubTask 9.5: 定时巡检线程：每 5min 扫 `risk_clues` 中 `due_at < now AND status='pending'` → 触发 T+5 通报事件

- [x] Task 10: tasks.ts 升级
  - [x] SubTask 10.1: [tasks.ts](file:///workspace/server/src/modules/collection/tasks.ts) `listTasks` 扩展返回全部新字段 `[P]`
  - [x] SubTask 10.2: `createTask` / `updateTask` 校验 `transform_pipeline` JSON 合法性（调 transform registry 校验 step type）、`depends_on` 不形成环（调 dag.ts）
  - [x] SubTask 10.3: `triggerTask(id)` 调 `runtime.runTask(id)` 异步执行，立即返回 runId
  - [x] SubTask 10.4: `getRuns(taskId)` 分页返回 `collection_task_runs`
  - [x] SubTask 10.5: `getCheckpoint(taskId)` 返回 `collection_checkpoints` 全部分片
  - [x] SubTask 10.6: `getDirtyRecords(taskId, runId)` 返回 `dirty_records`
  - [x] SubTask 10.7: `getAudit(taskId, range)` 返回 `collection_audit` 时间序列
  - [x] SubTask 10.8: routes 注册新端点（trigger/runs/checkpoints/dirty/audit/lineage/quality）

- [x] Task 11: quality.ts 与 sink 落地
  - [x] SubTask 11.1: [quality.ts](file:///workspace/server/src/modules/collection/quality.ts) 扩展为 transform 后置钩子：sink 写入后调 `runQualityCheck(sceneId, records)` `[P]`
  - [x] SubTask 11.2: 新建 `server/src/modules/collection/sink.ts`：`writeToODS(table, records, mode)` 事务批写；`writeToDWD(table, records, mapping)` 字段映射后写；ODS/DWD 表名约定 `ods_<stream>` / `dwd_<stream>`

> Phase 5 验证：18/18 端到端 API 测试通过（[scripts/test-phase5.sh](file:///workspace/server/scripts/test-phase5.sh)），全部 HTTP 端点验证（绕过 sqlite3 WAL disk I/O 问题）。400 条记录读写（4 streams × 100 条）、4 审计点齐全、4 条 data_lineage（layer=ods）、4 个 checkpoints（含 shard_id）、100 条质量校验问题（5 类规则 × 采样 100 条命中）。runtime.ts 中文 mode→英文映射（全量→full/增量→incremental/CDC→cdc）修复，连接器 ctx.stream 而非 streamName。tasks.ts 新增 taskRowToApi 解析 transformPipeline/dependsOn JSON。45 单元测试无回归。

## Phase 6：监管场景与模型 registry

- [x] Task 12: regulatory 模块
  - [x] SubTask 12.1: 新建 `server/src/modules/regulatory/scenes.ts`：CRUD + `listByDomain`、`getWithModel` `[P]`
  - [x] SubTask 12.2: 新建 `server/src/modules/regulatory/models.ts`：CRUD + `testModel(id)` 编译 rule_dsl 为 json-rules-engine Engine，跑全量数据返回命中 `[P]`
  - [x] SubTask 12.3: 新建 `server/src/modules/regulatory/indicators.ts`：CRUD `[P]`
  - [x] SubTask 12.4: 新建 `server/src/modules/regulatory/templates.ts`：CRUD + `instantiate(templateId)` 创建 collection_task
  - [x] SubTask 12.5: 新建 `server/src/modules/regulatory/routes.ts`：注册全部 `/regulatory/*` 端点 `[P]`
  - [x] SubTask 12.6: [app.ts](file:///workspace/server/src/app.ts) 注册 regulatory 路由前缀

- [x] Task 13: 预置 5 个监管模型 + 5 个采集任务模板
  - [x] SubTask 13.1: [seed-regulatory.ts](file:///workspace/server/src/db/seed-regulatory.ts) 独立模块灌入：5 个 regulatory_scenes（finance-risk 域）+ 5 个 regulatory_models + 各模型 3-5 个 model_indicators + 5 个 collection_task_templates；[main.ts](file:///workspace/server/src/main.ts) initDb 在 seedDatabase 后调用 seedRegulatory `[P]`
  - [x] 13.2: 模型 1 `m-fin-dup-pay-001`：rule_dsl 检测同收款方同金额同日多笔；阈值 yellow≥2/orange≥5/red≥10 `[P]`
  - [x] 13.3: 模型 2 `m-fin-private-pay-001`：非工作时间（22:00-06:00）+ 对私 + 金额>5万；阈值 yellow≥5万/orange≥20万/red≥100万 `[P]`
  - [x] 13.4: 模型 3 `m-fin-fake-trade-001`：资金回流（A→B→A）+ 无商业实质；阈值 yellow/orange/red 按笔数 `[P]`
  - [x] 13.5: 模型 4 `m-fin-guarantee-001`：担保金额 / 持股比例 > 1；阈值 yellow>1/orange>2/red>5 `[P]`
  - [x] 13.6: 模型 5 `m-fin-funding-due-001`：融资到期 30/7/1 天内；阈值 yellow 30/orange 7/red 1 `[P]`

> Phase 6 验证：22/22 端到端 API 测试通过（[scripts/test-phase6.sh](file:///workspace/server/scripts/test-phase6.sh)），含 5 场景过滤、5 模型 rule_dsl 编译并试运行命中、16 指标分布（4+3+3+3+3）、5 模板实例化创建 collection_task（带 scene_id+model_id+transform_pipeline）、404/400/401 错误路径。

## Phase 7：风险闭环运营

- [ ] Task 14: risk 模块
  - [ ] SubTask 14.1: 新建 `server/src/modules/risk/clues.ts`：CRUD + `listByStatus` / `listByOrg` / `listByScene`；`dispatchClue(id)` 创建 dispatch 工单并回写 `work_order_id` `[P]`
  - [ ] SubTask 14.2: 新建 `server/src/modules/risk/disposals.ts`：`record(clueId, step, handler, comment)`；`listByClue` `[P]`
  - [ ] SubTask 14.3: 新建 `server/src/modules/risk/todos.ts`：`myTodos(userId)` 按 `assigned_to` + `position_model_grant` 过滤；`claim(todoId, userId)` / `complete(todoId, result)` `[P]`
  - [ ] SubTask 14.4: 新建 `server/src/modules/risk/listeners.ts`：订阅 `monitoring.rule.hit` 事件 → 自动写 `risk_clues`（risk_level 按 threshold_json 推断、due_at = now + 5 工作日、evidence_json 从 rule hit payload 取） → `eventbus.emit('risk.clue.created')` `[P]`
  - [ ] SubTask 14.5: 订阅 `risk.clue.created` → 调 `dispatchClue` 自动派单（按 org_code + scene_id 路由到对应岗位） `[P]`
  - [ ] SubTask 14.6: T+5 巡检：`risk_clues` 中 `due_at < now AND status IN ('pending','dispatched')` → `eventbus.emit('risk.clue.overdue')` → 自动通报（写 audit + 推送 dispatch 大屏）
  - [ ] SubTask 14.7: 新建 `server/src/modules/risk/routes.ts`：注册全部 `/risk/*` 端点
  - [ ] SubTask 14.8: [app.ts](file:///workspace/server/src/app.ts) 注册 risk 路由前缀

- [ ] Task 15: dispatch 工作流扩展
  - [ ] SubTask 15.1: [workflow.ts](file:///workspace/server/src/modules/dispatch/workflow.ts) 状态机扩展为七态：`detect→dispatch→receive→dispose→approve→close→archive`；保留原 `verify→rectify→review→archive` 映射（向后兼容）
  - [ ] SubTask 15.2: `advanceWorkOrder(id, step, comment)` 校验状态转移合法性
  - [ ] SubTask 15.3: 工单 close 时回写 `risk_clues.status='closed'`；archive 时回写 `risk_clues.status='closed'` + 触发规则反哺 `eventbus.emit('risk.clue.closed', {clueId, modelId})`

- [ ] Task 16: 监管模型评估桥接
  - [ ] SubTask 16.1: [rule-engine.ts](file:///workspace/server/src/modules/monitoring/rule-engine.ts) 扩展 `evaluateRegulatoryModel(modelId, runId)`：从 collection_task_runs 取本次采集数据 → 转 json-rules-engine facts → 命中后 `eventbus.emit('monitoring.rule.hit', {modelId, sceneId, evidence, riskLevel})` `[P]`
  - [ ] SubTask 16.2: 订阅 `collection.task.done` → 自动调 `evaluateRegulatoryModel(task.modelId, runId)` `[P]`
  - [ ] SubTask 16.3: rule-engine 现有 `evaluateRule` 保持不变，新方法独立导出

## Phase 8：四级穿透与联查

- [x] Task 17: penetration 升级
  - [x] SubTask 17.1: [penetration.ts](file:///workspace/server/src/modules/monitoring/penetration.ts) 新增 `drillADS(indicatorId)` → 返回关联 DWS blockIds（基于 model_indicators → regulatory_models.scene_id → data_lineage.sink_table 关联）
  - [x] SubTask 17.2: `drillDWS(blockId)` → 返回关联 DWD detailIds（通过 task_id 关联 ods_generic，因 ods_generic.stream 与 sink_table 命名不一定相等）
  - [x] SubTask 17.3: `drillDWD(detailId)` → 返回关联 ODS docIds（detailId = ods_generic.id，返回 record_json 解析后的原始记录）
  - [x] SubTask 17.4: `drillODS(docId)` → 返回原始单据（含 record_json 解析的原文） `[P]`
  - [x] SubTask 17.5: `getLineageGraph(sceneId)` → 返回 `{nodes, edges}` 供前端图谱渲染（ADS/DWS/DWD 三类节点 + aggregates/contains 边） `[P]`
  - [x] SubTask 17.6: routes 注册 `/penetration/ads/:id`、`/dws/:id`、`/dwd/:id`、`/ods/:id`、`/lineage` `[P]`
  - [x] SubTask 17.7: 现有 `/monitoring/penetration/tree` 保持不变（T24/T25 验证 200）

- [x] Task 18: linkage 联查
  - [x] SubTask 18.1: 新建 `server/src/modules/regulatory/linkage.ts`：`listRules(sceneId?)` / `getRule(id)` / `executeRule(id, entryEntity)` 按 drill_path 逐级调 penetration drill 方法 `[P]`
  - [x] SubTask 18.2: [seed-regulatory.ts](file:///workspace/server/src/db/seed-regulatory.ts) 预置 10 条 linkage_rules（资金管理 5 + 投资管理 3 + 合同 2，复用 finance-risk 场景）
  - [x] SubTask 18.3: routes 注册 `/linkage/rules`、`/linkage/rules/:id`、`/linkage/rules/:id/execute` `[P]`

> Phase 8 验证：29/29 端到端 API 测试通过（[scripts/test-phase8.sh](file:///workspace/server/scripts/test-phase8.sh)），9 部分覆盖：联查规则列表/过滤/详情、触发采集任务写入 data_lineage+ods_generic、四级下钻 ads→dws→dwd→ods（含 task_id 关联修复 stream/sink_table 命名不一致问题）、lineage 图谱（ADS/DWS/DWD 节点 + aggregates/contains 边）、linkage 完整四级穿透链执行、错误路径 404/400/非整数、向后兼容（/monitoring/penetration/tree + /search 仍 200）、未鉴权 401。关键修复：drillDWS 与 getLineageGraph 通过 task_id 关联 ods_generic（而非 stream=sink_table），因 runtime 写入 ods_generic.stream 为原始 stream 名（如 payment_flow），而 data_lineage.sink_table 为 sink_target 或 ods_<stream>（如 ods_payment_flow），两者命名不一致。

## Phase 9：AI 智能体编排

- [ ] Task 19: agents 模块
  - [ ] SubTask 19.1: 新建 `server/src/modules/ai/agents/registry.ts`：16 类智能体 spec 元数据（id/category/capabilities/input/protocol/model）；`listAgents()` / `getAgent(id)` `[P]`
  - [ ] SubTask 19.2: 新建 `agents/info-extract.ts`：输入文本/表格 → 调 [ai-service.ts](file:///workspace/server/src/modules/ai/ai-service.ts) → 输出结构化字段；未配 LLM 时返回占位结构 `[P]`
  - [ ] SubTask 19.3: 新建 `agents/text-compare.ts`：输入两段文本 → 输出相似度 + 差异片段（标书查重/阴阳合同）；本地用 cosine 相似度 + diff，可选 LLM 增强 `[P]`
  - [ ] SubTask 19.4: 新建 `agents/report-generate.ts`：输入 clueIds + 模板 → 输出风险报告 markdown；调 LLM 或模板拼接 `[P]`
  - [ ] SubTask 19.5: 新建 `agents/orchestrator.ts`：`orchestrate(workflow)` LangGraph 等价状态图；首批预置 1 个工作流：`extract→graph-build→report-generate`（合同审查场景）
  - [ ] SubTask 19.6: routes 注册 `/ai/agents`、`/ai/agents/:id/invoke`、`/ai/agents/orchestrate`；强制 `sanitizeForAI` 预处理入参 `[P]`
  - [ ] SubSubTask 19.7: [routes.ts](file:///workspace/server/src/modules/ai/routes.ts) 注册 agents 子路由

## Phase 10：可观测、前端、联调

- [ ] Task 20: health 指标扩展
  - [ ] SubTask 20.1: [health.ts](file:///workspace/server/src/health.ts) 新增指标 `collection_records_total{task_id,point}`（Counter）、`collection_dirty_total{task_id}`（Counter）、`source_health_score{source_id}`（Gauge）、`risk_clues_pending_total`（Gauge） `[P]`
  - [ ] SubTask 20.2: runtime.ts 在 4 审计点 inc `collection_records_total`；dirty 写入时 inc `collection_dirty_total`；健康检查时 set `source_health_score`；线索创建时 inc、关闭时 dec `risk_clues_pending_total`

- [ ] Task 21: 前端 API 层
  - [ ] SubTask 21.1: [src/api/types.ts](file:///workspace/src/api/types.ts) 追加类型：`Connector` / `StreamCatalog` / `TransformType` / `TransformPipeline` / `CollectionTaskRun` / `Checkpoint` / `DirtyRecord` / `AuditPoint` / `RegulatoryScene` / `RegulatoryModel` / `RiskClue` / `RiskDisposal` / `LinkageRule` / `Agent` / `PenetrationLayer`（不破坏现有类型） `[P]`
  - [ ] SubTask 21.2: [src/api/index.ts](file:///workspace/src/api/index.ts) 追加方法：`listConnectors` / `testSource` / `discoverSource` / `listTransformTypes` / `previewTransform` / `listRuns` / `triggerTask` / `listRegulatoryScenes` / `testModel` / `listClues` / `dispatchClue` / `disposeClue` / `closeClue` / `myTodos` / `drillPenetration` / `getLineage` / `listAgents` / `invokeAgent` / `orchestrateAgents` `[P]`

- [ ] Task 22: 前端页面升级
  - [ ] SubTask 22.1: [SourcesPage.tsx](file:///workspace/src/pages/SourcesPage.tsx)：连接器目录分类标签（ERP/DB/File/MQ/SaaS）+ 数据源列表表格（含健康度 Progress 条）+ 新建 Drawer（按 spec.connectionSpec 动态渲染表单字段，secretFields 字段 type=password）+ 测试连接按钮（loading + 状态 StatusTag）+ 发现 schema 按钮（弹窗展示 StreamCatalog 树） `[P]`
  - [ ] SubTask 22.2: [TasksPage.tsx](file:///workspace/src/pages/TasksPage.tsx)：任务列表表格（运行状态/进度/吞吐量/脏数据数）+ 4 步向导 Drawer（① 选数据源 stream ② 配 Transform 管道拖拽步骤 ③ 配 field_mapping 表格 ④ 配调度 cron/并发/重试/超时）+ 触发按钮 + 运行历史抽屉（runs 列表 + audit 双折线 + dirty 列表） `[P]`
  - [ ] SubTask 22.3: [CollectionOverviewPage.tsx](file:///workspace/src/pages/CollectionOverviewPage.tsx)：补连接器统计卡片（按 category 分组计数）+ 监管场景覆盖卡片（按 domain 分组计数 + 已上线模型数） `[P]`

- [ ] Task 23: 种子数据与端到端验证
  - [ ] SubTask 23.1: [seed.ts](file:///workspace/server/src/db/seed.ts) 追加：6 个 connectors、3 个 data_sources（treasury-sys/jdbc-mysql/file-csv 各一）、3 个 collection_tasks（绑定 scene_id+model_id）、10 条 linkage_rules、30 个 regulatory_positions（集团岗）+ 45 个（直属岗） `[P]`
  - [ ] SubTask 23.2: 端到端脚本 `server/scripts/e2e.ts`：建库 → 触发 `m-fin-dup-pay-001` 关联任务 → 等待完成 → 校验 risk_clues 入库 → 派单 → 处置 → 关闭；断言全链路状态
  - [ ] SubTask 23.3: [main.ts](file:///workspace/server/src/main.ts) 启动序列追加：注册 risk listeners / regulatory 路由 / agents 路由

## 验证命令

```bash
# 后端
pnpm --filter server build && pnpm --filter server dev
curl http://localhost:7077/health
curl http://localhost:7077/api/v1/collection/connectors -H "Authorization: Bearer <jwt>"

# 前端
pnpm dev
# 浏览器访问 http://localhost:5173/sources、/tasks、/collection

# 端到端
pnpm --filter server tsx scripts/e2e.ts
```
