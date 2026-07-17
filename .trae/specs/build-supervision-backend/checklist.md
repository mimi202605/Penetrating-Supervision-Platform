# Checklist

> change-id: `build-supervision-backend`
> 验收时逐项核对，满足则勾选。每项须有可验证证据（文件/命令输出/截图）。

## 工程骨架
- [ ] `/workspace/server/` 后端工程存在，`pnpm install` 成功安装全部依赖（无外部进程依赖）
- [ ] `pnpm server:dev` 能在 `http://localhost:7077` 启动，热重载生效
- [ ] `GET /health` 返回 200 且包含三中心状态结构
- [ ] `GET /metrics` 返回 Prometheus 文本格式指标（至少含 `http_requests_total`）

## 数据库与种子
- [ ] `schema.sql` 覆盖三中心全部业务实体表（含 ODS/DWD/DWS/ADS 分层注释）
- [ ] 首次启动自动建表并灌入种子数据（与 `src/mock/index.ts` 一致）
- [ ] 二次启动不重复灌入（幂等，按 id 去重）
- [ ] `better-sqlite3` 启用 WAL，pragma 优化已配置

## 数据采集中心
- [ ] `GET /api/v1/collection/overview` 返回采集 KPI（采集源/今日采集/异常/健康度）
- [ ] `GET /api/v1/collection/tasks` 返回采集任务列表（含全量/增量/CDC 三模式）
- [ ] `GET /api/v1/collection/sources` 返回数据源列表（浪潮/司库 MySQL/司库 Oracle）
- [ ] `GET /api/v1/collection/trend` 返回近 30 天双折线趋势
- [ ] `node-cron` 调度任务实际执行并更新 `lastStatus`/`throughput`/`lastRun`
- [ ] 数据质量校验不合格数据写入 `data_quality_issues` 表

## 智慧监督中心
- [ ] `GET /api/v1/monitoring/overview` 返回 KPI、centers、domains、riskCatalog、framework、guarantees（与前端契约一致）
- [ ] `GET /api/v1/monitoring/risk-warnings` 支持 level/status/domain/keyword 筛选
- [ ] `GET /api/v1/monitoring/risk-warnings/:id` 返回风险详情（含 clue/raw）
- [ ] 规则引擎 `POST /api/v1/monitoring/rules/:id/evaluate` 命中后生成 pending 风险预警
- [ ] 规则 CRUD 接口（`GET/POST/PUT/DELETE /api/v1/monitoring/rules`）可用
- [ ] `GET /api/v1/monitoring/graph?centerNodeId=&depth=2` 返回 2 跳子图，响应 ≤500ms
- [ ] `GET /api/v1/monitoring/penetration/tree` 返回与前端 `penetrationTree` 一致的嵌套树
- [ ] `GET /api/v1/monitoring/trend`、`/doughnut`、`/health-bars` 返回态势图表数据
- [ ] `GET /api/v1/monitoring/finance/risks`、`/finance/trend` 返回财务资金监管数据

## 调度指挥中心
- [ ] `GET /api/v1/dispatch/work-orders` 返回工单列表（含 currentNode/progress/status）
- [ ] `POST /api/v1/dispatch/work-orders` 新建工单成功
- [ ] `POST /api/v1/dispatch/work-orders/:id/advance` 工单流转 verify→rectify→review→archive 正确
- [ ] 工单到达 archive 时 status=archived，关联风险预警回写 resolved
- [ ] high 级别风险预警经 EventBus 自动生成工单（自动派单验证）
- [ ] `GET /api/v1/dispatch/dashboard` 返回 KPI、热力图、待办统计

## 统一技术中台
- [ ] `POST /api/v1/auth/login` 返回 JWT，5 类角色种子用户均可登录
- [ ] 受保护接口未带 token 返回 401，角色不符返回 403
- [ ] 二级单位监管员仅见本单位数据（行级权限验证）
- [ ] 限流生效：超 120/min 返回 429
- [ ] 审计日志记录登录/查询/处置操作，`GET /api/v1/system/audit` 可查询
- [ ] `GET /api/v1/system/settings` 返回系统配置

## 前后台衔接
- [ ] `src/api/index.ts` 默认调用真实后端，`VITE_USE_MOCK=true` 回退 mock
- [ ] `vite.config.ts` `/api` 代理至 7077 生效
- [ ] `pnpm dev:all` 一键并发启动前后台
- [ ] 17 个前端页面在真实后端模式下全部正常加载（无控制台报错、无数据空）
- [ ] 监管总览页 KPI/三大中心/十大领域/风险预警表/工单表数据与 mock 视觉一致
- [ ] 风险预警筛选、详情抽屉、工单流转交互在真实后端下可用
- [ ] `VITE_USE_MOCK=true` 时前端无后端可独立运行（回退验证通过）

## 闭环验证
- [ ] 端到端闭环：登录→总览→风险预警→派单→工单流转(4节点)→归档→大屏数据更新
- [ ] 规则评估→风险生成→自动派单→工单处置→风险状态回写 全链路通
- [ ] 后端自测脚本 `smoke` 全部接口返回 2xx

## 非功能
- [ ] 所有引入依赖协议为 Apache-2.0/MIT，无 GPL/AGPL 传染性风险
- [ ] 无外部进程依赖（不要求 Redis/MySQL/Doris/NebulaGraph 独立服务）
- [ ] `src/api/types.ts` 原有类型契约未被破坏（前端 `pnpm check` 通过）
- [ ] 后端 `pnpm check`（tsc --noEmit）通过
- [ ] `.trae/documents/技术架构.md` 已追加后端落地说明（§1/§4/§11）
