# 穿透式监管平台系统后台构建 Spec

> change-id: `build-supervision-backend`
> 对齐文档：`大型央企集团穿透式监管平台（一平台三中心）5年落地实操方案.md`、`.trae/documents/PRD.md`、`.trae/documents/技术架构.md`
> 编制日期：2026-07-17

---

## Why

现有工程为纯前端（React 18 + TS + Vite），所有数据由 `src/mock/index.ts` 与 `src/api/index.ts`（直接返回 mock）提供，无真实后端，无法支撑“一平台三中心”的业务闭环与穿透式监管能力。

5 年落地实操方案明确了“数据采集中心 / 智慧监督中心 / 调度指挥中心 + 技术中台”的架构与开源技术选型（Airbyte、DataX、Debezium、Doris、NebulaGraph、Drools、LangChain、Flowable、RocketMQ、APISIX、Keycloak 等）。本期目标：**构建一套可运行、可对接前端的系统后台**，落地三中心核心能力与统一技术中台，并把前端从 Mock 切换到真实 API，实现前后台完整衔接。

> 落地策略：方案中的分布式组件（Doris/NebulaGraph/Flowable/RocketMQ 等）在本沙箱环境以**同语义的轻量开源实现**承载（见“技术映射”），保证业务模型、API 契约、数据流转与方案一致，可平滑替换为生产级分布式组件。

---

## What Changes

### 新增：系统后台（`/workspace/server/`）
- 新建 Node.js 18 + TypeScript + Fastify 后端工程，承载“一平台三中心”与统一技术中台。
- 引入开源组件（npm 即 GitHub 仓库分发形式，按需克隆源码备用）：
  - `json-rules-engine`（MIT，Drools 等价规则推理）
  - `node-cron`（Apache-2.0，DolphinScheduler 等价任务编排）
  - `better-sqlite3`（MIT，Doris 数仓等价存储，分层 ODS/DWD/DWS/ADS）
  - `jsonwebtoken` + `@fastify/jwt`（Keycloak 等价鉴权）
  - `@fastify/rate-limit` + `@fastify/cors`（APISIX 等价网关）
  - `pino`（Apache-2.0，结构化日志/审计）
  - `bullmq` 可选（RocketMQ 等价异步解耦，默认进程内事件总线降级）
- 数据库：SQLite，建表脚本按三中心业务实体建模（组织、账户、交易、对手方、风险、工单、规则、采集任务、数据源、审计日志、用户）。
- 种子数据：将现有 `src/mock/index.ts` 数据迁入数据库，保证前端切换后视觉/数据一致。

### 新增：三中心业务模块
- **数据采集中心**（`server/modules/collection/`）：数据源 CRUD、采集任务编排（全量/增量/CDC 三模式模拟）、采集趋势、数据质量校验、采集异常告警。
- **智慧监督中心**（`server/modules/monitoring/`）：规则引擎（规则 CRUD + 规则推理命中）、风险预警生成与筛选、关系图谱查询（账户-交易对手-组织-人员四级）、穿透查询（集团→板块→二级→三级→凭证/流水逐级下钻）、监管态势聚合（Doris 等价分析查询）。
- **调度指挥中心**（`server/modules/dispatch/`）：核查工单工作流（verify→rectify→review→archive 状态机，Flowable 等价）、工单流转/催办/超时、指挥大屏聚合、风险告警触达。

### 新增：统一技术中台（`server/modules/platform/`）
- 鉴权（Keycloak 等价）：JWT 登录、5 类角色（集团监管员/二级监管员/核查人员/值班员/集团领导）、RBAC 接口级权限、行级数据权限（按组织层级过滤）。
- 网关（APISIX 等价）：统一路由前缀 `/api/v1`、限流、CORS、请求日志。
- 审计（Ranger 等价）：所有查询/处置操作落审计表，审计日志查询接口。
- 监控（Prometheus 等价）：`/metrics` 指标暴露、`/health` 健康检查。

