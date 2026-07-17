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
};
