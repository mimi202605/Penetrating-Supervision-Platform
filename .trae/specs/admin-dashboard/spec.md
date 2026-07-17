# 后台可视化管理中心 Spec

> change-id: `admin-dashboard`
> 对齐文档：`README.md`、`.trae/specs/collection-system-v2/spec.md`、`src/components/layout/navConfig.ts`
> 编制日期：2026-07-17
> 设计参考：TailAdmin React（GitHub 1.4K+ stars，Tailwind + React + TS + Vite）布局模式与设计语言

---

## Why

现有穿透式监管平台已落地 17 个业务前台页面（采集/监督/调度/场景/系统），V2 能力（20 类连接器、13 类 Transform、5 监管场景、10 联查规则、16 AI 智能体、7 态风险闭环、四级穿透）的 mock 数据与 API 已就绪，但缺少一个统一的后台管理中心来：

- 可视化管理平台所有配置项（连接器、Transform、监管场景、规则模型、AI 智能体、脱敏策略）
- 监控平台整体运行状态（采集吞吐、规则命中、工单时效、AI 调用、模块健康度、实时告警）
- 管理用户/角色/权限与查看操作日志

当前"系统"分组仅有审计日志与系统设置两个页面，无法承担完整后台管理职责。本期目标：**新增一个综合后台管理中心，与前台同 SPA 集成，实现平台配置可视化、运行监控可视化、用户权限管理**，使管理者可通过后台全局掌控与配置平台。

---

## What Changes

### 新增：AdminLayout 布局与路由区

- 新增 `src/components/layout/AdminLayout.tsx`：独立的后台布局外壳（AdminTopNav + AdminSideNav + 主内容区），与 `AppLayout` 并列
- 新增 `src/components/layout/AdminSideNav.tsx`：深色侧栏，4 大模块分组导航，可折叠为 64px 图标模式（复用 `layoutStore` 折叠逻辑），移动端抽屉化
- 新增 `src/components/layout/AdminTopNav.tsx`：后台顶栏（平台标识·后台、当前用户角色、主题切换、命令面板入口）
- 新增 `src/components/layout/adminNavConfig.ts`：后台导航配置（4 分组 14 项）
- `src/App.tsx` 新增 `/admin/*` 嵌套路由区，`AdminLayout` 为父路由

### 新增：Mock 角色鉴权

- 新增 `src/store/authStore.ts`（Zustand）：当前用户、角色（admin/核查员/处置员）、登录态、login/logout/switchRole
- 新增 `src/components/admin/RequireAdmin.tsx`：路由守卫，包裹 `/admin/*`，非 admin 跳 `/admin/login`
- 新增 `src/pages/admin/LoginPage.tsx`：Mock 登录页，三角色一键切换（演示用），预留真实鉴权接口位

### 新增：系统管理模块（3 页）

| 路由 | 页面文件 | 功能 |
|------|----------|------|
| `/admin/users` | `src/pages/admin/UsersPage.tsx` | 用户 CRUD 表格（搜索/筛选/分页）、状态切换、角色分配；复用 `DataTable` |
| `/admin/roles` | `src/pages/admin/RolesPage.tsx` | 角色列表 + 权限矩阵（模块×操作勾选）、新增/编辑角色 |
| `/admin/audit-logs` | `src/pages/admin/AuditLogsPage.tsx` | 全平台操作日志查询（时间/用户/模块/动作/结果筛选），复用现有审计数据源 |

### 新增：数据采集运维模块（4 页）

| 路由 | 页面文件 | 功能 |
|------|----------|------|
| `/admin/connectors` | `src/pages/admin/ConnectorsPage.tsx` | 20 类连接器目录卡片墙（已实现/占位标识）、capabilities 元数据、测试连接 |
| `/admin/sources-ops` | `src/pages/admin/SourcesOpsPage.tsx` | 数据源运维表格（在线率/延迟/最近同步）、健康历史曲线（Recharts）、重启/暂停操作 |
| `/admin/task-scheduler` | `src/pages/admin/TaskSchedulerPage.tsx` | 采集任务列表、运行历史、checkpoint、脏数据回查、审计点吞吐量 |
| `/admin/transforms` | `src/pages/admin/TransformsPage.tsx` | 13 类 Transform 配置面板、管道编排（步骤列表）、预览、运行审计 |

### 新增：监管配置模块（4 页）

| 路由 | 页面文件 | 功能 |
|------|----------|------|
| `/admin/scenes` | `src/pages/admin/ScenesPage.tsx` | 5 类 finance-risk 场景实例管理、启用/停用、关联模型/规则/任务模板 |
| `/admin/rules-models` | `src/pages/admin/RulesModelsPage.tsx` | 10 条联查规则 + 5 个监管模型管理、在线测试、drillPath 配置 |
| `/admin/ai-agents` | `src/pages/admin/AiAgentsPage.tsx` | 16 类智能体注册表、3 已实现调用测试、多智能体编排工作流编辑 |
| `/admin/masking` | `src/pages/admin/MaskingPage.tsx` | 脱敏规则配置（字段级）、策略绑定数据源、脱敏事件审计查看 |

### 新增：运营监控模块（2 页）

| 路由 | 页面文件 | 功能 |
|------|----------|------|
| `/admin/cockpit` | `src/pages/admin/CockpitPage.tsx` | 4 大 KPI（采集吞吐/规则命中/工单时效/AI 调用）+ 模块健康度 + 趋势图（Recharts） |
| `/admin/alerts` | `src/pages/admin/AlertsPage.tsx` | 告警流（红/橙/黄分级）、时间线、确认/静默/派单操作 |

