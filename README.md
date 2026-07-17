# 集团穿透式监管平台

> 一平台三中心 · 集团穿透式监管的工程化落地
> 对齐方案：`大型央企集团穿透式监管平台（一平台三中心）5年落地实操方案.md`
> 演示站点：<https://mimi202605.github.io/Penetrating-Supervision-Platform/>

---

## 一、平台项目概况

### 1.1 建设目标

依据国资委最新要求，构建一套**可运行、可对接、可演进**的XXJH集团级穿透式监管平台，覆盖集团 → 板块 → 二级 → 五级 → 账户/凭证/流水的全链路穿透监管能力，实现"看得见、穿得透、调得动、管得住"。

### 1.2 总体架构 —— 一平台三中心 + 统一技术中台

```
┌─────────────────────────────────────────────────────────────┐
│  前端层  React 18 + TS + Vite + Zustand + Recharts + Tailwind │
│         (HashRouter, 17 个页面, 暗/亮双主题, 多端适配)         │
└──────────────────────────┬──────────────────────────────────┘
                           │ fetch /api/v1  (vite proxy → 7077)
┌──────────────────────────▼──────────────────────────────────┐
│  后端层  Fastify + TS  (端口 7077, 前缀 /api/v1)              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ 统一技术中台  JWT 鉴权 · RBAC · 行级权限 · 限流 · CORS    │ │
│  │              审计日志 · Prometheus 指标 · 健康检查        │ │
│  └─────────────────────────────────────────────────────────┘ │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐  │
│  │ 数据采集中心  │ │ 智慧监督中心  │ │   调度指挥中心        │  │
│  │ 数据源 CRUD   │ │ 规则引擎      │ │ 工单状态机            │  │
│  │ 采集任务编排  │ │ 风险预警      │ │ (verify→rectify→      │  │
│  │ (全量/增量/CDC│ │ 关系图谱 BFS  │ │  review→archive)      │  │
│  │  三模式)      │ │ 穿透查询树    │ │ 自动派单 · 指挥大屏    │  │
│  │ 数据质量校验  │ │ 监管态势聚合  │ │ 超时检查              │  │
│  │ V2 连接器目录 │ │ V2 监管场景   │ │ V2 风险闭环 7 态      │  │
│  │ (20 类连接器) │ │ (5 finance)   │ │ detect→dispatch→...   │  │
│  │ 13 类 Transform│ │ 10 条联查规则 │ │  →approve→close→archive│  │
│  └──────────────┘ └──────────────┘ └──────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  AI 能力 / 数据脱敏  可插拔 LLM · 字段级脱敏管道         │ │
│  │                      自然语言查询 · 合同审查 · 报告生成   │ │
│  │                      AI 调用全链路审计 (ai_call_logs)     │ │
│  │  V2 智能体注册表 16 类（3 已实现：抽取/比对/报告生成）    │ │
│  └─────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  SQLite 数仓  ODS / DWD / DWS / ADS 分层 (Doris 等价)    │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
        │ 进程内 EventBus (RocketMQ 等价) 解耦三中心异步流转
```

### 1.3 技术映射（方案分布式组件 → 沙箱轻量实现）

方案中的分布式组件以**同语义的轻量开源实现**承载，业务模型 / API 契约 / 数据流转与方案完全一致，可平滑替换为生产级分布式组件：

| 方案组件 | 中心 | 本期实现 |
|---------|------|---------|
| Airbyte / DataX / Debezium | 数据采集 | `collection/` + `node-cron` + 模拟连接器（全量/增量/CDC 三模式） |
| Apache Doris | 智慧监督 | SQLite + 分层视图（ODS/DWD/DWS/ADS） |
| NebulaGraph | 智慧监督 | 内存邻接表 + SQLite（账户-对手-组织-人员四级 BFS） |
| Drools | 智慧监督 | `json-rules-engine`（规则 DSL + 推理命中） |
| LangChain | 智慧监督 | `ai/llm-adapter.ts` 可插拔适配器（OpenAI 兼容） |
| Apache Ranger（脱敏） | 技术中台 | `ai/sanitizer.ts` 字段级脱敏管道（mask/hash/replace/range） |
| Flowable | 调度指挥 | `dispatch/workflow.ts` 工单状态机 |
| Apache Superset | 调度指挥 | 大屏聚合接口 + 前端 Recharts |
| RocketMQ | 调度指挥 | 进程内 EventBus（`events.EventEmitter`） |
| DolphinScheduler | 调度指挥 | `node-cron` |
| APISIX | 技术中台 | Fastify 插件（限流 / CORS / 请求日志） |
| Keycloak | 技术中台 | `@fastify/jwt` + RBAC（5 类角色） |
| HertzBeat / Prometheus | 技术中台 | `/health` + `/metrics` |

