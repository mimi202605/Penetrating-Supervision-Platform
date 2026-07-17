// 智慧监督中心 - 监管态势聚合（Doris 等价分析查询）
// 返回与前端 src/mock/index.ts 字段一致的常量值，保证视觉一致
import type { FastifyInstance, FastifyPluginCallback, FastifyReply, FastifyRequest } from "fastify";
import { requirePermission } from "../platform/rbac.js";

// ===================== 监管总览常量（对齐 mock） =====================

const kpiSnapshot = {
  coverageRate: 98.6,
  coverageDelta: 0.4,
  penetrationLevel: 5,
  penetrationTag: "全级次",
  riskCount: 326,
  riskDelta: "↑ 12%",
  pendingOrders: 47,
  pendingDelta: "↑ 5",
  dataVolume: 1.28,
  dataVolumeDelta: "↑ 8.2%",
};

const centers = [
  {
    name: "数据采集中心",
    status: "running" as const,
    metrics: [
      { label: "采集源", value: "246" },
      { label: "今日采集", value: "1.28亿" },
      { label: "异常", value: "0" },
    ],
    health: 99,
    healthTone: "success" as const,
  },
  {
    name: "智慧监督中心",
    status: "running" as const,
    metrics: [
      { label: "监控规则", value: "1,820" },
      { label: "在线模型", value: "36" },
      { label: "预警命中", value: "326" },
    ],
    health: 97,
    healthTone: "success" as const,
  },
  {
    name: "调度指挥中心",
    status: "warning" as const,
    metrics: [
      { label: "在办工单", value: "47" },
      { label: "平均处置", value: "4.2h" },
      { label: "按时率", value: "96%" },
    ],
    health: 95,
    healthTone: "warning" as const,
  },
];

const domains = [
  { name: "投资领域", level: "high" as const, riskCount: 86, desc: "投资决策越权、收益异常" },
  { name: "产权领域", level: "medium" as const, riskCount: 54, desc: "产权变动违规" },
  { name: "财务领域", level: "high" as const, riskCount: 92, desc: "资金异动、关联交易" },
  { name: "会计领域", level: "medium" as const, riskCount: 38, desc: "会计信息失真" },
  { name: "薪酬分配领域", level: "medium" as const, riskCount: 27, desc: "薪酬乱象" },
  { name: "金融风险领域", level: "high" as const, riskCount: 71, desc: "过度负债、融资风险" },
  { name: "军品业务领域", level: "low" as const, riskCount: 19, desc: "军品合规" },
  { name: "采购与供应链领域", level: "medium" as const, riskCount: 45, desc: "虚假贸易、采购违规" },
  { name: "境外单位领域", level: "medium" as const, riskCount: 33, desc: "境外风险" },
  { name: "合同领域", level: "low" as const, riskCount: 22, desc: "合同合规" },
];

const frameworkSystems = [
  { num: "1", name: "组织领导体系", desc: "统一领导、分级负责" },
  { num: "2", name: "监管系统体系", desc: "一平台三中心" },
  { num: "3", name: "监督追责体系", desc: "闭环问责机制" },
  { num: "4", name: "监管制度体系", desc: "制度规范全覆盖" },
];

const frameworkStrengths = [
  { icon: "database", name: "数据资源布局", desc: "数据全量汇聚", variant: "primary" as const },
  { icon: "trending-up", name: "数据有效治理", desc: "数据质量保障", variant: "primary" as const },
  { icon: "credit-card", name: "司库平台升级", desc: "资金实时监控", variant: "primary" as const },
  { icon: "cpu", name: "人工智能应用", desc: "AI智能分析", variant: "primary" as const },
  { icon: "shield-check", name: "系统安全保密", desc: "安全防护升级", variant: "primary" as const },
];

const riskCatalog = [
  { name: "过度负债", level: "high" as const, tag: "高风险" },
  { name: "财务金融风险", level: "high" as const, tag: "高风险" },
  { name: "靠企吃企", level: "high" as const, tag: "高风险" },
  { name: "控股不控权", level: "high" as const, tag: "高风险" },
  { name: "无关多元", level: "medium" as const, tag: "中风险" },
  { name: "多层架构", level: "medium" as const, tag: "中风险" },
  { name: "薪酬乱象", level: "medium" as const, tag: "中风险" },
  { name: "虚假贸易", level: "medium" as const, tag: "中风险" },
  { name: "境外风险", level: "medium" as const, tag: "中风险" },
  { name: "捞偏门", level: "low" as const, tag: "低风险" },
  { name: "资产闲置", level: "low" as const, tag: "低风险" },
  { name: "+ N", level: "more" as const, tag: "持续扩展" },
];