### 修改：前端 API 层衔接
- **BREAKING（仅运行时）**：`src/api/index.ts` 由“直接返回 mock”改为“调用真实后端 `fetch`”，保留 `VITE_USE_MOCK` 环境变量回退 mock，默认走真实后端。
- `vite.config.ts`：增加 `/api` 代理到后端（默认 `http://localhost:7077`）。
- `package.json`：增加 `server` / `server:dev` / `dev:all` 脚本，统一前后台联调。

### 不变更
- 前端页面、组件、路由、主题、样式 token 体系全部保持不变。
- `src/api/types.ts` 类型契约保持不变（后端按此契约返回）。
- `src/mock/` 保留，作为离线回退与单测夹具。

---

## Impact

- **Affected specs**（PRD/技术架构对齐）：
  - PRD §6 数据策略：由“纯前端 Mock”升级为“真实后端 + Mock 回退”。
  - 技术架构 §1 架构图：补齐后端层（三中心模块 + 技术中台 + SQLite 数仓）。
  - 技术架构 §4 API 定义：由“预留”变为“实现”。
  - 技术架构 §11 与 5 年方案对齐：阶段 1-3 能力在后端落地（采集/规则/图谱/工单/大屏）。
- **Affected code**：
  - 新增：`/workspace/server/`（后端工程，约 30+ 文件）。
  - 修改：`/workspace/src/api/index.ts`（切换真实后端 + mock 回退）、`/workspace/vite.config.ts`（代理）、`/workspace/package.json`（脚本与依赖）、`/workspace/tsconfig.json`（可选 server 引用）。
  - 不变：`src/pages/**`、`src/components/**`、`src/store/**`、`src/mock/**`。

---

## 技术映射（方案组件 → 本期实现）

| 方案组件 | 中心 | 本期实现 | 说明 |
|---------|------|---------|------|
| Airbyte / DataX / Debezium / Tika | 数据采集 | `server/modules/collection/` + `node-cron` + 模拟连接器 | 三模式（全量/增量/CDC）任务编排，Tika 用 `textract`/`mime-types` 简化 |
| Apache Doris | 智慧监督 | SQLite + 分层视图（ODS/DWD/DWS/ADS） | MySQL 协议兼容语义，分析查询用 SQL 实现 |
| NebulaGraph | 智慧监督 | `server/modules/monitoring/graph.ts` 内存邻接表 + SQLite | 四级关联、二度/长路径遍历 |
| Drools | 智慧监督 | `json-rules-engine`（npm，MIT） | 规则 DSL + RETE 风格推理 |
| LangChain | 智慧监督 | 预留 `server/modules/monitoring/ai.ts` 接口 | 自然语言查询占位（阶段 4） |
| Flowable | 调度指挥 | `server/modules/dispatch/workflow.ts` 状态机 | BPMN 等价：核查→整改→复核→归档 |
| Apache Superset | 调度指挥 | 大屏聚合接口 + 前端 Recharts | 指挥驾驶舱数据后端 |
| RocketMQ | 调度指挥 | 进程内 EventBus（`events`） | 三中心异步解耦，预留 BullMQ 升级 |
| DolphinScheduler | 调度指挥 | `node-cron` | 采集/告警任务调度 |
| HertzBeat | 调度指挥 | `/health` + `/metrics` | 全链路监控告警 |
| APISIX | 技术中台 | Fastify 插件（限流/CORS/日志） | 统一网关 |
| Keycloak | 技术中台 | `@fastify/jwt` + RBAC | 统一身份认证 |
| Apache Ranger | 技术中台 | 行级权限 + 审计表 | 数据安全脱敏 |
| Prometheus+Grafana | 技术中台 | `/metrics`（Prometheus 格式） | 指标暴露 |

---

## ADDED Requirements

### Requirement: 后端工程骨架
系统 SHALL 在 `/workspace/server/` 提供 Node.js + TypeScript + Fastify 后端，监听 `7077` 端口，统一 API 前缀 `/api/v1`，支持 `pnpm server:dev` 热重载启动。