### 1.4 核心特性

- **三中心业务闭环**：数据采集 → 规则推理 → 风险预警 → 自动派单 → 工单流转 → 归档回写，全链路打通
- **V2 多协议采集底座（collection-system-v2 已落地）**：
  - **连接器目录 20 类**：6 类已实现（kingdee-eas-openapi / sap-odata / jdbc-mysql / cdc-mysql / treasury-sys / file-csv）+ 14 类占位，统一 `capabilities` 元数据
  - **13 类 Transform 管道**：field-mapping / type-cast / clean / dedup / filter / mask / flatten / enrich / script / sql / entity-resolve / relationship-extract / evidence-snapshot，支持配置 schema 渲染 + 预览
  - **5 类 finance-risk 监管场景**：dup-pay / private-pay / fake-trade / guarantee / funding-due，配 5 个监管模型 + 16 个指标 + 5 个采集任务模板
  - **10 条联查规则**：资金管理 5 + 投资管理 3 + 合同 2，按场景触发 ads→dws→dwd→ods 四级穿透
  - **风险闭环 7 态工作流**：detect → dispatch → receive → dispose → approve → close → archive，工单 + 处置单 + 待办联动
  - **AI 智能体注册表 16 类（3 已实现）**：info-extract / text-compare / report-generate 可经 `/ai/agents/:id/invoke` 调用，支持单智能体调用与多智能体编排
- **AI 可选可插拔**：未配置 `AI_API_BASE` 返回结构化占位响应，配置后对接 OpenAI 兼容端点（集团微调 Llama3 / 国产大模型）
- **数据脱敏强约束**：业务数据传入 LLM 前 MUST 经 `sanitizeForAI(payload, policy)` 字段级脱敏，原始敏感数据零外送，脱敏事件落审计
- **前后台完整衔接**：默认走真实后端，`VITE_USE_MOCK=true` 一键回退 Mock 独立运行（GitHub Pages 演示站点即 Mock 模式，已同步 V2 mock 数据）
- **零外部进程依赖**：无需 Redis / MySQL / Doris / NebulaGraph / LLM 服务等独立进程，全部进程内 / SQLite 承载
- **信创兼容**：Node.js + SQLite + 纯 JS 规则引擎天然跨平台，可在麒麟 / 统信运行

### 1.5 仓库结构

```
/workspace
├── src/                         # 前端工程（React 18 + TS + Vite）
│   ├── api/                     #   API 封装层（fetch /api/v1，含 Mock 回退）
│   ├── pages/                   #   17 个业务页面
│   ├── components/              #   layout / ui / charts / overview 组件
│   ├── store/                   #   zustand 状态：主题、布局
│   └── mock/                    #   Mock 数据（回退与单测夹具）
├── server/                      # 后端工程（Fastify + TS）
│   ├── src/
│   │   ├── db/                  #   SQLite schema + 仓库层 + 种子数据
│   │   ├── modules/
│   │   │   ├── platform/        #   技术中台：auth/rbac/audit/eventbus/gateway
│   │   │   ├── collection/      #   数据采集中心
│   │   │   ├── monitoring/      #   智慧监督中心
│   │   │   ├── dispatch/        #   调度指挥中心
│   │   │   ├── ai/              #   AI 能力 + 数据脱敏
│   │   │   └── system/          #   审计 / 系统配置
│   │   ├── app.ts / main.ts / config.ts
│   └── scripts/
│       ├── smoke.sh             #   22 项接口自测
│       └── closed-loop.sh       #   端到端闭环验证
├── .github/workflows/deploy.yml # GitHub Pages 自动部署
├── .trae/                       # 规格与文档（spec / PRD / 技术架构）
└── package.json                 # 前端 + 联调脚本
```

---

## 二、平台构建方法

### 2.1 环境要求

