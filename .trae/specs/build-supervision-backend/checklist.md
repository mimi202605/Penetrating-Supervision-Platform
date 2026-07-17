# Checklist

> change-id: `build-supervision-backend`
> 验收时逐项核对，满足则勾选。每项须有可验证证据（文件/命令输出/截图）。

## 工程骨架
- [ ] `/workspace/server/` 后端工程存在，`pnpm install` 成功安装全部依赖（无外部进程依赖）
- [ ] `pnpm server:dev` 能在 `http://localhost:7077` 启动，热重载生效
- [ ] `GET /health` 返回 200 且包含三中心状态结构
- [ ] `GET /metrics` 返回 Prometheus 文本格式指标（至少含 `http_requests_total`）

## 数据库与种子
- [ ] `schema.sql` 覆盖三中心全部业务实体表（含 ODS/DWD/DWS/ADS 分层注释），含 `sanitizer_policies`、`ai_call_logs` 表
- [ ] 首次启动自动建表并灌入种子数据（与 `src/mock/index.ts` 一致，含默认脱敏策略集）
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

## 人工智能与数据脱敏
- [ ] `sanitizeForAI(payload, policy)` 脱敏管道实现，支持掩码/哈希/替换/区间化四种算法
- [ ] 默认脱敏策略种子数据已灌入 `sanitizer_policies`（银行卡/身份证/手机号/姓名/金额/账户号/统一社会信用代码）
- [ ] `GET/POST /api/v1/ai/sanitizer/policies` 脱敏策略 CRUD 可用，支持启停
- [ ] 任何 `/api/v1/ai/**` 调用前业务载荷 MUST 先经脱敏，脱敏后载荷无原始敏感数据（验证：银行卡号变为掩码、身份证变为掩码）
- [ ] 脱敏事件写审计日志（含原字段指纹、脱敏算法、操作人）
- [ ] `GET /api/v1/ai/health` 返回 AI 适配器状态（configured/provider/endpoint 脱敏/latency）
- [ ] `AI_API_BASE` 未配置时 `POST /api/v1/ai/query` 返回结构化占位响应（含意图/建议查询模板/配置提示），主流程不阻塞
- [ ] `AI_API_BASE` 已配置时走「脱敏→调用 LLM→记日志」闭环，返回真实结果
- [ ] AI 调用全链路写 `ai_call_logs`（调用者/端点/脱敏后入参摘要/出参摘要/耗时/token），`GET /api/v1/ai/logs` 可查询
- [ ] `/ai/contract-review`、`/ai/risk-report` 端口预留可用（占位或真实调用）

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
- [ ] AI 链路闭环：AI 查询请求→脱敏管道→LLM 适配器（占位或真实）→响应→ai_call_logs 记录，脱敏后载荷零敏感数据
- [ ] 后端自测脚本 `smoke` 全部接口返回 2xx（含 `/ai/*`）

## 非功能
- [ ] 所有引入依赖协议为 Apache-2.0/MIT，无 GPL/AGPL 传染性风险
- [ ] 无外部进程依赖（不要求 Redis/MySQL/Doris/NebulaGraph/LLM 独立服务，AI 通过可配置 HTTP 端点对接）
- [ ] `AI_API_BASE` 未配置时主流程不受影响，AI 接口返回结构化占位
- [ ] AI 链路零原始敏感数据外送（脱敏强约束验证通过）
- [ ] `src/api/types.ts` 原有类型契约未被破坏（前端 `pnpm check` 通过）
- [ ] 后端 `pnpm check`（tsc --noEmit）通过
- [ ] `.trae/documents/技术架构.md` 已追加后端落地说明与 AI/脱敏链路（§1/§4/§11）