#### Scenario: 后端启动
- **WHEN** 执行 `pnpm server:dev`
- **THEN** 后端在 `http://localhost:7077` 启动，`GET /health` 返回 `{status:"ok", centers:{collection,monitoring,dispatch}}`，数据库自动初始化并灌入种子数据。

### Requirement: 数据采集中心
系统 SHALL 提供数据源管理、采集任务编排、采集趋势、数据质量校验能力，模拟浪潮 iGIX / 司库 MySQL / 司库 Oracle 三类数据源的全量/增量/CDC 采集。

#### Scenario: 采集任务调度
- **WHEN** 配置一个 CDC 模式采集任务（司库账户流水）
- **THEN** `node-cron` 按调度表达式执行，写入采集日志，更新任务最近状态/吞吐量/最后运行时间，失败任务标记并触发告警事件。

#### Scenario: 采集数据质量校验
- **WHEN** 采集写入 ODS 层数据
- **THEN** 运行 Great Expectations 等价校验规则（非空/值域/长度/跨表一致/日期合法），不合格数据写入 `data_quality_issues` 表并告警。

### Requirement: 智慧监督中心 - 规则引擎
系统 SHALL 基于 `json-rules-engine` 提供规则 CRUD、规则启用/停用、规则版本、规则推理命中能力，规则按领域（财务/投资/合规/采购/产权/金融/薪酬/安全等）分类。

#### Scenario: 规则推理命中
- **WHEN** 调用 `POST /api/v1/monitoring/rules/:id/evaluate` 传入业务事实（交易流水）
- **THEN** 引擎按规则 DSL 推理，命中则生成 `risk_warning` 记录（pending 状态），并通过 EventBus 推送告警事件至调度指挥中心。

### Requirement: 智慧监督中心 - 关系图谱
系统 SHALL 维护账户-交易对手-组织-人员四级关联图谱，支持二度关联查询、资金流向路径检索、隐性关联挖掘。

#### Scenario: 二度关联查询
- **WHEN** 调用 `GET /api/v1/monitoring/graph?centerNodeId=acc-1&depth=2`
- **THEN** 返回以指定节点为中心、2 跳内的节点与边集合，响应时长 ≤ 500ms（沙箱数据量）。

### Requirement: 智慧监督中心 - 穿透查询
系统 SHALL 支持从集团汇总数据逐级下钻至二级→三级→账户/凭证→交易流水，支持关键字（主体/资金/合同/项目）检索。

#### Scenario: 层级下钻
- **WHEN** 调用 `GET /api/v1/monitoring/penetration/tree`
- **THEN** 返回与前端 `penetrationTree` 契约一致的嵌套树结构，每层含 assets/revenue/risk 指标。

### Requirement: 调度指挥中心 - 工单工作流
系统 SHALL 提供核查工单全流程状态机（verify→rectify→review→archive），支持派单、节点流转、超时自动转办、工单与风险源关联。

#### Scenario: 工单流转
- **WHEN** 对工单调用 `POST /api/v1/dispatch/work-orders/:id/advance` 携带处置结果
- **THEN** 工单推进至下一节点，progress 更新，写审计日志；到达 archive 节点时 status 置为 archived，并回写关联风险预警为 resolved。

#### Scenario: 风险告警自动派单
- **WHEN** 规则引擎生成 high 级别风险预警
- **THEN** EventBus 消费者自动创建核查工单（verify 节点），按风险类型分派至对应业务处室负责人。

### Requirement: 调度指挥中心 - 指挥大屏聚合
系统 SHALL 提供指挥驾驶舱聚合接口：在线监管对象、今日新增风险、在办工单、平均处置时长、数据采集量、系统可用性、风险分布热力图。

#### Scenario: 大屏数据刷新
- **WHEN** 调用 `GET /api/v1/dispatch/dashboard`
- **THEN** 返回 KPI、热力图、待办统计聚合数据，与前端 `bigScreenKpis`/`riskHeatmap` 契约一致。