| 依赖 | 版本 | 说明 |
|------|------|------|
| Node.js | ≥ 20 | 后端 `engines.node >= 20` |
| pnpm | ≥ 10 | 包管理（推荐） |
| Python | 系统自带 | 仅 `better-sqlite3` 原生编译需要 |
| make / g++ | 系统自带 | 同上（Linux 一般预装） |

> Windows 用户：建议在 WSL2 中运行，避免原生模块编译问题。

### 2.2 一键启动（前后台联调）

```bash
# 1. 克隆
git clone https://github.com/mimi202605/Penetrating-Supervision-Platform.git
cd Penetrating-Supervision-Platform

# 2. 安装根工程依赖（前端 + concurrently）
pnpm install

# 3. 安装后端依赖（含 better-sqlite3 原生编译）
pnpm --dir server install

# 4. 一键并发启动前后台
pnpm dev:all
#   后台  → http://localhost:7077  (Fastify + tsx watch)
#   前台  → http://localhost:5173  (Vite HMR)
#   vite 已将 /api 代理至 7077，前后台联调打通
```

### 2.3 单独启动后台 / 前台

```bash
# 后台（开发热重载）
pnpm server:dev

# 后台（生产模式）
pnpm --dir server run build
pnpm server

# 前台（默认走真实后端）
pnpm dev
```

### 2.4 配置环境变量

前端配置 `.env`（参考 `.env.example`）：

```bash
# API 基础路径（配合 vite.config.ts 的 /api 代理）
VITE_API_BASE=/api/v1

# 是否回退 Mock 数据：false=真实后端（默认）, true=Mock 独立运行
VITE_USE_MOCK=false
```

后端配置（在 `server/` 下设置环境变量，参考 `server/src/config.ts`）：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `7077` | 服务端口 |
| `JWT_SECRET` | `dev-secret-change-me` | **生产必须覆盖** |
| `DB_PATH` | `./data/supervision.db` | SQLite 文件路径 |
| `AI_API_BASE` | 空 | OpenAI 兼容端点；空时 AI 接口返回占位响应 |
| `AI_API_KEY` | 空 | LLM 调用密钥 |
| `AI_MODEL` | `gpt-4o-mini` | 模型名 |
| `CORS_ORIGIN` | `*` | CORS 允许来源，逗号分隔 |
| `RATE_LIMIT_MAX` | `120` | 单 IP 限流上限（次/分钟） |
| `SEED_ON_BOOT` | `true` | 启动时是否执行种子数据 |

### 2.5 接入 AI 能力（可选）

```bash
# 对接集团微调 Llama3 或国产大模型，只要 OpenAI 兼容协议即可
export AI_API_BASE=https://your-llm-gateway/v1
export AI_API_KEY=sk-xxxx
export AI_MODEL=llama3-70b-instruct

# 重启后端，/api/v1/ai/** 将由占位响应切换为真实 LLM 调用
```

### 2.6 静态演示构建（GitHub Pages 模式）

GitHub Pages 为纯静态托管，无法运行 Node 后端，演示站点以 Mock 模式独立运行：

```bash
# 构建 Mock 模式产物
pnpm build:mock      # 等价于 VITE_USE_MOCK=true pnpm build

# 本地预览
pnpm preview

# 手动部署到 gh-pages 分支
pnpm deploy:gh
```

> 代码库仍保留完整后端联通能力，本地 `pnpm dev:all` 仍走真实后端。

### 2.7 类型检查与自测

```bash
# 前后台 TypeScript 类型检查
pnpm check                       # 前端 tsc -b --noEmit
pnpm --dir server run check      # 后端 tsc --noEmit

# 后端 22 项接口 Smoke 自测（需先启动后端）
bash server/scripts/smoke.sh

# 端到端闭环验证：规则评估 → 自动派单 → 工单流转 → 归档 → 风险回写
bash server/scripts/closed-loop.sh
```

---

## 三、平台使用方法

### 3.1 访问入口

| 场景 | 地址 | 说明 |
|------|------|------|
| 在线演示 | <https://mimi202605.github.io/Penetrating-Supervision-Platform/> | Mock 模式，无需后端 |
| 本地前后台 | <http://localhost:5173> | 真实后端，`pnpm dev:all` 启动 |
| 后端 API | <http://localhost:7077/api/v1> | 统一前缀 `/api/v1` |
| 健康检查 | <http://localhost:7077/health> | 无需鉴权 |
| Prometheus 指标 | <http://localhost:7077/metrics> | `http_requests_total` 等 |

