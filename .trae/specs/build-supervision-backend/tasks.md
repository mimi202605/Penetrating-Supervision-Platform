# Tasks

> change-id: `build-supervision-backend`
> 实现顺序自上而下，标注 `[P]` 的子任务可与同级无依赖任务并行。

- [ ] Task 1: 后端工程骨架与依赖初始化
  - [ ] SubTask 1.1: 在 `/workspace/server/` 初始化 Node.js + TypeScript + Fastify 工程（`package.json`、`tsconfig.json`、`tsup`/`tsx` 开发运行）`[P]`
  - [ ] SubTask 1.2: 安装开源依赖（`fastify`、`@fastify/jwt`、`@fastify/cors`、`@fastify/rate-limit`、`better-sqlite3`、`json-rules-engine`、`node-cron`、`pino`、`zod`、`@types/*`）`[P]`
  - [ ] SubTask 1.3: 搭建 `server/src/app.ts`（Fastify 实例、插件注册、统一前缀 `/api/v1`）、`server/src/main.ts`（启动监听 7077）、`server/src/config.ts`（配置：端口/JWT 密钥/数据路径/信创预留位）
  - [ ] SubTask 1.4: 实现 `/health` 与 `/metrics`（Prometheus 文本格式）端点，注册全局请求日志 `pino`

- [ ] Task 2: 数据库与种子数据
  - [ ] SubTask 2.1: `server/src/db/schema.sql` 建表：`users`、`organizations`、`accounts`、`transactions`、`counterparties`、`risk_warnings`、`work_orders`、`rules`、`collection_tasks`、`data_sources`、`collection_logs`、`data_quality_issues`、`audit_logs`、`graph_nodes`、`graph_edges`（含 ODS/DWD/DWS/ADS 分层注释）`[P]`
  - [ ] SubTask 2.2: `server/src/db/index.ts` 封装 `better-sqlite3` 连接（WAL 模式、pragma 优化、自动建表）`[P]`
  - [ ] SubTask 2.3: `server/src/db/seed.ts` 将 `src/mock/index.ts` 数据迁入数据库（KPI 派生、centers、domains、riskWarnings、workOrders、collectionTasks、dataSources、graphNodes/Edges、penetrationTree→organizations+accounts+transactions、rules 初始规则集）
  - [ ] SubTask 2.4: `server/src/db/repository.ts` 通用仓储层（分页/过滤/排序辅助）

- [ ] Task 3: 统一技术中台 - 鉴权与网关
  - [ ] SubTask 3.1: `server/src/modules/platform/auth.ts`：JWT 登录/登出、`@fastify/jwt` 装饰器、5 类角色种子用户（admin/二级/核查/值班/领导）`[P]`
  - [ ] SubTask 3.2: `server/src/modules/platform/rbac.ts`：角色→权限映射、`requireRole` 钩子、行级数据权限中间件（按组织层级过滤）`[P]`
  - [ ] SubTask 3.3: `server/src/modules/platform/gateway.ts`：`@fastify/rate-limit`（120/min）、`@fastify/cors`、请求 ID、统一错误处理
  - [ ] SubTask 3.4: `server/src/modules/platform/audit.ts`：审计装饰器/钩子，记录查询/处置/登录到 `audit_logs`
  - [ ] SubTask 3.5: `server/src/modules/platform/eventbus.ts`：进程内 EventBus（`events.EventEmitter`），三中心异步解耦（规则命中→派单、采集异常→告警）

- [ ] Task 4: 数据采集中心模块
  - [ ] SubTask 4.1: `server/src/modules/collection/sources.ts`：数据源 CRUD、状态探测 `[P]`
  - [ ] SubTask 4.2: `server/src/modules/collection/tasks.ts`：采集任务 CRUD、全量/增量/CDC 三模式模拟执行器（写 collection_logs + 更新 throughput/lastStatus）
  - [ ] SubTask 4.3: `server/src/modules/collection/scheduler.ts`：`node-cron` 注册采集任务调度，失败触发 EventBus 告警 `[P]`
  - [ ] SubTask 4.4: `server/src/modules/collection/quality.ts`：Great Expectations 等价校验（非空/值域/长度/跨表一致/日期合法），写 `data_quality_issues`
  - [ ] SubTask 4.5: `server/src/modules/collection/routes.ts`：`/collection/sources`、`/collection/tasks`、`/collection/overview`、`/collection/trend` 路由