### Requirement: 统一技术中台 - 鉴权
系统 SHALL 提供 JWT 登录、5 类角色 RBAC、行级数据权限（按组织层级过滤）。

#### Scenario: 角色登录
- **WHEN** 调用 `POST /api/v1/auth/login` 传入用户名/密码
- **THEN** 返回 JWT token 与角色信息；后续请求携带 `Authorization: Bearer <token>`，受保护接口校验 token 与角色权限。

#### Scenario: 行级数据权限
- **WHEN** 二级单位监管员查询风险预警
- **THEN** 仅返回本单位及下级单位数据，集团监管员返回全量数据。

### Requirement: 统一技术中台 - 网关与监控
系统 SHALL 提供统一路由、限流、CORS、请求日志、Prometheus 指标、健康检查。

#### Scenario: 限流与监控
- **WHEN** 单 IP 1 分钟内请求超过 120 次
- **THEN** 返回 429；`GET /metrics` 暴露 `http_requests_total`、`risk_evaluations_total`、`workorder_advance_total` 等指标。

### Requirement: 审计日志
系统 SHALL 记录所有查询、处置、登录操作的审计日志，支持按用户/操作类型/时间范围查询。

#### Scenario: 审计查询
- **WHEN** 调用 `GET /api/v1/system/audit?userId=...&action=...`
- **THEN** 返回审计记录列表（操作人/操作类型/目标/时间/IP/详情）。

### Requirement: 前后台完整衔接
系统 SHALL 让前端 `src/api/index.ts` 默认调用真实后端，保留 `VITE_USE_MOCK=true` 回退 mock；Vite 代理 `/api` 至后端。

#### Scenario: 真实后端联调
- **WHEN** 设置 `VITE_USE_MOCK=false`（默认）并启动前后台
- **THEN** 前端所有页面数据来自后端 `/api/v1/**`，KPI/风险/工单/图谱/大屏/采集/穿透全部实时返回，与 mock 视觉一致。

#### Scenario: mock 回退
- **WHEN** 设置 `VITE_USE_MOCK=true`
- **THEN** 前端回退到 `src/mock/`，无后端依赖可独立运行。

---

## MODIFIED Requirements

### Requirement: 前端 API 调用层
**原**：`src/api/index.ts` 直接返回 `src/mock/` 数据（`delay(mock.xxx)`）。
**改**：`src/api/index.ts` 通过 `fetch` 调用 `VITE_API_BASE`（默认 `/api/v1`）真实接口；当 `VITE_USE_MOCK=true` 时回退 mock 实现。类型契约 `src/api/types.ts` 不变，新增工单流转、规则评估、登录等写操作方法。

### Requirement: 数据策略
**原**（PRD §6）：本期纯前端 Mock，预留 `src/api/` 接口封装层。
**改**：后端落地真实数据存储（SQLite）与三中心业务逻辑，`src/api/` 由“预留”变为“真实调用 + mock 回退”。时间基准仍统一为 `2026-07-16`，种子数据与 mock 保持一致。

---

## REMOVED Requirements
无移除。`src/mock/` 保留作为回退与夹具，不删除。

---

## 非功能与约束
- **协议合规**：所有引入 npm 包均为 Apache-2.0/MIT 协议，与方案“无商业版权风险”一致。
- **信创兼容**：Node.js + SQLite + 纯 JS 规则引擎天然跨平台，可在麒麟/统信运行；JDBC/国产 DB 适配在阶段 4 处理（本期预留配置位）。
- **性能（沙箱量级）**：图谱二度查询 ≤500ms，列表查询 ≤200ms，规则推理 ≤100ms。
- **可运行性**：`pnpm install` → `pnpm server:dev`（后台）+ `pnpm dev`（前台）一键联调；提供 `pnpm dev:all` 并发启动。
- **不引入外部进程依赖**：无需 Redis/MySQL/Doris/NebulaGraph 等独立服务，全部进程内/SQLite 承载，保证沙箱零外部依赖可运行。