### 3.2 种子账号

启动后端会自动初始化 5 类角色种子用户，**密码统一为 `admin123`**：

| 用户名 | 角色 | 权限范围 |
|--------|------|----------|
| `admin` | 集团监管员 | 全量数据 |
| `group2` | 二级监管员 | 本单位及下级（行级权限） |
| `inspector` | 核查人员 | 工单处置 |
| `duty` | 值班员 | 大屏监控 |
| `leader` | 集团领导 | 全量只读 |

登录后 token 存 `localStorage('supervision_token')`，受保护接口需携带 `Authorization: Bearer <token>`。

### 3.3 页面导览（17 个页面）

| 路由 | 页面 | 说明 |
|------|------|------|
| `/` | 监管总览 | KPI / 三中心 / 十大领域 / 穿透框架 / 风险目录 / 保障 / 趋势图 |
| `/collection/overview` | 采集中心-概览 | 数据源、采集任务、吞吐量、质量校验；V2 连接器统计（6 已实现 / 14 占位）+ 5 类监管场景覆盖 |
| `/collection/sources` | 数据源管理 | 浪潮 iGIX / 司库 MySQL / Oracle 等数据源 CRUD；V2 连接器目录驱动的新建表单 + 健康历史 + Schema 发现 |
| `/collection/tasks` | 采集任务 | 全量 / 增量 / CDC 三模式任务编排；V2 13 类 Transform 配置 + 预览 + 运行审计 + 脏数据回查 |
| `/monitoring/penetration` | 穿透查询 | 集团→板块→二级→三级→账户逐级下钻；V2 ads→dws→dwd→ods 四级数仓穿透 + 血缘图 |
| `/monitoring/risk-warnings` | 风险预警 | 按领域 / 等级 / 状态筛选，状态变更；V2 监管场景驱动的指标命中 |
| `/monitoring/graph` | 关系图谱 | 账户-对手-组织-人员四级 BFS 二度关联 |
| `/monitoring/rules` | 规则配置 | 规则 CRUD + 在线推理命中；V2 10 条联查规则 + 5 类监管场景配置 |
| `/dispatch/work-orders` | 核查工单 | verify→rectify→review→archive 节点流转 |
| `/dispatch/process` | 处置流程 | 工单全流程视图；V2 风险闭环 7 态（detect→dispatch→receive→dispose→approve→close→archive）+ 待办 |
| `/dispatch/dashboard` | 指挥大屏 | KPI / 热力图 / 待办统计 |
| `/scenarios/finance` | 财务资金监管 | 大额资金流向、账户异常；V2 5 类 finance-risk 场景实例化（重复支付 / 对私支付 / 融资性贸易 / 超股比担保 / 融资到期） |
| `/scenarios/investment` | 投资决策监管 | 投资合规审查；V2 3 条投资联查规则 |
| `/scenarios/compliance` | 合规风控监管 | 合同 / 关联交易；V2 2 条合同联查规则 + AI 文本比对（阴阳合同 / 标书查重） |
| `/scenarios/safety` | 安全生产监管 | 安全事件穿透 |
| `/system/audit` | 审计日志 | 查询 / 处置 / 登录 / 脱敏 / AI 调用全留痕；V2 AI 智能体调用全链路审计 |
| `/system/settings` | 系统设置 | 系统配置（需 admin） |

### 3.4 关键 API 速查（统一前缀 `/api/v1`）

```bash
# 1. 登录拿 token
curl -X POST http://localhost:7077/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
# → { "token": "xxx", "user": {...} }

# 2. 后续请求携带 token
TOKEN="xxx"
curl http://localhost:7077/api/v1/monitoring/overview \
  -H "Authorization: Bearer $TOKEN"

# 3. 规则推理命中（生成风险预警 + 自动派单）
curl -X POST http://localhost:7077/api/v1/monitoring/rules/rule-001/evaluate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount": 50000000, "counterparty": "Everwin Holdings"}'

# 4. 工单节点流转
curl -X POST http://localhost:7077/api/v1/dispatch/work-orders/wo-001/advance \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"result": "已核实，需整改", "operator": "inspector"}'

# 5. AI 自然语言查询（前置自动脱敏）
curl -X POST http://localhost:7077/api/v1/ai/query \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "查看XXXX 2026 年三季度大额资金流向"}'
```

