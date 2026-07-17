// API 调用层：默认调用真实后端（/api/v1），VITE_USE_MOCK=true 时回退 mock
// Task 9：前后台 API 层衔接
import * as mock from "@/mock";
import type {
  RiskWarning,
  WorkOrder,
  RiskStatus,
  RiskLevel,
  KpiSnapshot,
  CenterStatus,
  DomainRisk,
  RiskPill,
  CollectionTask,
  DataSource,
  GraphNode,
  GraphEdge,
  TrendPoint,
  DoughnutSlice,
  HealthBar,
  LoginRequest,
  LoginResponse,
  AdvanceWorkOrderRequest,
  EvaluateRuleRequest,
  AuditLog,
  AuditLogListResponse,
  AIQueryResponse,
  AIHealth,
  DashboardResponse,
  Connector,
  StreamCatalog,
  TransformType,
  TransformPipeline,
  CollectionTaskRun,
  Checkpoint,
  DirtyRecord,
  AuditPoint,
  RegulatoryScene,
  RegulatoryModel,
  RiskClue,
  RiskDisposal,
  LinkageRule,
  Agent,
  PenetrationResult,
  LineageGraph,
  OrchestrateResult,
  AgentInvokeResponse,
  AdminUser,
  AdminRoleDef,
  PermissionMatrix,
  AdminAlert,
  CockpitKpi,
  MaskingRule,
  MaskingEvent,
} from "@/api/types";

export interface RiskFilter {
  level?: RiskLevel | "all";
  status?: RiskStatus | "all";
  domain?: string | "all";
  keyword?: string;
}

/** 审计日志查询参数 */
export interface AuditLogQuery {
  page?: number;
  pageSize?: number;
  userId?: string;
  action?: string;
  startTime?: string;
  endTime?: string;
}

/** 新建工单请求体（对齐后端 POST /dispatch/work-orders） */
export interface CreateWorkOrderRequest {
  id?: string;
  riskSource: string;
  owner?: string;
  riskWarningId?: string;
}

/** 后端错误对象：与后端统一错误格式（{ error, message, statusCode }）对齐 */
export interface ApiError extends Error {
  statusCode: number;
  response?: unknown;
}

/** mock 模式下的延迟辅助，保留以兼容回退路径 */
const delay = <T>(data: T, ms = 80): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(data), ms));

/** 是否走 mock：仅当显式设置 VITE_USE_MOCK='true' 时回退 mock，默认走真实后端 */
const useMock = (): boolean =>
  (import.meta.env.VITE_USE_MOCK as string | undefined) === "true";

/** API 基础路径，默认 /api/v1 */
const apiBase = (): string =>
  (import.meta.env.VITE_API_BASE as string | undefined) || "/api/v1";

/** 通用 fetch 封装：拼 url、带 Authorization、处理 JSON、非 2xx 抛错、401 清 token */
async function request<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    query?: Record<string, string | number | undefined | null>;
    headers?: Record<string, string>;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const { method = "GET", body, query, headers, signal } = options;
  let url = apiBase() + path;
  // 拼接 query string，跳过 undefined/null/空串
  if (query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === "") continue;
      params.set(k, String(v));
    }
    const qs = params.toString();
    if (qs) url += (url.includes("?") ? "&" : "?") + qs;
  }

  const finalHeaders: Record<string, string> = { ...(headers ?? {}) };
  const token = localStorage.getItem("supervision_token");
  if (token) finalHeaders["Authorization"] = `Bearer ${token}`;

  let payload: string | undefined;
  if (body !== undefined) {
    finalHeaders["Content-Type"] = finalHeaders["Content-Type"] ?? "application/json";
    payload = JSON.stringify(body);
  }

  const res = await fetch(url, {
    method,
    headers: finalHeaders,
    body: payload,
    signal,
  });

  // 401：清理 token（可选跳登录；此处仅清理，避免对路由产生副作用）
  if (res.status === 401) {
    localStorage.removeItem("supervision_token");
  }

  // 解析响应体
  let data: unknown = null;
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    data = await res.json();
  } else if (res.status !== 204) {
    data = await res.text();
  }

  if (!res.ok) {
    const errObj =
      data && typeof data === "object"
        ? (data as { statusCode?: number; message?: string; error?: string })
        : {};
    const error = new Error(
      errObj.message || errObj.error || `请求失败: ${res.status}`,
    ) as ApiError;
    error.statusCode = errObj.statusCode ?? res.status;
    error.response = data;
    throw error;
  }

  return data as T;
}