### 修改：前后台联通

- `src/components/layout/navConfig.ts`：前台"系统"分组新增"后台管理"项 → `/admin/cockpit`
- `src/components/layout/AdminSideNav.tsx`：底部"返回前台"项 → `/`
- `src/store/adminStore.ts`（新增）：后台侧栏折叠状态、告警已读集合

### 新增：Mock 数据扩展

- `src/mock/index.ts` 新增：用户列表（6 人，覆盖三角色三部门）、角色定义（3 角色 + 权限矩阵）、全局 KPI 历史趋势数据（7 日）、告警列表（8 条，覆盖红橙黄三级）
- `src/api/index.ts` 新增对应 Mock 返回：`listUsers/createUser/updateUser/deleteUser`、`listRoles/updateRole`、`listAdminAlerts/confirmAlert`、`getCockpitKpi`

---

## How

### 架构

```
App.tsx (HashRouter)
├── <Route element={<AppLayout />}>      // 前台 17 页（不变）
│   ├── / → OverviewPage
│   └── ... (现有路由)
└── <Route element={<AdminLayout />}>    // 后台 14 页（新增）
    ├── /admin/login → LoginPage（无需鉴权）
    ├── <RequireAdmin>
    │   ├── /admin/users → UsersPage
    │   ├── /admin/roles → RolesPage
    │   ├── ... (12 more)
    │   └── /admin/cockpit → CockpitPage（后台首页）
    └── </RequireAdmin>
```

### 组件复用

| 现有组件 | 后台复用方式 |
|----------|--------------|
| `DataTable` | 用户/角色/审计/数据源/任务/规则表格 |
| `Card` | KPI 卡片、连接器卡片、场景卡片 |
| `Drawer` | 新建/编辑表单抽屉 |
| `StatusTag` | 在线/离线/降级/异常状态标签 |
| `Stat` | 驾驶舱 KPI 数字 |
| `Progress` | 模块健康度进度条 |
| `Segmented` | 视图切换（表格/卡片） |
| `HealthBarChart` / `RiskTrendChart` | 驾驶舱趋势图 |
| `layoutStore` | 侧栏折叠状态 |
| `themeStore` | 主题切换 |

### 数据流

后台页面直接调用 `src/api/index.ts` 的现有 V2 API（连接器/场景/Transform/智能体/联查规则/风险线索/任务运行/审计点/脏数据/StreamCatalog），Mock 模式下从 `src/mock/index.ts` 取数，真实模式走后端。新增的用户/角色/告警/KPI API 同样遵循 `useMock() ? delay(mock.xxx) : request(...)` 模式。

### 鉴权流程

```
访问 /admin/* → RequireAdmin 检查 authStore.role
  ├── role === 'admin' → 渲染后台页面
  └── role !== 'admin' → 跳转 /admin/login
        └── LoginPage 选择角色 → authStore.login(role) → 跳 /admin/cockpit
```

Mock 模式下登录即角色切换，无真实凭证校验，预留 `POST /api/v1/auth/login` 接口位。

---

## Scope

### In Scope

- AdminLayout + AdminSideNav + AdminTopNav 布局
- Mock 角色鉴权（authStore + RequireAdmin + LoginPage）
- 14 个后台页面（系统管理 3 + 采集运维 4 + 监管配置 4 + 运营监控 2）
- 前后台导航联通（前台入口 + 后台返回入口）
- Mock 数据扩展（用户/角色/告警/KPI）
- 对应 API 方法与 Mock 返回

### Out of Scope

- 真实后端鉴权（JWT/OAuth）— 仅预留接口位
- 真实用户数据持久化 — Mock 内存态
- 命令面板（⌘K）完整实现 — 仅顶栏入口占位
- 国际化 — 维持中文
- 移动端后台独立适配 — 复用现有抽屉化方案

---

## Acceptance Criteria

1. 访问 `/admin/cockpit` 未登录时跳转 `/admin/login`，登录后可进入后台
2. 后台侧栏展示 4 大模块 14 项导航，点击可切换页面
3. 前台侧栏"系统"分组可见"后台管理"入口，点击进入后台
4. 后台侧栏底部"返回前台"可回到前台首页
5. 用户管理页可 CRUD 用户（Mock），角色权限页可编辑权限矩阵
6. 连接器目录页展示 20 类连接器卡片，标识已实现/占位
7. 数据源运维页展示健康历史曲线（Recharts）
8. 监管场景页展示 5 类场景，规则模型页展示 10 条联查规则 + 5 模型
9. AI 智能体页展示 16 类智能体，3 已实现可调用测试
10. 驾驶舱页展示 4 KPI + 模块健康度 + 趋势图 + 告警摘要
11. 告警墙页展示分级告警流，可确认/静默
12. 所有后台页面在 Mock 模式下可独立运行（`VITE_USE_MOCK=true`）
13. `pnpm build` 与 `pnpm check`（tsc --noEmit）无错误

---

## References

- TailAdmin React: https://github.com/TailAdmin/free-react-tailwind-admin-dashboard
- 现有布局: [AppLayout.tsx](file:///workspace/src/components/layout/AppLayout.tsx)
- 现有导航配置: [navConfig.ts](file:///workspace/src/components/layout/navConfig.ts)
- V2 API 层: [api/index.ts](file:///workspace/src/api/index.ts)
- V2 Mock 数据: [mock/index.ts](file:///workspace/src/mock/index.ts)
- V2 Spec: [collection-system-v2/spec.md](file:///workspace/.trae/specs/collection-system-v2/spec.md)