完整端点列表见 [.trae/documents/技术架构.md §4](file:///workspace/.trae/documents/技术架构.md)。

### 3.5 典型业务闭环

```
配置规则 → 规则推理命中 → 生成风险预警(pending)
            │
            └─EventBus─→ 高级别预警自动派单 → 工单(verify 节点)
                                                 │
                          ┌──────────────────────┘
                          ▼
              verify → rectify → review → archive
                          │
                          └─归档时回写风险预警为 resolved
```

一键验证：`bash server/scripts/closed-loop.sh`

---

## 四、项目后续工作计划

按 5 年落地实操方案的阶段演进路线，本期已实现阶段 1-4 的核心能力（沙箱轻量承载），后续按以下方向迭代：

### 4.1 生产级分布式组件替换（阶段 5 资产运营）

当前以同语义轻量实现承载的组件，平滑替换为生产级分布式组件：

- SQLite 数仓 → **Apache Doris** 集群（MySQL 协议兼容，分层视图不变）
- 内存邻接表 → **NebulaGraph** 集群（图查询语义不变）
- 进程内 EventBus → **RocketMQ** 集群（事件契约不变）
- node-cron → **DolphinScheduler**（任务调度元数据迁移）
- `@fastify/jwt` → **Keycloak** 统一身份（OIDC 对接）
- Fastify 限流 → **APISIX** 网关（路由 / 限流 / 熔断下沉）

### 4.2 AI 能力深化

- **自然语言穿透查询**：从占位响应升级为基于集团微调 Llama3 的 NL2SQL / NL2Graph，支持自然语言下钻
- **合同违规条款审查**：对接法务知识库，自动识别违规条款并生成处置建议
- **风险处置报告自动生成**：基于风险预警 + 工单全流程数据，自动生成结构化报告
- **脱敏策略增强**：扩展 NER 实体识别（机构名 / 人名 / 地址），动态脱敏策略推荐

### 4.3 数据源真实接入

- **浪潮 iGIX OpenAPI**：对接集团 ERP，实现财务 / 采购 / 产权数据实时采集
- **司库系统 CDC**：通过 Debezium 监听 binlog，实现账户流水实时增量同步
- **档案系统 Tika**：合同 / 制度文档结构化解析入图

### 4.4 信创与安全合规

- **国产化适配**：麒麟 / 统信操作系统适配测试，达梦 / 人大金仓数据库 JDBC 适配
- **等保 2.0 三级**：补齐安全审计 / 入侵防范 / 数据完整性校验
- **数据出境合规**：境外子公司数据跨境流转审计与脱敏强化

### 4.5 工程化演进

- **可观测性**：接入 Grafana 大盘，指标 / 日志 / 链路追踪三位一体
- **CI/CD**：补齐自动化测试覆盖率，后端单测 + 集成测试 + 契约测试
- **多租户**：支持多集团 / 多板块租户隔离
- **移动端**：指挥大屏移动端适配，值班员移动处置工单

### 4.6 阶段路线对照

| 阶段 | 周期 | 本期状态 | 后续重点 |
|------|------|----------|----------|
| 阶段 1 基础底座 | 已落地 | ✅ 数据采集 / 数仓分层 / 监控 | 真实数据源接入 |
| 阶段 2 智慧监督 | 已落地 | ✅ 规则引擎 / 图谱 / 穿透 | 规则库扩展 / 图谱可视化增强 |
| 阶段 3 调度指挥 | 已落地 | ✅ 工单状态机 / 自动派单 / 大屏 | 流程引擎替换 Flowable / 移动处置 |
| 阶段 4 AI 全域 | 端口已落地 | ✅ 脱敏链路 / LLM 适配器 / 全链路审计 | 真实 LLM 对接 / NL2SQL / 报告生成 |
| **collection-system-v2** | **已落地** | ✅ 20 类连接器 / 13 类 Transform / 5 监管场景 / 10 联查规则 / 16 AI 智能体 / 7 态风险闭环 / 四级穿透 | 真实 Kingdee EAS / SAP / 司库对接；剩余 13 类智能体实现 |
| 阶段 5 资产运营 | 规划中 | 🔜 | 分布式组件替换 / 信创适配 / 等保三级 |

---

## 许可证

详见 [LICENSE](file:///workspace/LICENSE)。