export const api = {
  /* ============ 监管总览（聚合接口 GET /monitoring/overview） ============ */
  getKpiSnapshot: (): Promise<KpiSnapshot> =>
    useMock()
      ? delay(mock.kpiSnapshot)
      : request<{ kpi: KpiSnapshot }>("/monitoring/overview").then((r) => r.kpi),
  getCenters: (): Promise<CenterStatus[]> =>
    useMock()
      ? delay(mock.centers)
      : request<{ centers: CenterStatus[] }>("/monitoring/overview").then((r) => r.centers),
  getDomains: (): Promise<DomainRisk[]> =>
    useMock()
      ? delay(mock.domains)
      : request<{ domains: DomainRisk[] }>("/monitoring/overview").then((r) => r.domains),
  getRiskCatalog: (): Promise<RiskPill[]> =>
    useMock()
      ? delay(mock.riskCatalog)
      : request<{ riskCatalog: RiskPill[] }>("/monitoring/overview").then((r) => r.riskCatalog),

  /* ============ 风险预警 ============ */
  getRiskWarnings: (filter: RiskFilter = {}): Promise<RiskWarning[]> => {
    if (useMock()) {
      return delay(
        mock.riskWarnings.filter((r) => {
          if (filter.level && filter.level !== "all" && r.level !== filter.level) return false;
          if (filter.status && filter.status !== "all" && r.status !== filter.status) return false;
          if (filter.domain && filter.domain !== "all" && r.domain !== filter.domain) return false;
          if (filter.keyword) {
            const kw = filter.keyword.toLowerCase();
            const text = `${r.title} ${r.subject} ${r.rule}`.toLowerCase();
            if (!text.includes(kw)) return false;
          }
          return true;
        }) as RiskWarning[],
      );
    }
    return request<RiskWarning[]>("/monitoring/risk-warnings", {
      query: {
        level: filter.level,
        status: filter.status,
        domain: filter.domain,
        keyword: filter.keyword,
      },
    });
  },

  /* ============ 核查工单 ============ */
  getWorkOrders: (): Promise<WorkOrder[]> =>
    useMock()
      ? delay(mock.workOrders as WorkOrder[])
      : request<WorkOrder[]>("/dispatch/work-orders"),

  /* ============ 数据采集 ============ */
  getCollectionTasks: (): Promise<CollectionTask[]> =>
    useMock()
      ? delay(mock.collectionTasks)
      : request<CollectionTask[]>("/collection/tasks"),
  getDataSources: (): Promise<DataSource[]> =>
    useMock()
      ? delay(mock.dataSources)
      : request<DataSource[]>("/collection/sources"),
  getCollectionTrend: (): Promise<TrendPoint[]> =>
    useMock()
      ? delay(mock.collectionTrend)
      : request<TrendPoint[]>("/collection/trend"),

  /* ============ 关系图谱 ============ */
  getGraph: (): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> =>
    useMock()
      ? delay({ nodes: mock.graphNodes, edges: mock.graphEdges })
      : request<{ nodes: GraphNode[]; edges: GraphEdge[] }>("/monitoring/graph/all"),

  /* ============ 监管态势图表 ============ */
  getDoughnut: (): Promise<DoughnutSlice[]> =>
    useMock()
      ? delay(mock.doughnutSlices)
      : request<DoughnutSlice[]>("/monitoring/doughnut"),
  getHealthBars: (): Promise<HealthBar[]> =>
    useMock()
      ? delay(mock.healthBars)
      : request<HealthBar[]>("/monitoring/health-bars"),

  /* ============ 财务资金监管 ============ */
  getFinanceRisks: (): Promise<{ title: string; level: RiskLevel; count: number; desc: string; icon: string }[]> =>
    useMock()
      ? delay(mock.financeRiskCards)
      : request<{ title: string; level: RiskLevel; count: number; desc: string; icon: string }[]>(
          "/monitoring/finance/risks",
        ),
  getFinanceTrend: (): Promise<{ date: string; inflow: number; outflow: number; net: number }[]> =>
    useMock()
      ? delay(mock.financeTrend)
      : request<{ date: string; inflow: number; outflow: number; net: number }[]>(
          "/monitoring/finance/trend",
        ),

  /* ============ 指挥大屏（聚合接口 GET /dispatch/dashboard） ============ */
  getBigScreenKpis: (): Promise<{ label: string; value: string; trend?: string; tone?: "up" | "down" }[]> =>
    useMock()
      ? delay(mock.bigScreenKpis)
      : request<DashboardResponse>("/dispatch/dashboard").then((r) => r.kpis),
  getRiskHeatmap: (): Promise<{ area: string; high: number; medium: number; low: number }[]> =>
    useMock()
      ? delay(mock.riskHeatmap)
      : request<DashboardResponse>("/dispatch/dashboard").then((r) => r.heatmap),

  /* ============ 穿透查询 ============ */
  getPenetrationTree: (): Promise<typeof mock.penetrationTree> =>
    useMock()
      ? delay(mock.penetrationTree)
      : request<typeof mock.penetrationTree>("/monitoring/penetration/tree"),

  /* ============ 新增：鉴权 ============ */
  login: (payload: LoginRequest): Promise<LoginResponse> =>
    useMock()
      ? // mock 登录：返回占位 token 与用户，便于离线联调
        delay({
          token: "mock-token",
          user: { id: "mock-user", username: payload.username, role: "admin", name: payload.username },
        } as LoginResponse)
      : request<LoginResponse>("/auth/login", {
          method: "POST",
          body: payload,
        }).then((res) => {
          // 登录成功：存 token 到 localStorage
          if (res?.token) localStorage.setItem("supervision_token", res.token);
          return res;
        }),
  logout: (): Promise<{ success: boolean }> =>
    useMock()
      ? delay({ success: true })
      : request<{ success: boolean }>("/auth/logout", { method: "POST" }).finally(() => {
          // 无论后端是否成功，均清理本地 token
          localStorage.removeItem("supervision_token");
        }),

  /* ============ 新增：工单处置 ============ */
  advanceWorkOrder: (id: string, result?: string): Promise<unknown> =>
    useMock()
      ? delay({ ok: true, id })
      : request<unknown>(`/dispatch/work-orders/${encodeURIComponent(id)}/advance`, {
          method: "POST",
          body: { result } as AdvanceWorkOrderRequest,
        }),
  createWorkOrder: (payload: CreateWorkOrderRequest): Promise<WorkOrder> =>
    useMock()
      ? delay({
          id: payload.id || `WO-${Date.now()}`,
          riskSource: payload.riskSource,
          owner: payload.owner || "",
          currentNode: "verify",
          progress: 20,
          status: "processing",
        } as WorkOrder)
      : request<WorkOrder>("/dispatch/work-orders", { method: "POST", body: payload }),

  /* ============ 新增：规则引擎 ============ */
  evaluateRule: (ruleId: string, facts: Record<string, unknown>): Promise<unknown> =>
    useMock()
      ? delay({ matched: false, facts })
      : request<unknown>(`/monitoring/rules/${encodeURIComponent(ruleId)}/evaluate`, {
          method: "POST",
          body: { facts } as EvaluateRuleRequest,
        }),
  listRules: (): Promise<unknown[]> =>
    useMock() ? delay([]) : request<unknown[]>("/monitoring/rules"),

  /* ============ 新增：风险预警状态更新 ============ */
  updateRiskWarningStatus: (id: string, status: RiskStatus): Promise<{ id: string; status: RiskStatus }> =>
    useMock()
      ? delay({ id, status })
      : request<{ id: string; status: RiskStatus }>(
          `/monitoring/risk-warnings/${encodeURIComponent(id)}/status`,
          { method: "PUT", body: { status } },
        ),

  /* ============ 新增：审计日志 ============ */
  listAuditLogs: (params: AuditLogQuery = {}): Promise<AuditLogListResponse> =>
    useMock()
      ? delay((() => {
          const page = params.page ?? 1;
          const pageSize = params.pageSize ?? 20;
          let list = [...mock.auditLogs];
          if (params.userId) list = list.filter((l) => l.userId === params.userId);
          if (params.action) list = list.filter((l) => l.action === params.action);
          const total = list.length;
          const start = (page - 1) * pageSize;
          return { list: list.slice(start, start + pageSize), total, page, pageSize };
        })())
      : request<AuditLogListResponse>("/system/audit", {
          query: {
            page: params.page,
            pageSize: params.pageSize,
            userId: params.userId,
            action: params.action,
            startTime: params.startTime,
            endTime: params.endTime,
          },
        }),

  /* ============ 新增：系统设置 ============ */
  getSystemSettings: (): Promise<Record<string, unknown>> =>
    useMock() ? delay({}) : request<Record<string, unknown>>("/system/settings"),

  /* ============ 新增：AI 能力 ============ */
  aiQuery: (query: string): Promise<AIQueryResponse> =>
    useMock()
      ? delay({
          understood: false,
          placeholder: true,
          message: "mock 模式：未对接 AI",
        } as AIQueryResponse)
      : request<AIQueryResponse>("/ai/query", { method: "POST", body: { query } }),
  aiHealth: (): Promise<AIHealth> =>
    useMock()
      ? delay({ configured: false } as AIHealth)
      : request<AIHealth>("/ai/health"),

  /* ============ V2：连接器目录与数据源 ============ */
  listConnectors: (): Promise<Connector[]> =>
    useMock()
      ? delay(mock.connectors)
      : request<{ list: Connector[] }>("/collection/connectors").then((r) => r.list),
  getConnector: (type: string): Promise<Connector> =>
    useMock()
      ? delay(mock.connectors.find((c) => c.type === type) ?? { type, name: type, category: "db", capabilities: [], implemented: false } as Connector)
      : request<Connector>(`/collection/connectors/${encodeURIComponent(type)}`),
  testSource: (config: Record<string, unknown>): Promise<{ status: string; latencyMs: number; error?: string }> =>
    useMock()
      ? delay({ status: "online", latencyMs: Math.floor(Math.random() * 50 + 10) })
      : request<{ status: string; latencyMs: number; error?: string }>("/collection/sources/test", {
          method: "POST",
          body: config,
        }),
  testSourceById: (id: string): Promise<{ status: string; latencyMs: number; error?: string }> =>
    useMock()
      ? delay({ status: "online", latencyMs: Math.floor(Math.random() * 50 + 10) })
      : request<{ status: string; latencyMs: number; error?: string }>(
          `/collection/sources/${encodeURIComponent(id)}/test`,
          { method: "POST" },
        ),
  discoverSource: (id: string): Promise<StreamCatalog> =>
    useMock()
      ? delay(mock.streamCatalog)
      : request<StreamCatalog>(`/collection/sources/${encodeURIComponent(id)}/discover`, {
          method: "POST",
        }),
  getSourceHealthHistory: (
    id: string,
  ): Promise<{ checkedAt: string; latencyMs: number; status: string; error?: string }[]> =>
    useMock()
      ? delay([
          { checkedAt: "2026-07-16 09:00:00", latencyMs: 12, status: "online" },
          { checkedAt: "2026-07-16 06:00:00", latencyMs: 18, status: "online" },
          { checkedAt: "2026-07-16 03:00:00", latencyMs: 9, status: "online" },
          { checkedAt: "2026-07-15 23:00:00", latencyMs: 350, status: "degraded", error: "超时" },
        ])
      : request<{ checkedAt: string; latencyMs: number; status: string; error?: string }[]>(
          `/collection/sources/${encodeURIComponent(id)}/health-history`,
        ),
  createSource: (payload: {
    name: string;
    connectorType: string;
    endpoint?: string;
    username?: string;
    password?: string;
    config?: Record<string, unknown>;
    sceneId?: string;
    type?: string;
    owner?: string;
  }): Promise<DataSource> =>
    useMock()
      ? delay({
          id: `DS-${Date.now()}`,
          name: payload.name,
          type: payload.type || payload.connectorType || "REST API",
          status: "online",
          records: "0 条",
          updateFreq: payload.config && (payload.config as { updateFreq?: string }).updateFreq ? (payload.config as { updateFreq: string }).updateFreq : "实时",
          owner: payload.owner || payload.username || "—",
        } as DataSource)
      : request<DataSource>("/collection/sources", { method: "POST", body: payload }),
  updateSource: (id: string, payload: Partial<{
    name: string;
    connectorType: string;
    endpoint?: string;
    username?: string;
    password?: string;
    config?: Record<string, unknown>;
    sceneId?: string;
    owner?: string;
  }>): Promise<DataSource> =>
    useMock()
      ? delay({ id, name: payload.name ?? "", type: payload.connectorType ?? "", status: "online", records: "0 条", updateFreq: "实时", owner: payload.owner ?? "—" } as DataSource)
      : request<DataSource>(`/collection/sources/${encodeURIComponent(id)}`, { method: "PUT", body: payload }),
  deleteSource: (id: string): Promise<{ success: boolean }> =>
    useMock()
      ? delay({ success: true })
      : request<{ success: boolean }>(`/collection/sources/${encodeURIComponent(id)}`, { method: "DELETE" }),

  /* ============ V2：Transform 管道 ============ */
  listTransformTypes: (): Promise<TransformType[]> =>
    useMock() ? delay(mock.transformTypes) : request<TransformType[]>("/collection/transforms/types"),
  previewTransform: (
    sample: Record<string, unknown>,
    pipeline: TransformPipeline,
  ): Promise<unknown> =>
    useMock()
      ? delay({ output: sample, dirtyCount: 0 })
      : request<unknown>("/collection/transforms/preview", {
          method: "POST",
          body: { sample, pipeline },
        }),

  /* ============ V2：采集任务运行时 ============ */
  triggerTask: (id: string): Promise<{ runId: string; status: string }> =>
    useMock()
      ? delay({ runId: `run-${Date.now()}`, status: "accepted" })
      : request<{ runId: string; status: string }>(
          `/collection/tasks/${encodeURIComponent(id)}/trigger`,
          { method: "POST", body: {} },
        ),
  listRuns: (taskId: string): Promise<CollectionTaskRun[]> =>
    useMock()
      ? delay(mock.collectionTaskRuns.filter((r) => r.taskId === taskId))
      : request<CollectionTaskRun[]>(`/collection/tasks/${encodeURIComponent(taskId)}/runs`),
  listCheckpoints: (taskId: string): Promise<Checkpoint[]> =>
    useMock()
      ? delay(
          mock.collectionTaskRuns
            .filter((r) => r.taskId === taskId && r.checkpoint)
            .map((r) => ({ taskId, shardId: "shard-0", state: r.checkpoint as string })),
        )
      : request<Checkpoint[]>(`/collection/tasks/${encodeURIComponent(taskId)}/checkpoints`),
  listDirtyRecords: (taskId: string, runId?: string): Promise<DirtyRecord[]> =>
    useMock()
      ? delay(
          mock.dirtyRecords.filter(
            (d) => d.taskId === taskId && (!runId || d.runId === runId),
          ),
        )
      : request<DirtyRecord[]>(`/collection/tasks/${encodeURIComponent(taskId)}/dirty`, {
          query: { runId },
        }),
  listTaskAudit: (taskId: string): Promise<AuditPoint[]> =>
    useMock()
      ? delay(mock.auditPoints.filter((a) => a.taskId === taskId))
      : request<AuditPoint[]>(`/collection/tasks/${encodeURIComponent(taskId)}/audit`),

  /* ============ V2：监管场景与模型 ============ */
  listRegulatoryScenes: (domain?: string): Promise<RegulatoryScene[]> =>
    useMock()
      ? delay(mock.regulatoryScenes.filter((s) => !domain || s.domain === domain))
      : request<RegulatoryScene[]>("/regulatory/scenes", { query: { domain } }),
  getRegulatoryModel: (id: string): Promise<RegulatoryModel> =>
    useMock()
      ? delay({
          id,
          sceneId: id.startsWith("m-fin-") ? `sc-fin-${id.split("-")[2]}` : "",
          domain: "finance-risk",
          name: id,
          status: "online",
          indicators: [],
        } as RegulatoryModel)
      : request<RegulatoryModel>(`/regulatory/models/${encodeURIComponent(id)}`),
  testModel: (id: string, facts: Record<string, unknown>): Promise<unknown> =>
    useMock()
      ? delay({ matched: true, modelId: id, facts, hits: [{ level: "yellow", evidence: facts }] })
      : request<unknown>(`/regulatory/models/${encodeURIComponent(id)}/test`, {
          method: "POST",
          body: { facts },
        }),

  /* ============ V2：风险闭环 ============ */
  listClues: (filter: {
    status?: string;
    riskLevel?: string;
    sceneId?: string;
    orgCode?: string;
    limit?: number;
  } = {}): Promise<RiskClue[]> =>
    useMock()
      ? delay(
          mock.riskClues.filter((c) => {
            if (filter.status && c.status !== filter.status) return false;
            if (filter.riskLevel && c.riskLevel !== filter.riskLevel) return false;
            if (filter.sceneId && c.sceneId !== filter.sceneId) return false;
            if (filter.orgCode && c.orgCode !== filter.orgCode) return false;
            return true;
          }),
        )
      : request<RiskClue[]>("/risk/clues", {
          query: {
            status: filter.status,
            riskLevel: filter.riskLevel,
            sceneId: filter.sceneId,
            orgCode: filter.orgCode,
            limit: filter.limit,
          },
        }),
  getClue: (id: string): Promise<RiskClue> =>
    useMock()
      ? delay(mock.riskClues.find((c) => c.id === id) ?? ({} as RiskClue))
      : request<RiskClue>(`/risk/clues/${encodeURIComponent(id)}`),
  dispatchClue: (id: string): Promise<{ clueId: string; orderId: string; owner: string | null }> =>
    useMock()
      ? delay({ clueId: id, orderId: `WO-${Date.now()}`, owner: null })
      : request<{ clueId: string; orderId: string; owner: string | null }>(
          `/risk/clues/${encodeURIComponent(id)}/dispatch`,
          { method: "POST" },
        ),
  disposeClue: (
    id: string,
    body: { step: string; handler: string; comment?: string; roleCode?: string },
  ): Promise<RiskDisposal> =>
    useMock()
      ? delay({ id: Date.now(), clueId: id, ...body, createdAt: new Date().toISOString() } as RiskDisposal)
      : request<RiskDisposal>(`/risk/clues/${encodeURIComponent(id)}/dispose`, {
          method: "POST",
          body,
        }),
  closeClue: (id: string): Promise<{ clueId: string; orderId: string | null }> =>
    useMock()
      ? delay({ clueId: id, orderId: `WO-${Date.now()}` })
      : request<{ clueId: string; orderId: string | null }>(
          `/risk/clues/${encodeURIComponent(id)}/close`,
          { method: "POST" },
        ),
  listDisposals: (clueId: string): Promise<RiskDisposal[]> =>
    useMock()
      ? delay([
          { id: 1, clueId, step: "detect", handler: "system", comment: "模型命中自动生成", createdAt: "2026-07-16 09:18:00" },
          { id: 2, clueId, step: "dispatch", handler: "system", comment: "红线自动派单", createdAt: "2026-07-16 09:18:05" },
        ] as RiskDisposal[])
      : request<RiskDisposal[]>(`/risk/clues/${encodeURIComponent(clueId)}/disposals`),
  myTodos: (): Promise<unknown[]> =>
    useMock()
      ? delay([
          { id: "todo-1", clueId: "RC20260715-008", title: "融资性贸易线索 · 待认领", status: "pending", riskLevel: "red" },
          { id: "todo-2", clueId: "RC20260715-009", title: "超股比担保线索 · 待认领", status: "pending", riskLevel: "yellow" },
        ])
      : request<unknown[]>("/risk/my-todos"),
  claimTodo: (todoId: string): Promise<{ ok: boolean }> =>
    useMock()
      ? delay({ ok: true })
      : request<{ ok: boolean }>(`/risk/todos/${encodeURIComponent(todoId)}/claim`, {
          method: "POST",
        }),
  completeTodo: (todoId: string, result?: string): Promise<{ ok: boolean }> =>
    useMock()
      ? delay({ ok: true })
      : request<{ ok: boolean }>(`/risk/todos/${encodeURIComponent(todoId)}/complete`, {
          method: "POST",
          body: { result },
        }),

  /* ============ V2：穿透查询与联查 ============ */
  drillPenetration: (
    layer: "ads" | "dws" | "dwd" | "ods",
    id: string,
  ): Promise<PenetrationResult> =>
    useMock()
      ? delay({
          layer,
          ids:
            layer === "ads"
              ? ["dws-payment-flow-block-1"]
              : layer === "dws"
                ? ["dwd-payment-flow-detail-1", "dwd-payment-flow-detail-2"]
                : layer === "dwd"
                  ? ["ods-payment-flow-doc-1"]
                  : [id],
          details:
            layer === "ods"
              ? [
                  {
                    docId: id,
                    stream: "payment_flow",
                    record: { voucherNo: "V20260716001", amount: 8600000, payee: "Everwin Holdings" },
                  },
                ]
              : undefined,
        })
      : request<PenetrationResult>(`/penetration/${layer}/${encodeURIComponent(id)}`),
  getLineage: (sceneId?: string): Promise<LineageGraph> =>
    useMock()
      ? delay({
          nodes: [
            { id: "ads-dup-pay", label: "ADS 重复支付指标", layer: "ads" },
            { id: "dws-payment-block", label: "DWS 支付流水板块", layer: "dws" },
            { id: "dwd-payment-detail", label: "DWD 支付明细", layer: "dwd" },
            { id: "ods-voucher", label: "ODS 原始凭证", layer: "ods" },
          ],
          edges: [
            { source: "ads-dup-pay", target: "dws-payment-block", label: "aggregates" },
            { source: "dws-payment-block", target: "dwd-payment-detail", label: "contains" },
            { source: "dwd-payment-detail", target: "ods-voucher", label: "contains" },
          ],
        })
      : request<LineageGraph>("/penetration/lineage", { query: { sceneId } }),
  listLinkageRules: (sceneId?: string): Promise<LinkageRule[]> =>
    useMock()
      ? delay(mock.linkageRules.filter((r) => !sceneId || r.sceneId === sceneId))
      : request<LinkageRule[]>("/linkage/rules", { query: { sceneId } }),
  executeLinkageRule: (id: string, entryEntity: string): Promise<unknown> =>
    useMock()
      ? delay({
          rule: mock.linkageRules.find((r) => r.id === id),
          entryEntity,
          chain: [
            { layer: "ads", id: entryEntity, ts: "2026-07-16 09:18:00" },
            { layer: "dws", id: "dws-payment-block", ts: "2026-07-16 09:18:01" },
            { layer: "dwd", id: "dwd-payment-detail", ts: "2026-07-16 09:18:02" },
            { layer: "ods", id: "ods-voucher-001", ts: "2026-07-16 09:18:03" },
          ],
        })
      : request<unknown>(`/linkage/rules/${encodeURIComponent(id)}/execute`, {
          method: "POST",
          body: { entryEntity },
        }),

  /* ============ V2：AI 智能体 ============ */
  listAgents: (): Promise<Agent[]> =>
    useMock()
      ? delay(mock.agents)
      : request<{ list: Agent[] }>("/ai/agents").then((r) => r.list),
  getAgent: (id: string): Promise<Agent> =>
    useMock()
      ? delay(mock.agents.find((a) => a.id === id) ?? ({} as Agent))
      : request<Agent>(`/ai/agents/${encodeURIComponent(id)}`),
  invokeAgent: (id: string, input: Record<string, unknown>): Promise<AgentInvokeResponse> =>
    useMock()
      ? delay({
          configured: false,
          message: "mock 模式：未对接 LLM，返回占位响应",
          agentId: id,
          ...(id === "text-compare" ? { similarity: 0.85, diff: [] } : {}),
          ...(id === "info-extract" ? { fields: {}, confidence: 0 } : {}),
          ...(id === "report-generate" ? { report: "## 风险处置报告（占位）\n\n本报告由 mock 模式生成。", clueCount: 0 } : {}),
        })
      : request<AgentInvokeResponse>(`/ai/agents/${encodeURIComponent(id)}/invoke`, {
          method: "POST",
          body: input,
        }),
  orchestrateAgents: (
    workflow: string,
    input: Record<string, unknown>,
  ): Promise<OrchestrateResult> =>
    useMock()
      ? delay({
          workflow,
          status: "success",
          nodes: [
            { node: "info-extract", status: "success", output: { fields: {} }, latencyMs: 12 },
            { node: "graph-build", status: "success", output: { graphId: "g-mock" }, latencyMs: 8 },
            { node: "report-generate", status: "success", output: { report: "## 风险处置报告（占位）" }, latencyMs: 15 },
          ],
          finalOutput: { report: "## 风险处置报告（占位）\n\nmock 模式：未对接 LLM" },
          totalLatencyMs: 35,
        } as OrchestrateResult)
      : request<OrchestrateResult>("/ai/agents/orchestrate", {
          method: "POST",
          body: { workflow, input },
        }),

  /* ============ 后台：用户管理 ============ */
  listUsers: (): Promise<AdminUser[]> =>
    useMock() ? delay(mock.adminUsers) : request<AdminUser[]>("/admin/users"),
  createUser: (payload: Omit<AdminUser, "id" | "lastLoginAt" | "createdAt">): Promise<AdminUser> =>
    useMock()
      ? delay({
          ...payload,
          id: `u-${Date.now()}`,
          lastLoginAt: "—",
          createdAt: new Date().toISOString().slice(0, 19).replace("T", " "),
        } as AdminUser)
      : request<AdminUser>("/admin/users", { method: "POST", body: payload }),
  updateUser: (id: string, payload: Partial<AdminUser>): Promise<AdminUser> =>
    useMock()
      ? delay({ ...mock.adminUsers.find((u) => u.id === id), ...payload } as AdminUser)
      : request<AdminUser>(`/admin/users/${encodeURIComponent(id)}`, {
          method: "PUT",
          body: payload,
        }),
  deleteUser: (id: string): Promise<{ success: boolean }> =>
    useMock() ? delay({ success: true }) : request<{ success: boolean }>(`/admin/users/${encodeURIComponent(id)}`, { method: "DELETE" }),

  /* ============ 后台：角色与权限 ============ */
  listRoles: (): Promise<AdminRoleDef[]> =>
    useMock() ? delay(mock.adminRoles) : request<AdminRoleDef[]>("/admin/roles"),
  updateRole: (id: string, permissions: PermissionMatrix[]): Promise<AdminRoleDef> =>
    useMock()
      ? delay({
          ...(mock.adminRoles.find((r) => r.id === id) as AdminRoleDef),
          permissions,
        })
      : request<AdminRoleDef>(`/admin/roles/${encodeURIComponent(id)}`, {
          method: "PUT",
          body: { permissions },
        }),

  /* ============ 后台：告警 ============ */
  listAdminAlerts: (filter: { severity?: string; status?: string } = {}): Promise<AdminAlert[]> =>
    useMock()
      ? delay(
          mock.adminAlerts.filter((a) => {
            if (filter.severity && a.severity !== filter.severity) return false;
            if (filter.status && a.status !== filter.status) return false;
            return true;
          }),
        )
      : request<AdminAlert[]>("/admin/alerts", {
          query: { severity: filter.severity, status: filter.status },
        }),
  confirmAlert: (id: string, confirmBy: string): Promise<AdminAlert> =>
    useMock()
      ? delay({ ...(mock.adminAlerts.find((a) => a.id === id) as AdminAlert), status: "confirmed", confirmedBy: confirmBy })
      : request<AdminAlert>(`/admin/alerts/${encodeURIComponent(id)}/confirm`, {
          method: "POST",
          body: { confirmBy },
        }),
  silenceAlert: (id: string): Promise<AdminAlert> =>
    useMock()
      ? delay({ ...(mock.adminAlerts.find((a) => a.id === id) as AdminAlert), status: "silenced" })
      : request<AdminAlert>(`/admin/alerts/${encodeURIComponent(id)}/silence`, {
          method: "POST",
        }),

  /* ============ 后台：驾驶舱 KPI ============ */
  getCockpitKpi: (): Promise<CockpitKpi> =>
    useMock() ? delay(mock.cockpitKpi) : request<CockpitKpi>("/admin/cockpit/kpi"),

  /* ============ 后台：脱敏策略 ============ */
  listMaskingRules: (): Promise<MaskingRule[]> =>
    useMock() ? delay(mock.maskingRules) : request<MaskingRule[]>("/admin/masking/rules"),
  createMaskingRule: (payload: Omit<MaskingRule, "id">): Promise<MaskingRule> =>
    useMock()
      ? delay({ ...payload, id: `MR-${Date.now()}` } as MaskingRule)
      : request<MaskingRule>("/admin/masking/rules", { method: "POST", body: payload }),
  toggleMaskingRule: (id: string, enabled: boolean): Promise<MaskingRule> =>
    useMock()
      ? delay({ ...(mock.maskingRules.find((r) => r.id === id) as MaskingRule), enabled })
      : request<MaskingRule>(`/admin/masking/rules/${encodeURIComponent(id)}/toggle`, {
          method: "PUT",
          body: { enabled },
        }),
  listMaskingEvents: (): Promise<MaskingEvent[]> =>
    useMock() ? delay(mock.maskingEvents) : request<MaskingEvent[]>("/admin/masking/events"),
};