const guarantees = [
  { icon: "server", name: "支撑保障", desc: "技术资源支撑" },
  { icon: "users", name: "队伍建设", desc: "专业人才保障" },
  { icon: "flag", name: "成果运用", desc: "监管成果转化" },
  { icon: "refresh-cw", name: "宣传引导", desc: "监管文化培育" },
];

const doughnutSlices = [
  { name: "过度负债", value: 78, color: "#387bff" },
  { name: "财务金融风险", value: 92, color: "#f0a50f" },
  { name: "靠企吃企", value: 64, color: "#ff706d" },
  { name: "控股不控权", value: 53, color: "#7ccd94" },
  { name: "其他", value: 39, color: "#86909c" },
];

const healthBars = [
  { name: "集团总部", value: 96, color: "#387bff" },
  { name: "业务板块", value: 91, color: "#7ccd94" },
  { name: "所属企业", value: 88, color: "#387bff" },
];

const financeRiskCards = [
  { title: "资金异动监测", level: "high" as const, count: 18, desc: "大额异地支付、频繁关联交易、超预算支付", icon: "banknote" },
  { title: "关联交易", level: "medium" as const, count: 24, desc: "未审批关联交易、关联方资金占用", icon: "link" },
  { title: "虚假贸易", level: "high" as const, count: 9, desc: "循环贸易、无商业实质交易", icon: "file-warning" },
  { title: "违规担保", level: "medium" as const, count: 6, desc: "对外担保超限额、互保链", icon: "shield-alert" },
];

// ===================== 趋势算法（与 mock 一致，近30天） =====================

const BASE_DATE = new Date(2026, 6, 16); // 2026-07-16（month 0-indexed）

function formatDateLabel(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildCollectionTrend() {
  const arr: {
    date: string;
    investment: number;
    finance: number;
    financial: number;
    compliance: number;
  }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(BASE_DATE);
    d.setDate(d.getDate() - i);
    arr.push({
      date: formatDateLabel(d),
      investment: 8 + Math.round(Math.sin(i / 3) * 3) + (i % 5),
      finance: 12 + Math.round(Math.cos(i / 4) * 4) + (i % 4),
      financial: 6 + Math.round(Math.sin(i / 5) * 2) + (i % 3),
      compliance: 3 + (i % 3),
    });
  }
  return arr;
}

function buildFinanceTrend() {
  const arr: { date: string; inflow: number; outflow: number; net: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(BASE_DATE);
    d.setDate(d.getDate() - i);
    const inflow = 800 + Math.round(Math.sin(i / 3) * 200) + (i % 7) * 30;
    const outflow = 700 + Math.round(Math.cos(i / 4) * 180) + (i % 5) * 40;
    arr.push({ date: formatDateLabel(d), inflow, outflow, net: inflow - outflow });
  }
  return arr;
}

/** 监管态势聚合路由插件 */
export const registerMonitoringOverview: FastifyPluginCallback = (app: FastifyInstance, _opts, done) => {
  // GET /monitoring/overview：聚合 KPI / 中心 / 领域 / 框架 / 风险目录 / 保障
  app.get(
    "/monitoring/overview",
    { preHandler: [app.authenticate] },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      reply.send({
        kpi: kpiSnapshot,
        centers,
        domains,
        framework: { frameworkSystems, frameworkStrengths },
        riskCatalog,
        guarantees,
      });
    },
  );

  // GET /monitoring/trend：采集趋势（近30天）
  app.get(
    "/monitoring/trend",
    { preHandler: [app.authenticate] },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      reply.send(buildCollectionTrend());
    },
  );

  // GET /monitoring/doughnut：风险分布环形图
  app.get(
    "/monitoring/doughnut",
    { preHandler: [app.authenticate] },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      reply.send(doughnutSlices);
    },
  );

  // GET /monitoring/health-bars：健康度柱状图
  app.get(
    "/monitoring/health-bars",
    { preHandler: [app.authenticate] },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      reply.send(healthBars);
    },
  );

  // GET /monitoring/finance/risks：财务资金风险卡片
  app.get(
    "/monitoring/finance/risks",
    { preHandler: [app.authenticate] },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      reply.send(financeRiskCards);
    },
  );

  // GET /monitoring/finance/trend：财务资金趋势（近30天）
  app.get(
    "/monitoring/finance/trend",
    { preHandler: [app.authenticate, requirePermission("risk:read")] },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      reply.send(buildFinanceTrend());
    },
  );

  done();
};