- [ ] Task 5: 智慧监督中心模块
  - [ ] SubTask 5.1: `server/src/modules/monitoring/rules.ts`：规则 CRUD、启用/停用、版本管理，规则 DSL 与 `json-rules-engine` Engine 桥接 `[P]`
  - [ ] SubTask 5.2: `server/src/modules/monitoring/rule-engine.ts`：规则推理服务，命中生成 `risk_warning` 并发 EventBus 告警 `[P]`
  - [ ] SubTask 5.3: `server/src/modules/monitoring/risk-warnings.ts`：风险预警列表/详情/筛选（level/status/domain/keyword）、状态更新
  - [ ] SubTask 5.4: `server/src/modules/monitoring/graph.ts`：图谱邻接表（内存 + SQLite 持久化）、二度/长路径遍历、资金流向检索
  - [ ] SubTask 5.5: `server/src/modules/monitoring/penetration.ts`：穿透树构建（组织层级 + 账户 + 流水），关键字检索（主体/资金/合同/项目）
  - [ ] SubTask 5.6: `server/src/modules/monitoring/analytics.ts`：监管态势聚合（Doris 等价：KPI、doughnut、healthBars、collectionTrend、financeTrend）
  - [ ] SubTask 5.7: `server/src/modules/monitoring/ai.ts`：自然语言查询占位接口（阶段 4 预留）
  - [ ] SubTask 5.8: `server/src/modules/monitoring/routes.ts`：`/monitoring/rules`、`/monitoring/risk-warnings`、`/monitoring/graph`、`/monitoring/penetration`、`/monitoring/overview`、`/monitoring/trend`、`/monitoring/finance/*` 路由

- [ ] Task 6: 调度指挥中心模块
  - [ ] SubTask 6.1: `server/src/modules/dispatch/workflow.ts`：工单状态机（verify→rectify→review→archive），流转/回退/超时转办 `[P]`
  - [ ] SubTask 6.2: `server/src/modules/dispatch/work-orders.ts`：工单 CRUD、派单、进度查询、与风险源关联 `[P]`
  - [ ] SubTask 6.3: `server/src/modules/dispatch/listeners.ts`：EventBus 消费者——high 风险预警自动创建工单并分派
  - [ ] SubTask 6.4: `server/src/modules/dispatch/dashboard.ts`：指挥大屏聚合（KPI、热力图、待办统计）
  - [ ] SubTask 6.5: `server/src/modules/dispatch/routes.ts`：`/dispatch/work-orders`、`/dispatch/dashboard`、`/dispatch/process` 路由

- [ ] Task 7: 系统模块（审计/设置）
  - [ ] SubTask 7.1: `server/src/modules/system/audit.ts`：审计日志查询（按用户/操作/时间） `[P]`
  - [ ] SubTask 7.2: `server/src/modules/system/settings.ts`：系统设置（主题/阈值/信创配置位） `[P]`
  - [ ] SubTask 7.3: `server/src/modules/system/routes.ts`：`/system/audit`、`/system/settings` 路由

- [ ] Task 8: 路由注册与启动编排
  - [ ] SubTask 8.1: `server/src/routes/index.ts` 汇总注册三中心 + 技术中台 + 系统路由
  - [ ] SubTask 8.2: `server/src/main.ts` 启动序列：建表→种子（首次）→注册调度→注册 EventBus 监听→监听端口
  - [ ] SubTask 8.3: `server/README.md` 简要运行说明（不主动创建文档除非必要——此处为后端运行入口说明，必要）

- [ ] Task 9: 前端 API 层衔接
  - [ ] SubTask 9.1: 改造 `src/api/index.ts`：基于 `import.meta.env.VITE_USE_MOCK` 分支，默认 `fetch(VITE_API_BASE + ...)`，回退 mock；新增 `login`、`advanceWorkOrder`、`evaluateRule`、`listAuditLogs` 等写操作方法 `[P]`
  - [ ] SubTask 9.2: `src/api/types.ts` 增补登录返回、工单流转入参、规则评估入参等类型（不破坏现有契约） `[P]`
  - [ ] SubTask 9.3: `vite.config.ts` 增加 `/api` 代理至 `http://localhost:7077`
  - [ ] SubTask 9.4: `package.json` 增加 `server`、`server:dev`、`dev:all`（concurrently 前后台）、`.env`/`.env.example`（`VITE_API_BASE`、`VITE_USE_MOCK`）
  - [ ] SubTask 9.5: 校验前端 17 个页面在真实后端模式下数据正常加载、交互（筛选/抽屉/工单流转）正常

- [ ] Task 10: 联调验证与文档
  - [ ] SubTask 10.1: 端到端联调：登录→总览→风险预警→派单→工单流转→大屏更新 闭环验证
  - [ ] SubTask 10.2: `VITE_USE_MOCK=true` 回退验证，确认无后端可独立运行
  - [ ] 10.3: 更新 `.trae/documents/技术架构.md` §1/§4/§11 反映后端落地（仅追加，不改前端契约）
  - [ ] SubTask 10.4: 编写后端启动与接口自测脚本（`server/scripts/smoke.sh` 或 `smoke.ts`，curl 关键接口）

# Task Dependencies
- Task 1 → Task 2（骨架先于数据库）
- Task 2 → Task 3/4/5/6/7（模块依赖仓储层）
- Task 3（EventBus）→ Task 5.2、Task 6.3（异步事件依赖）
- Task 5.2（规则引擎）→ Task 6.3（自动派单消费风险事件）
- Task 4/5/6/7 → Task 8（路由汇总）
- Task 8 → Task 9.5 → Task 10（前后台联调依赖后端就绪）
- 可并行：Task 4 与 Task 6（不同中心）、Task 3 与 Task 2（骨架与建表并行）
