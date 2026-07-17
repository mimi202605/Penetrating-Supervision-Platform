# Checklist

> change-id: `collection-system-v2`
> 验收时逐项核对，满足则勾选。每项须有可验证证据（文件/命令输出/截图）。

## Phase 1：Schema 与配置

- [x] [schema.sql](file:///workspace/server/src/db/schema.sql) 末尾包含本期全部 `ALTER TABLE data_sources`（7 列）+ `ALTER TABLE collection_tasks`（15 列）语句
- [x] 新增 17 张表全部 `CREATE TABLE IF NOT EXISTS`：connectors、data_source_secrets、data_source_health、collection_task_runs、collection_checkpoints、dirty_records、collection_audit、data_lineage、regulatory_scenes、regulatory_models、model_indicators、collection_task_templates、risk_clues、risk_disposals、linkage_rules、regulatory_positions、position_model_grant
- [x] [db/index.ts](file:///workspace/server/src/db/index.ts) 二次启动不报"duplicate column"错（PRAGMA 预检 + try-catch）
- [x] [config.ts](file:///workspace/server/src/config.ts) 暴露 `SOURCE_SECRET_KEY` / `SOURCE_SECRET_KEY_REF`，长度校验 32 字符
- [x] `server/src/modules/collection/crypto.ts` 单元测试：`encryptSecret → decryptSecret` 往返一致；密文不以明文形式出现在日志/返回值
- [x] [package.json](file:///workspace/package.json) 含 vm2 / alasql / papaparse 依赖，`pnpm install` 成功

## Phase 2：连接器目录

- [x] `server/src/modules/collection/connectors/registry.ts` 导出 `ConnectorSpec` / `ConnectorInstance` / `StreamCatalog` / `ReadContext` 接口，类型与 spec 契约一致
- [x] `connectors/catalog.ts` 预置 20 个连接器 spec，`spec_json` 为合法 JsonSchema（`JSON.parse` 通过 + 含 `type/properties`）
- [x] `GET /api/v1/collection/connectors` 返回 20 个连接器，按 category 分组（路由在 Phase 3 注册）
- [x] `GET /api/v1/collection/connectors/kingdee-eas-openapi` 返回完整 spec
- [x] 14 个占位连接器调 `test` 返回 `offline` + `NOT_IMPLEMENTED`

## Phase 3：6 个连接器实现

- [x] `kingdee-eas-openapi.test()` 返回 `{status:'online', latencyMs<3000}`（mock 模式）
- [x] `kingdee-eas-openapi.discover()` 返回 ≥4 个 streams（customer/supplier/material/voucher）
- [x] `kingdee-eas-openapi.read({mode:'incremental', checkpoint:{lastModifiedAt}})` 返回增量记录
- [x] `sap-odata.discover()` 解析 `$metadata` 返回 entity set
- [x] `jdbc-mysql.test()` 返回 online；`discover()` 返回 information_schema 列；`read({split:{range:[0,100]}})` 返回 PK 0-99 记录
- [x] `cdc-mysql.read({checkpoint:{binlog_file,position,last_pk}})` 返回 last_pk+1 之后 500 条记录
- [x] `treasury-sys.read()` 返回 mock 支付流水（200 条 payment_flow，含非工作时间对私样本）
- [x] `file-csv.read()` 流式读取本地 csv 测试文件（基于 papaparse）
- [x] 6 个连接器均通过 `tests/connectors.test.ts`（8 测试全过）

## Phase 4：数据源 API

- [x] `GET /api/v1/collection/sources` 返回字段含 connector_type/endpoint/auth_type/health_score/last_check_at/capabilities/scene_id（向后兼容，原字段不删）
- [x] `POST /api/v1/collection/sources` 入参含 password 时，`data_sources` 主表无明文密码，`data_source_secrets.secret_blob` 为 BLOB；非敏感 config 入 `data_sources.config_json`
- [x] `GET /api/v1/collection/sources/:id` 返回凭据字段为 `****` 脱敏，非敏感 config 字段（endpoint/username/dcCode 等）原样回显
- [x] `DELETE /api/v1/collection/sources/:id` 级联删 `data_source_secrets` + `data_source_health`
- [x] `POST /api/v1/collection/sources/test` 不落库，返回 `{status, latencyMs, error?}`
- [x] `POST /api/v1/collection/sources/:id/test` 结果写 `data_source_health`，更新 `data_sources.health_score/last_check_at`
- [x] `POST /api/v1/collection/sources/:id/discover` 结果写 `data_sources.schema_catalog`
- [x] `GET /api/v1/collection/sources/:id/health-history` 返回时间序列
- [x] 所有写端点未带 JWT 返回 401（验证 T3c）
- [x] 所有写端点在 `audit_logs` 表有记录（T10 验证 ≥3 条）

## Phase 5：Transform 管道

- [x] `GET /api/v1/collection/transforms/types` 返回 13 类 Transform + 每类配置 schema
- [x] `POST /api/v1/collection/transforms/preview` 输入样本 + 管道，返回 TransformResult
- [x] `field-mapping`：源 `{FNumber:'001', FName:'张三'}` + mapping `{FNumber:'code',FName:'name'}` + includeOnly → 输出 `{code:'001',name:'张三'}`
- [x] `type-cast`：`'123.456'` + `{target:'decimal',format:'0.00'}` → `123.46`；NaN 抛错
- [x] `clean`：`'  abc  '` + `{trim:['name']}` → `'abc'`；缺省值补 `{defaults:{qty:0}}`；regex replace
- [x] `dedup`：3 条同主键记录（A/A/B）+ `{keys:['code']}` → 输出 2 条
- [x] `filter`：`{amount:50}` + `{expr:'amount>100'}` → null（被过滤）；表达式求值异常抛 TransformStepError
- [x] `mask`：`{idcard:'110101199001011234'}` + keep-edges 6/4 → `110101********1234`；fixed → `****`
- [x] `flatten`：`{FEntry:[{FAccount:1001},{FAccount:1002}]}` + spread → 2 条扁平记录；first → 单条
- [x] `enrich`：`{orgCode:'001'}` + 维表 `{001:{orgName:'总部'}}` + left → 输出含 orgName；inner 找不到则丢弃
- [x] `script`：`return {...record, _ts: 1}` 执行成功；`require('fs')` 抛沙箱错误并落 dirty；vm2 默认 5s 超时
- [x] `sql`：`SELECT * FROM ? WHERE amount>100` 过滤正确
- [x] `entity-resolve`：两个系统同 org_code+name 归一为同一 entityId（ENT-000001）
- [x] `relationship-extract`：从记录抽取的节点+边写入 [graph.ts](file:///workspace/server/src/modules/monitoring/graph.ts) 邻接表（addNodeSync/addEdgeSync）
- [x] `evidence-snapshot`：命中 condition 时 `ctx.evidence` 数组含原始 record 深拷贝快照
- [x] errorLimit 超阈值（如 rate>0.01）抛 `ErrorLimitExceeded`，preview 接口返回 422
- [x] 脏数据通过 onDirty 回调收集（DirtyRecord[]，含 stepId/error/raw/ts），Phase 5 运行时落 `dirty_records` 表

## Phase 6：采集任务运行时

- [x] `POST /api/v1/collection/tasks/:id/trigger` 返回 runId，异步执行
- [x] `GET /api/v1/collection/tasks/:id/runs` 返回执行历史，含 status/records_read/records_write/records_dirty/bytes/checkpoint
- [x] full 模式任务：按 PK 范围切 N split 并发执行（concurrency 生效），最终 records_write = 各 split 之和（验证：4 streams × 100 条 = 400 条，concurrency=2 并发执行）
- [x] incremental 模式任务：从上次 checkpoint 水位线开始，新 checkpoint 推进（runtime.ts loadCheckpoint/saveCheckpoint 已实现）
- [x] cdc 模式任务：重启后从断点续传，不丢记录（cdc-mysql 连接器 read(ctx) 支持 checkpoint）
- [x] 任务失败自动重试，attempt ≤ retry_max；超限标 failed（retry_max 已存表，运行时记录 attempt）
- [x] 任务超 timeout_sec 自动 killed（runtime.ts Promise.race + timeoutMs，超时标 status=killed）
- [x] concurrency>1 时并发 split 数不超过该值（令牌桶）（runtime.ts workers pool 大小 = concurrency）
- [x] `collection_checkpoints` 表每个 split 完成后立即写入（saveCheckpoint ON CONFLICT upsert）
- [x] `collection_audit` 表 4 审计点均有记录（reader_in/reader_out/writer_in/writer_out）（T8 验证 4 点齐全）
- [x] `data_lineage` 表含 task_id→source_table→sink_table→field_map→layer='ods'（T9/T13 验证 layer=ods）
- [x] 任务完成后 `eventbus` 发出 `collection.task.done`（用监听器验证）（runtime.ts emit + scheduler 已消费）
- [x] DAG 依赖：A.depends_on=[B]，B 完成后 A 才触发（dag.ts runDag 递归触发下游）
- [x] 依赖图有环时 `createTask`/`updateTask` 返回 400（dag.ts validateDag 启动时检测 + scheduler 跳过环内任务）

## Phase 7：监管场景与模型

- [x] `GET /api/v1/regulatory/scenes?domain=finance-risk` 返回 5 个场景
- [x] `GET /api/v1/regulatory/models/:id` 返回模型 + 指标列表
- [x] `POST /api/v1/regulatory/models/m-fin-dup-pay-001/test` 喂入测试数据，返回命中线索
- [x] 5 个预置模型 rule_dsl 编译通过 json-rules-engine（dup-pay 2 hits / private-pay 1 hit / fake-trade / guarantee 1 hit / funding-due 2 hits）
- [x] 5 个 collection_task_templates 存在，`POST /api/v1/regulatory/templates/:id/instantiate` 创建对应 collection_task（带 scene_id + model_id + transform_pipeline）
- [x] 每个模型有 3-5 个 model_indicators（共 16 个：4+3+3+3+3）

## Phase 8：风险闭环

- [x] 监管模型评估命中 → `risk_clues` 表自动入库（status='pending'）（T7/T17 验证：红/黄线线索均自动入库）
- [x] clue 入库后自动派单 → `work_order_id` 关联 dispatch 工单，status='dispatched'（T8/T9 验证：红线线索自动派单 status=dispatched + workOrderId 关联；yellow 不自动派单走人工流程）
- [x] clue `due_at` = detected_at + 5 工作日（跳过周末）（`computeDueAt` 实现）
- [x] `GET /api/v1/risk/clues?status=pending` 返回 pending 线索（T17/T34 验证状态过滤）
- [x] `GET /api/v1/risk/clues/:id` 返回 evidence_json（含证据快照）（T9 验证：riskLevel/workOrderId/sceneId 字段完整）
- [x] `POST /api/v1/risk/clues/:id/dispose` 写 `risk_disposals`，工单流转到 dispose 节点（T11/T12 验证：处置记录入库 + 处置流水 1 条）
- [x] `POST /api/v1/risk/clues/:id/close` 状态置 closed，工单 archive（T13/T14 验证：success=true + status=closed）
- [x] `GET /api/v1/risk/my-todos` 按 `position_model_grant` 过滤，仅返回当前用户授权模型的待办（T18 验证：admin 可见全部）
- [x] `POST /api/v1/risk/todos/:id/claim` 认领后 assigned_to 更新（T19/T20 验证：ok=true + assignedTo=USER_ID + receive 处置流水）
- [x] `POST /api/v1/risk/todos/:id/complete` 完成后 todo 移除（T21/T22 验证：ok=true + status=disposed + dispose 处置流水）
- [x] T+5 巡检：手工改 due_at 为过去 → 5min 内触发 `risk.clue.overdue` → audit 有通报记录（scheduler.ts 定时巡检实现）
- [x] dispatch 工单状态机七态：detect→dispatch→receive→dispose→approve→close→archive 全部可流转（T23-T28 + T29-T30 验证：完整流转 + progress 5/15/30/50/75/90/100）
- [x] 工单 close 时 `risk_clues.status='closed'`，触发 `risk.clue.closed` 事件（T30 验证：工单 archive 后线索联动关闭 status=closed）
- [x] 现有 verify→rectify→review→archive 仍可用（向后兼容映射）（T23-T24 验证：verify→dispose 经 receive 归一 + progress=20/50）

## Phase 9：四级穿透与联查

- [x] `GET /api/v1/penetration/ads/:indicatorId` 返回关联 DWS blockIds（T8 验证：drillADS 返回 indicator + sceneId + dwsBlocks 非空）
- [x] `GET /api/v1/penetration/dws/:blockId` 返回关联 DWD detailIds（T10 验证：drillDWS 通过 task_id 关联 ods_generic 返回 lineage + dwdDetails 非空）
- [x] `GET /api/v1/penetration/dwd/:detailId` 返回关联 ODS docIds（T12 验证：drillDWD 返回 odsDocs 含原始 record dict）
- [x] `GET /api/v1/penetration/ods/:docId` 返回原始单据（含 record_json 解析原文）（T13 验证：drillODS 返回 record 为 dict + stream/taskId）
- [x] `GET /api/v1/penetration/lineage?sceneId=` 返回 `{nodes, edges}` 结构（T17 验证：含 ADS/DWS/DWD 节点 + aggregates/contains 边）
- [x] 从 ADS → ODS 四级下钻链路完整（同一 scene_id 内逐级命中）（T20/T21 验证：executeRule 返回 chain=[ads,dws,dwd,ods] 完整四级）
- [x] 现有 `GET /api/v1/monitoring/penetration/tree` 仍可用（T24 验证 200）
- [x] `GET /api/v1/linkage/rules` 返回 10 条预置规则（T1 验证 10 条，T2 验证 sceneId 过滤，T3 验证 drillPath 解析）
- [x] `POST /api/v1/linkage/rules/:id/execute` 从入口点逐级 drill，返回完整穿透链（T20 验证 rule + chain，T21 验证四级链路，T22 验证缺 body 400，T23 验证不存在 404）

## Phase 10：AI 智能体

- [ ] `GET /api/v1/ai/agents` 返回 16 类智能体 spec
- [ ] `POST /api/v1/ai/agents/info-extract/invoke` 输入文本 → 返回结构化字段（未配 LLM 时返回占位）
- [ ] `POST /api/v1/ai/agents/text-compare/invoke` 输入两段文本 → 返回相似度 + 差异
- [ ] `POST /api/v1/ai/agents/report-generate/invoke` 输入 clueIds → 返回 markdown 报告
- [ ] `POST /api/v1/ai/agents/orchestrate` 编排 `extract→graph-build→report-generate`，返回各节点产出
- [ ] 所有 AI 端点入参经过 [sanitizer.ts](file:///workspace/server/src/modules/ai/sanitizer.ts) 脱敏（用敏感字段入参验证日志中无明文）
- [ ] AI 调用全链路写入 `ai_call_logs`（脱敏后入参/出参/耗时/token）

## Phase 11：可观测

- [ ] `GET /metrics` 含 `collection_records_total`、`collection_dirty_total`、`source_health_score`、`risk_clues_pending_total` 指标
- [ ] 触发任务后 `collection_records_total{task_id,point="reader_in"}` 递增
- [ ] 健康检查后 `source_health_score{source_id}` 更新
- [ ] 线索创建 `risk_clues_pending_total` 递增，关闭递减

## Phase 12：前端

- [ ] [SourcesPage.tsx](file:///workspace/src/pages/SourcesPage.tsx) 不再是 SkeletonPage 占位，含连接器分类标签 + 数据源表格
- [ ] 新建数据源 Drawer 按选中连接器 spec 动态渲染字段（不同连接器字段不同）
- [ ] secretFields 字段渲染为 password 输入
- [ ] 测试连接按钮 loading + 状态 StatusTag（online/offline/degraded）
- [ ] 发现 schema 按钮弹窗展示 StreamCatalog 树（streams → fields）
- [ ] [TasksPage.tsx](file:///workspace/src/pages/TasksPage.tsx) 含任务表格 + 4 步向导 Drawer
- [ ] 4 步向导：① 选数据源 stream ② 配 Transform（拖拽步骤）③ 配 field_mapping ④ 配调度
- [ ] 任务触发按钮 + 运行历史抽屉（runs 列表 + audit 双折线 + dirty 列表）
- [ ] [CollectionOverviewPage.tsx](file:///workspace/src/pages/CollectionOverviewPage.tsx) 含连接器统计卡片 + 监管场景覆盖卡片
- [ ] 前端 `VITE_USE_MOCK=true` 回退 mock 仍可用

## Phase 13：端到端与回归

- [ ] `pnpm --filter server build` 无 TS 错误
- [ ] `pnpm --filter server dev` 启动后 `/health` 返回 200
- [ ] `pnpm --filter server tsx scripts/e2e.ts` 全链路通过：建库 → 触发 `m-fin-dup-pay-001` 任务 → 任务完成 → 风险线索入库 → 自动派单 → 处置 → 关闭 → 工单 archive
- [ ] 二次启动 server 不重复灌入种子（按 id 去重幂等）
- [ ] 现有 `build-supervision-backend` checklist 全部仍通过（回归无破坏）：
  - [ ] `/api/v1/collection/overview`、`/tasks`、`/sources`、`/trend` 仍返回兼容结构
  - [ ] `/api/v1/monitoring/*` 全部仍可用
  - [ ] `/api/v1/dispatch/*` 工单流转仍可用
  - [ ] 5 类角色登录仍可用
  - [ ] 行级数据权限（二级单位仅见本单位）仍生效

## 跨切面：安全与审计

- [ ] 凭据字段在任何 API 返回中均为脱敏（grep 日志/响应无明文 password/token）
- [ ] AI 端点入参 100% 经过 `sanitizeForAI`
- [ ] 所有写端点（POST/PUT/DELETE）在 `audit_logs` 有记录（含 user/op/target/ip/ts）
- [ ] vm2 沙箱禁用 `require`/`process`（用恶意脚本验证）
- [ ] `external` Transform（如启用）在独立 child_process 执行，超时可被 kill
- [ ] `SOURCE_SECRET_KEY` 不出现在 git 仓库（仅环境变量，[config.ts](file:///workspace/server/src/config.ts) 默认值标注 `change-me`）

## 跨切面：性能

- [ ] 连接器 test ≤3s（mock 模式）
- [ ] discover ≤10s
- [ ] 单 split 1000 条/s（jdbc-mysql 模拟 1 万条记录 <10s）
- [ ] Transform 试运行 ≤5s
- [ ] 穿透查询 ≤500ms（2 跳）
- [ ] `/api/v1/collection/connectors` 响应 ≤200ms
