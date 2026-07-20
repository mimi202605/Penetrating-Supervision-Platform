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

/** 401 处理：清理 token 并跳登录页（防重入，避免并发请求触发多次跳转） */
let isRedirectingToLogin = false;
function handle401(): void {
  localStorage.removeItem("supervision_token");
  if (isRedirectingToLogin) return;
  isRedirectingToLogin = true;
  // 仅在非登录页时跳转，避免登录页 401 死循环
  if (!window.location.hash.includes("/login")) {
    const next = encodeURIComponent(window.location.hash.slice(1) || "/");
    window.location.hash = `/login?next=${next}`;
  }
  setTimeout(() => { isRedirectingToLogin = false; }, 1000);
}

/** 通用 fetch 封装：拼 url、带 Authorization、处理 JSON、非 2xx 抛错、401 清 token 跳登录 */
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

  // 网络错误统一包装为 ApiError，避免 TypeError 直接暴露给调用方
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: finalHeaders,
      body: payload,
      signal,
    });
  } catch (err) {
    const error = new Error(
      (err as Error)?.message || "网络异常，请检查网络连接或后端服务是否可用",
    ) as ApiError;
    error.statusCode = 0;
    error.response = null;
    throw error;
  }

  // 401：清理 token 并跳登录页
  if (res.status === 401) {
    handle401();
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
  createWorkOrder: (body: CreateWorkOrderRequest): Promise<WorkOrder> =>
    useMock()
      ? delay({
          id: `WO-MOCK-${Date.now()}`,
          riskSource: body.riskSource,
          owner: body.owner ?? "未分配",
          currentNode: "verify",
          progress: 0,
          status: "processing",
          riskWarningId: body.riskWarningId ?? null,
          createdAt: new Date().toISOString().slice(0, 16).replace("T", " "),
          updatedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
        } as WorkOrder)
      : request<WorkOrder>("/dispatch/work-orders", { method: "POST", body }),

  /* ============ 数据采集 ============ */
  getCollectionTasks: (): Promise<CollectionTask[]> =>
    useMock()
      ? delay(mock.collectionTasks)
      : request<CollectionTask[]>("/collection/tasks"),
  createCollectionTask: (body: {
    name: string;
    source?: string;
    mode?: string;
    schedule?: string;
    sourceId?: string;
    sinkType?: string;
    sinkTarget?: string;
    transformPipeline?: unknown[];
    concurrency?: number;
    retryMax?: number;
    retryIntervalSec?: number;
    timeoutSec?: number;
    priority?: number;
    dependsOn?: string[];
    enabled?: number;
    sceneId?: string;
    modelId?: string;
  }): Promise<CollectionTask> =>
    useMock()
      ? delay({
          id: `T-MOCK-${Date.now()}`,
          name: body.name,
          source: (body.source as CollectionTask["source"]) || "其他",
          mode: (body.mode as CollectionTask["mode"]) || "增量",
          schedule: body.schedule || "*/30 * * * *",
          lastStatus: "成功",
          throughput: "—",
          lastRun: new Date().toISOString().slice(0, 16).replace("T", " "),
        } as CollectionTask)
      : request<CollectionTask>("/collection/tasks", { method: "POST", body }),
  getDataSources: (): Promise<DataSource[]> =>
    useMock()
      ? delay(mock.dataSources)
      : request<DataSource[]>("/collection/sources"),
  createDataSource: (body: {
    name: string;
    connectorType?: string;
    type?: string;
    status?: string;
    records?: string;
    updateFreq?: string;
    owner?: string;
    endpoint?: string;
    authType?: string;
    sceneId?: string;
    config?: Record<string, unknown>;
  }): Promise<DataSource> =>
    useMock()
      ? delay({
          id: `DS-MOCK-${Date.now()}`,
          name: body.name,
          type: (body.type as DataSource["type"]) || "REST API",
          status: "online",
          records: "0 条",
          updateFreq: body.updateFreq || "实时",
          owner: body.owner || "—",
        } as DataSource)
      : request<DataSource>("/collection/sources", { method: "POST", body }),
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
  getDashboard: (): Promise<DashboardResponse> =>
    useMock()
      ? delay({
          kpis: mock.bigScreenKpis,
          heatmap: mock.riskHeatmap,
          pendingStats: { byNode: {}, byOwner: [] },
        })
      : request<DashboardResponse>("/dispatch/dashboard"),

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
      ? delay({ list: [] as AuditLog[], total: 0, page: params.page ?? 1, pageSize: params.pageSize ?? 20 })
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
      ? delay([])
      : request<{ list: Connector[] }>("/collection/connectors").then((r) => r.list),
  getConnector: (type: string): Promise<Connector> =>
    useMock()
      ? delay({ type, name: type, category: "db", capabilities: [], implemented: false } as Connector)
      : request<Connector>(`/collection/connectors/${encodeURIComponent(type)}`),
  testSource: (config: Record<string, unknown>): Promise<{ status: string; latencyMs: number; error?: string }> =>
    useMock()
      ? delay({ status: "online", latencyMs: 10 })
      : request<{ status: string; latencyMs: number; error?: string }>("/collection/sources/test", {
          method: "POST",
          body: config,
        }),
  testSourceById: (id: string): Promise<{ status: string; latencyMs: number; error?: string }> =>
    useMock()
      ? delay({ status: "online", latencyMs: 10 })
      : request<{ status: string; latencyMs: number; error?: string }>(
          `/collection/sources/${encodeURIComponent(id)}/test`,
          { method: "POST" },
        ),
  discoverSource: (id: string): Promise<StreamCatalog> =>
    useMock()
      ? delay({ streams: [] })
      : request<StreamCatalog>(`/collection/sources/${encodeURIComponent(id)}/discover`, {
          method: "POST",
        }),
  getSourceHealthHistory: (
    id: string,
  ): Promise<{ checkedAt: string; latencyMs: number; status: string; error?: string }[]> =>
    useMock()
      ? delay([])
      : request<{ checkedAt: string; latencyMs: number; status: string; error?: string }[]>(
          `/collection/sources/${encodeURIComponent(id)}/health-history`,
        ),

  /* ============ V2：Transform 管道 ============ */
  listTransformTypes: (): Promise<TransformType[]> =>
    useMock() ? delay([]) : request<TransformType[]>("/collection/transforms/types"),
  previewTransform: (
    sample: Record<string, unknown>,
    pipeline: TransformPipeline,
  ): Promise<unknown> =>
    useMock()
      ? delay({ output: sample })
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
      ? delay([])
      : request<CollectionTaskRun[]>(`/collection/tasks/${encodeURIComponent(taskId)}/runs`),
  listCheckpoints: (taskId: string): Promise<Checkpoint[]> =>
    useMock()
      ? delay([])
      : request<Checkpoint[]>(`/collection/tasks/${encodeURIComponent(taskId)}/checkpoints`),
  listDirtyRecords: (taskId: string, runId?: string): Promise<DirtyRecord[]> =>
    useMock()
      ? delay([])
      : request<DirtyRecord[]>(`/collection/tasks/${encodeURIComponent(taskId)}/dirty`, {
          query: { runId },
        }),
  listTaskAudit: (taskId: string): Promise<AuditPoint[]> =>
    useMock()
      ? delay([])
      : request<AuditPoint[]>(`/collection/tasks/${encodeURIComponent(taskId)}/audit`),

  /* ============ V2：监管场景与模型 ============ */
  listRegulatoryScenes: (domain?: string): Promise<RegulatoryScene[]> =>
    useMock()
      ? delay([])
      : request<RegulatoryScene[]>("/regulatory/scenes", { query: { domain } }),
  getRegulatoryModel: (id: string): Promise<RegulatoryModel> =>
    useMock()
      ? delay({ id, sceneId: "", domain: "", name: "", status: "online" } as RegulatoryModel)
      : request<RegulatoryModel>(`/regulatory/models/${encodeURIComponent(id)}`),
  testModel: (id: string, facts: Record<string, unknown>): Promise<unknown> =>
    useMock()
      ? delay({ matched: false, facts })
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
      ? delay([])
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
      ? delay({} as RiskClue)
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
      ? delay({ clueId: id, orderId: null })
      : request<{ clueId: string; orderId: string | null }>(
          `/risk/clues/${encodeURIComponent(id)}/close`,
          { method: "POST" },
        ),
  listDisposals: (clueId: string): Promise<RiskDisposal[]> =>
    useMock()
      ? delay([])
      : request<RiskDisposal[]>(`/risk/clues/${encodeURIComponent(clueId)}/disposals`),
  myTodos: (): Promise<unknown[]> =>
    useMock() ? delay([]) : request<unknown[]>("/risk/my-todos"),
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
      ? delay({ layer, ids: [] })
      : request<PenetrationResult>(`/penetration/${layer}/${encodeURIComponent(id)}`),
  getLineage: (sceneId?: string): Promise<LineageGraph> =>
    useMock()
      ? delay({ nodes: [], edges: [] })
      : request<LineageGraph>("/penetration/lineage", { query: { sceneId } }),
  listLinkageRules: (sceneId?: string): Promise<LinkageRule[]> =>
    useMock()
      ? delay([])
      : request<LinkageRule[]>("/linkage/rules", { query: { sceneId } }),
  executeLinkageRule: (id: string, entryEntity: string): Promise<unknown> =>
    useMock()
      ? delay({ chain: [] })
      : request<unknown>(`/linkage/rules/${encodeURIComponent(id)}/execute`, {
          method: "POST",
          body: { entryEntity },
        }),

  /* ============ V2：AI 智能体 ============ */
  listAgents: (): Promise<Agent[]> =>
    useMock()
      ? delay([])
      : request<{ list: Agent[] }>("/ai/agents").then((r) => r.list),
  getAgent: (id: string): Promise<Agent> =>
    useMock()
      ? delay({} as Agent)
      : request<Agent>(`/ai/agents/${encodeURIComponent(id)}`),
  invokeAgent: (id: string, input: Record<string, unknown>): Promise<AgentInvokeResponse> =>
    useMock()
      ? delay({ configured: false, message: "mock 模式：未对接 AI" })
      : request<AgentInvokeResponse>(`/ai/agents/${encodeURIComponent(id)}/invoke`, {
          method: "POST",
          body: input,
        }),
  orchestrateAgents: (
    workflow: string,
    input: Record<string, unknown>,
  ): Promise<OrchestrateResult> =>
    useMock()
      ? delay({ workflow, status: "success", nodes: [], totalLatencyMs: 0 })
      : request<OrchestrateResult>("/ai/agents/orchestrate", {
          method: "POST",
          body: { workflow, input },
        }),
};
