// API 类型定义：与未来后端 OpenAPI 对齐，本期 mock 数据按此契约构造

export type RiskLevel = "high" | "medium" | "low";
export type RiskStatus = "pending" | "processing" | "resolved";
export type WorkOrderNode = "verify" | "rectify" | "review" | "archive";
export type WorkOrderStatus = "processing" | "archived";

export interface KpiSnapshot {
  coverageRate: number; // 监管覆盖率 %
  coverageDelta: number; // 环比变化（百分点）
  penetrationLevel: number; // 穿透层级
  penetrationTag: string; // 全级次 / 4级
  riskCount: number; // 风险预警数（本月）
  riskDelta: string; // "↑ 12%" / "↓ 5%"
  pendingOrders: number; // 待处置工单
  pendingDelta: string;
  dataVolume: number; // 数据采集量（亿条）
  dataVolumeDelta: string;
}

export interface CenterStatus {
  name: string;
  status: "running" | "warning" | "error";
  metrics: { label: string; value: string }[];
  health: number; // 0-100
  healthTone: "success" | "warning" | "danger";
}

export interface DomainRisk {
  name: string;
  level: RiskLevel;
  riskCount: number;
  desc: string;
}

export interface FrameworkItem {
  num?: string;
  icon?: string; // lucide name
  name: string;
  desc: string;
  variant?: "default" | "primary";
}

export interface RiskPill {
  name: string;
  level: RiskLevel | "more";
  tag: string;
}

export interface RiskWarning {
  id: string;
  title: string;
  domain: string;
  level: RiskLevel;
  subject: string;
  rule: string;
  triggeredAt: string; // YYYY-MM-DD HH:mm
  status: RiskStatus;
  clue?: string;
  relatedOrderId?: string;
  raw?: { label: string; value: string }[];
}

export interface WorkOrder {
  id: string;
  riskSource: string;
  owner: string;
  currentNode: WorkOrderNode;
  progress: number; // 0-100
  status: WorkOrderStatus;
}

export interface CollectionTask {
  id: string;
  name: string;
  source: "浪潮 iGIX" | "司库 MySQL" | "司库 Oracle" | "其他";
  mode: "全量" | "增量" | "CDC";
  schedule: string;
  lastStatus: "成功" | "失败" | "运行中";
  throughput: string;
  lastRun: string;
}

export interface DataSource {
  id: string;
  name: string;
  type: string;
  status: "online" | "offline" | "error";
  records: string;
  updateFreq: string;
  owner: string;
}

export interface GraphNode {
  id: string;
  label: string;
  type: "account" | "counterparty" | "org" | "person";
  meta?: string;
}
export interface GraphEdge {
  source: string;
  target: string;
  label?: string;
  weight?: number;
}

export interface TrendPoint {
  date: string; // MM-DD
  investment: number;
  finance: number;
  financial: number;
  compliance: number;
}

export interface DoughnutSlice {
  name: string;
  value: number;
  color: string;
}

export interface HealthBar {
  name: string;
  value: number;
  color: string;
}

/* ===================== Task 9 增补：前后台衔接类型 ===================== */

// 登录请求
export interface LoginRequest {
  username: string;
  password: string;
}

// 登录响应（对齐后端 POST /auth/login 返回结构）
export interface LoginResponse {
  token: string;
  user: {
    id: string;
    username: string;
    role: string;
    name: string;
    org_id?: string;
  };
}

// 推进工单请求（POST /dispatch/work-orders/:id/advance）
export interface AdvanceWorkOrderRequest {
  result?: string;
}

// 规则试算请求（POST /monitoring/rules/:id/evaluate）
export interface EvaluateRuleRequest {
  facts: Record<string, unknown>;
}

// 审计日志条目（对齐后端 /system/audit transformAuditRow 字段）
export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  target: string;
  ip: string;
  detail: string;
  createdAt: string;
}

// 审计日志分页响应
export interface AuditLogListResponse {
  list: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
}

// AI 自然语言查询请求
export interface AIQueryRequest {
  query: string;
}

// AI 自然语言查询响应（已配置/未配置两种形态兼容）
export interface AIQueryResponse {
  understood: boolean;
  intent?: string;
  suggestedSql?: string;
  suggestedGraphQuery?: string;
  content?: string;
  message?: string;
  placeholder?: boolean;
  [key: string]: unknown;
}

// AI 健康检查响应
export interface AIHealth {
  configured: boolean;
  provider?: string;
  endpoint?: string;
  latency?: number | null;
  [key: string]: unknown;
}

// 指挥大屏聚合响应（GET /dispatch/dashboard）
export interface DashboardResponse {
  kpis: { label: string; value: string; trend?: string; tone?: "up" | "down" }[];
  heatmap: { area: string; high: number; medium: number; low: number }[];
  pendingStats: {
    byNode: Record<string, number>;
    byOwner: { owner: string; count: number }[];
  };
}
