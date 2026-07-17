import type {
  KpiSnapshot,
  CenterStatus,
  DomainRisk,
  FrameworkItem,
  RiskPill,
  RiskWarning,
  WorkOrder,
  CollectionTask,
  DataSource,
  GraphNode,
  GraphEdge,
  TrendPoint,
  DoughnutSlice,
  HealthBar,
  RiskLevel,
} from "@/api/types";

/* ===================== 监管总览 ===================== */

export const kpiSnapshot: KpiSnapshot = {
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

export const penetrationDimensions: { name: string; desc: string; tone: "info" | "primary" | "success"; icon: string }[] = [
  { name: "全级次组织穿透", desc: "跨层级监管直达底层", tone: "info", icon: "flag" },
  { name: "全链条业务穿透", desc: "业务流程全覆盖", tone: "primary", icon: "list-tree" },
  { name: "全过程时间穿透", desc: "事前事中事后全周期", tone: "success", icon: "clock" },
  { name: "全要素对象穿透", desc: "人财物事全维度", tone: "info", icon: "grid-2x2" },
];

export const centers: CenterStatus[] = [
  {
    name: "数据采集中心",
    status: "running",
    metrics: [
      { label: "采集源", value: "246" },
      { label: "今日采集", value: "1.28亿" },
      { label: "异常", value: "0" },
    ],
    health: 99,
    healthTone: "success",
  },
  {
    name: "智慧监督中心",
    status: "running",
    metrics: [
      { label: "监控规则", value: "1,820" },
      { label: "在线模型", value: "36" },
      { label: "预警命中", value: "326" },
    ],
    health: 97,
    healthTone: "success",
  },
  {
    name: "调度指挥中心",
    status: "warning",
    metrics: [
      { label: "在办工单", value: "47" },
      { label: "平均处置", value: "4.2h" },
      { label: "按时率", value: "96%" },
    ],
    health: 95,
    healthTone: "warning",
  },
];

export const domains: DomainRisk[] = [
  { name: "投资领域", level: "high", riskCount: 86, desc: "投资决策越权、收益异常" },
  { name: "产权领域", level: "medium", riskCount: 54, desc: "产权变动违规" },
  { name: "财务领域", level: "high", riskCount: 92, desc: "资金异动、关联交易" },
  { name: "会计领域", level: "medium", riskCount: 38, desc: "会计信息失真" },
  { name: "薪酬分配领域", level: "medium", riskCount: 27, desc: "薪酬乱象" },
  { name: "金融风险领域", level: "high", riskCount: 71, desc: "过度负债、融资风险" },
  { name: "军品业务领域", level: "low", riskCount: 19, desc: "军品合规" },
  { name: "采购与供应链领域", level: "medium", riskCount: 45, desc: "虚假贸易、采购违规" },
  { name: "境外单位领域", level: "medium", riskCount: 33, desc: "境外风险" },
  { name: "合同领域", level: "low", riskCount: 22, desc: "合同合规" },
];

export const frameworkSystems: FrameworkItem[] = [
  { num: "1", name: "组织领导体系", desc: "统一领导、分级负责" },
  { num: "2", name: "监管系统体系", desc: "一平台三中心" },
  { num: "3", name: "监督追责体系", desc: "闭环问责机制" },
  { num: "4", name: "监管制度体系", desc: "制度规范全覆盖" },
];

export const frameworkStrengths: FrameworkItem[] = [
  { icon: "database", name: "数据资源布局", desc: "数据全量汇聚", variant: "primary" },
  { icon: "trending-up", name: "数据有效治理", desc: "数据质量保障", variant: "primary" },
  { icon: "credit-card", name: "司库平台升级", desc: "资金实时监控", variant: "primary" },
  { icon: "cpu", name: "人工智能应用", desc: "AI智能分析", variant: "primary" },
  { icon: "shield-check", name: "系统安全保密", desc: "安全防护升级", variant: "primary" },
];

export const riskCatalog: RiskPill[] = [
  { name: "过度负债", level: "high", tag: "高风险" },
  { name: "财务金融风险", level: "high", tag: "高风险" },
  { name: "靠企吃企", level: "high", tag: "高风险" },
  { name: "控股不控权", level: "high", tag: "高风险" },
  { name: "无关多元", level: "medium", tag: "中风险" },
  { name: "多层架构", level: "medium", tag: "中风险" },
  { name: "薪酬乱象", level: "medium", tag: "中风险" },
  { name: "虚假贸易", level: "medium", tag: "中风险" },
  { name: "境外风险", level: "medium", tag: "中风险" },
  { name: "捞偏门", level: "low", tag: "低风险" },
  { name: "资产闲置", level: "low", tag: "低风险" },
  { name: "+ N", level: "more", tag: "持续扩展" },
];

export const guarantees: { icon: string; name: string; desc: string }[] = [
  { icon: "server", name: "支撑保障", desc: "技术资源支撑" },
  { icon: "users", name: "队伍建设", desc: "专业人才保障" },
  { icon: "flag", name: "成果运用", desc: "监管成果转化" },
  { icon: "refresh-cw", name: "宣传引导", desc: "监管文化培育" },
];

/* ===================== 风险预警 ===================== */

export const riskWarnings: RiskWarning[] = [
  {
    id: "RW20260716001",
    title: "新兴铸管大额资金异常流出",
    domain: "财务领域",
    level: "high",
    subject: "新兴铸管股份",
    rule: "资金异动规则R-021",
    triggeredAt: "2026-07-16 09:12",
    status: "pending",
    clue: "30 分钟内累计流出资金 8,600 万元，超过预设阈值 5,000 万元；流向 3 个新建账户。",
    relatedOrderId: "WO20260716-001",
    raw: [
      { label: "账户主体", value: "新兴铸管股份-基本户 6228****1234" },
      { label: "流出金额", value: "8,600 万元" },
      { label: "对手方", value: "3 个新建账户（注册 < 30 天）" },
      { label: "命中规则", value: "R-021 大额资金异动" },
    ],
  },
  {
    id: "RW20260716002",
    title: "海外子公司违规关联交易",
    domain: "境外单位领域",
    level: "high",
    subject: "新兴际华国际",
    rule: "关联交易规则R-108",
    triggeredAt: "2026-07-16 08:45",
    status: "processing",
    clue: "境外子公司与高管直系亲属控股企业发生 1,200 万美元交易，未履行关联交易审批程序。",
    relatedOrderId: "WO20260715-008",
    raw: [
      { label: "交易主体", value: "新兴际华国际（香港）有限公司" },
      { label: "对手方", value: "Everwin Holdings Ltd（关联自然人控股）" },
      { label: "交易金额", value: "1,200 万美元" },
      { label: "审批状态", value: "未走关联交易审批流" },
    ],
  },
  {
    id: "RW20260715003",
    title: "投资项目决策越权审批",
    domain: "投资领域",
    level: "high",
    subject: "际华投资公司",
    rule: "决策越权规则R-056",
    triggeredAt: "2026-07-15 16:30",
    status: "pending",
    clue: "5,000 万元股权投资项目仅由二级单位党委会审议通过，未报集团董事会审批。",
    relatedOrderId: "WO20260715-008",
    raw: [
      { label: "项目名称", value: "际华新能源股权增资项目" },
      { label: "投资金额", value: "5,000 万元" },
      { label: "审批层级", value: "二级单位党委会（越权）" },
      { label: "应审批级", value: "集团董事会" },
    ],
  },
  {
    id: "RW20260715004",
    title: "采购合同疑似虚假贸易",
    domain: "采购与供应链领域",
    level: "medium",
    subject: "供应链公司",
    rule: "虚假贸易规则R-203",
    triggeredAt: "2026-07-15 14:20",
    status: "resolved",
    clue: "采购合同与销售合同金额一致、货物品类相同、流转周期 < 1 天，疑似无商业实质的循环贸易。",
    relatedOrderId: "WO20260713-015",
    raw: [
      { label: "采购合同", value: "CG-2026-0715-088（2,300 万元）" },
      { label: "销售合同", value: "XS-2026-0715-092（2,300 万元）" },
      { label: "货物品类", value: "钢材 round-bar 1000T" },
      { label: "流转时长", value: "< 24 小时" },
    ],
  },
  {
    id: "RW20260715005",
    title: "子公司薪酬分配异常",
    domain: "薪酬分配领域",
    level: "medium",
    subject: "人力资源部",
    rule: "薪酬规则R-077",
    triggeredAt: "2026-07-15 10:08",
    status: "processing",
    clue: "某三级子公司高管绩效奖金占工资总额比例 38%，超集团规定上限 25%。",
    relatedOrderId: "WO20260714-022",
    raw: [
      { label: "主体", value: "新兴重工第三分公司" },
      { label: "绩效占比", value: "38%（超上限 13pt）" },
      { label: "工资总额", value: "2,800 万元" },
      { label: "考核周期", value: "2026 上半年" },
    ],
  },
  {
    id: "RW20260714006",
    title: "产权转让未经审批",
    domain: "产权领域",
    level: "medium",
    subject: "资产管理部",
    rule: "产权规则R-045",
    triggeredAt: "2026-07-14 17:55",
    status: "pending",
    clue: "某二级单位将持有 5 年以上的国有产权协议转让给非关联方，未经国资委备案。",
    relatedOrderId: undefined,
    raw: [
      { label: "标的产权", value: "新兴置业 35% 股权" },
      { label: "受让方", value: "民营资本（非关联）" },
      { label: "转让方式", value: "协议转让（应公开挂牌）" },
      { label: "国资备案", value: "未备案" },
    ],
  },
  {
    id: "RW20260714007",
    title: "融资规模超资产负债率红线",
    domain: "金融风险领域",
    level: "high",
    subject: "新兴重工集团",
    rule: "过度负债规则R-012",
    triggeredAt: "2026-07-14 11:30",
    status: "pending",
    clue: "资产负债率达 78%，超过国资委监管红线 70%，且本月新增融资 3 亿元。",
    relatedOrderId: undefined,
    raw: [
      { label: "主体", value: "新兴重工集团有限公司" },
      { label: "资产负债率", value: "78%（红线 70%）" },
      { label: "本月新增融资", value: "3 亿元" },
      { label: "用途", value: "偿还到期债务" },
    ],
  },
];

/* ===================== 核查工单 ===================== */

export const workOrders: WorkOrder[] = [
  {
    id: "WO20260716-001",
    riskSource: "资金异动",
    owner: "李建国",
    currentNode: "rectify",
    progress: 65,
    status: "processing",
  },
  {
    id: "WO20260715-008",
    riskSource: "决策越权",
    owner: "王志远",
    currentNode: "verify",
    progress: 20,
    status: "processing",
  },
  {
    id: "WO20260714-022",
    riskSource: "关联交易",
    owner: "赵敏",
    currentNode: "review",
    progress: 85,
    status: "processing",
  },
  {
    id: "WO20260713-015",
    riskSource: "隐患整改",
    owner: "孙磊",
    currentNode: "archive",
    progress: 100,
    status: "archived",
  },
  {
    id: "WO20260712-007",
    riskSource: "虚假贸易",
    owner: "周涛",
    currentNode: "rectify",
    progress: 55,
    status: "processing",
  },
  {
    id: "WO20260711-019",
    riskSource: "产权违规",
    owner: "吴芳",
    currentNode: "review",
    progress: 78,
    status: "processing",
  },
];

/* ===================== 数据采集 ===================== */

export const collectionTasks: CollectionTask[] = [
  { id: "T-001", name: "浪潮-财务凭证主表（增量）", source: "浪潮 iGIX", mode: "增量", schedule: "*/5 * * * *", lastStatus: "成功", throughput: "1,820 条/s", lastRun: "2026-07-16 09:10" },
  { id: "T-002", name: "司库-账户流水 CDC", source: "司库 MySQL", mode: "CDC", schedule: "实时", lastStatus: "运行中", throughput: "320 条/s", lastRun: "2026-07-16 09:12" },
  { id: "T-003", name: "浪潮-合同头表全量", source: "浪潮 iGIX", mode: "全量", schedule: "0 2 * * *", lastStatus: "成功", throughput: "12,400 条/s", lastRun: "2026-07-16 02:00" },
  { id: "T-004", name: "司库-担保记录增量", source: "司库 Oracle", mode: "增量", schedule: "*/15 * * * *", lastStatus: "成功", throughput: "120 条/s", lastRun: "2026-07-16 09:00" },
  { id: "T-005", name: "组织架构主数据同步", source: "浪潮 iGIX", mode: "全量", schedule: "0 3 * * 0", lastStatus: "成功", throughput: "8,200 条/s", lastRun: "2026-07-14 03:00" },
  { id: "T-006", name: "项目档案同步", source: "浪潮 iGIX", mode: "增量", schedule: "*/30 * * * *", lastStatus: "失败", throughput: "—", lastRun: "2026-07-16 08:30" },
  { id: "T-007", name: "客商主数据全量", source: "浪潮 iGIX", mode: "全量", schedule: "0 4 * * *", lastStatus: "成功", throughput: "9,600 条/s", lastRun: "2026-07-16 04:00" },
  { id: "T-008", name: "支付订单 CDC", source: "司库 MySQL", mode: "CDC", schedule: "实时", lastStatus: "运行中", throughput: "180 条/s", lastRun: "2026-07-16 09:12" },
];

export const dataSources: DataSource[] = [
  { id: "DS-001", name: "浪潮 iGIX 财务模块", type: "REST API", status: "online", records: "2.1 亿条", updateFreq: "5 分钟", owner: "张明" },
  { id: "DS-002", name: "司库 MySQL 主库", type: "binlog CDC", status: "online", records: "8,600 万条", updateFreq: "实时", owner: "李建国" },
  { id: "DS-003", name: "司库 Oracle 库", type: "JDBC", status: "online", records: "3,200 万条", updateFreq: "15 分钟", owner: "李建国" },
  { id: "DS-004", name: "浪潮 iGIX 合同模块", type: "REST API", status: "online", records: "560 万条", updateFreq: "1 天", owner: "王志远" },
  { id: "DS-005", name: "项目档案库", type: "REST API", status: "error", records: "180 万条", updateFreq: "30 分钟", owner: "王志远" },
  { id: "DS-006", name: "客商主数据中心", type: "REST API", status: "online", records: "92 万条", updateFreq: "1 天", owner: "赵敏" },
];

export const collectionTrend: TrendPoint[] = (() => {
  const arr: TrendPoint[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(2026, 6, 16);
    d.setDate(d.getDate() - i);
    const label = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    arr.push({
      date: label,
      investment: 8 + Math.round(Math.sin(i / 3) * 3) + (i % 5),
      finance: 12 + Math.round(Math.cos(i / 4) * 4) + (i % 4),
      financial: 6 + Math.round(Math.sin(i / 5) * 2) + (i % 3),
      compliance: 3 + (i % 3),
    });
  }
  return arr;
})();

/* ===================== 关系图谱 ===================== */

export const graphNodes: GraphNode[] = [
  { id: "org-1", label: "新兴际华集团", type: "org", meta: "集团总部" },
  { id: "org-2", label: "新兴铸管股份", type: "org", meta: "二级单位" },
  { id: "org-3", label: "际华投资公司", type: "org", meta: "二级单位" },
  { id: "acc-1", label: "新兴铸管基本户", type: "account", meta: "6228****1234" },
  { id: "acc-2", label: "新兴铸管一般户", type: "account", meta: "6228****5678" },
  { id: "acc-3", label: "际华投资结算户", type: "account", meta: "6228****9012" },
  { id: "cp-1", label: "Everwin Holdings", type: "counterparty", meta: "境外·新建账户" },
  { id: "cp-2", label: "鑫达贸易", type: "counterparty", meta: "境内·成立30天" },
  { id: "cp-3", label: "华信物资", type: "counterparty", meta: "境内·关联" },
  { id: "per-1", label: "张某（高管）", type: "person", meta: "集团副总" },
  { id: "per-2", label: "李某（财务总监）", type: "person", meta: "二级单位" },
];

export const graphEdges: GraphEdge[] = [
  { source: "org-1", target: "org-2", label: "全资控股", weight: 1 },
  { source: "org-1", target: "org-3", label: "全资控股", weight: 1 },
  { source: "org-2", target: "acc-1", label: "持有", weight: 1 },
  { source: "org-2", target: "acc-2", label: "持有", weight: 1 },
  { source: "org-3", target: "acc-3", label: "持有", weight: 1 },
  { source: "acc-1", target: "cp-1", label: "8,600万元 →", weight: 3 },
  { source: "acc-1", target: "cp-2", label: "3,200万元 →", weight: 2 },
  { source: "acc-2", target: "cp-3", label: "1,800万元 →", weight: 2 },
  { source: "acc-3", target: "cp-3", label: "5,000万元 →", weight: 3 },
  { source: "per-1", target: "cp-1", label: "亲属控股", weight: 2 },
  { source: "per-2", target: "cp-2", label: "代持嫌疑", weight: 2 },
  { source: "per-1", target: "org-1", label: "任职", weight: 1 },
  { source: "per-2", target: "org-2", label: "任职", weight: 1 },
];

/* ===================== 监管态势图表 ===================== */

export const doughnutSlices: DoughnutSlice[] = [
  { name: "过度负债", value: 78, color: "#387bff" },
  { name: "财务金融风险", value: 92, color: "#f0a50f" },
  { name: "靠企吃企", value: 64, color: "#ff706d" },
  { name: "控股不控权", value: 53, color: "#7ccd94" },
  { name: "其他", value: 39, color: "#86909c" },
];

export const healthBars: HealthBar[] = [
  { name: "集团总部", value: 96, color: "#387bff" },
  { name: "业务板块", value: 91, color: "#7ccd94" },
  { name: "所属企业", value: 88, color: "#387bff" },
];

/* ===================== 财务资金监管 ===================== */

export const financeRiskCards: { title: string; level: RiskLevel; count: number; desc: string; icon: string }[] = [
  { title: "资金异动监测", level: "high", count: 18, desc: "大额异地支付、频繁关联交易、超预算支付", icon: "banknote" },
  { title: "关联交易", level: "medium", count: 24, desc: "未审批关联交易、关联方资金占用", icon: "link" },
  { title: "虚假贸易", level: "high", count: 9, desc: "循环贸易、无商业实质交易", icon: "file-warning" },
  { title: "违规担保", level: "medium", count: 6, desc: "对外担保超限额、互保链", icon: "shield-alert" },
];

export const financeTrend: { date: string; inflow: number; outflow: number; net: number }[] = (() => {
  const arr: { date: string; inflow: number; outflow: number; net: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(2026, 6, 16);
    d.setDate(d.getDate() - i);
    const label = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const inflow = 800 + Math.round(Math.sin(i / 3) * 200) + (i % 7) * 30;
    const outflow = 700 + Math.round(Math.cos(i / 4) * 180) + (i % 5) * 40;
    arr.push({ date: label, inflow, outflow, net: inflow - outflow });
  }
  return arr;
})();

/* ===================== 指挥大屏 ===================== */

export const bigScreenKpis: { label: string; value: string; trend?: string; tone?: "up" | "down" }[] = [
  { label: "在线监管对象", value: "1,286" },
  { label: "今日新增风险", value: "42", trend: "↑ 8", tone: "up" },
  { label: "在办工单", value: "47", trend: "↓ 3", tone: "down" },
  { label: "平均处置时长", value: "4.2h", trend: "↓ 0.3h", tone: "down" },
  { label: "数据采集量", value: "1.28亿" },
  { label: "系统可用性", value: "99.97%" },
];

export const riskHeatmap: { area: string; high: number; medium: number; low: number }[] = [
  { area: "北京总部", high: 5, medium: 12, low: 8 },
  { area: "上海板块", high: 3, medium: 9, low: 6 },
  { area: "雄安板块", high: 7, medium: 14, low: 5 },
  { area: "华南区域", high: 2, medium: 6, low: 4 },
  { area: "西南区域", high: 4, medium: 8, low: 3 },
  { area: "境外单位", high: 6, medium: 11, low: 2 },
];

/* ===================== 穿透查询 ===================== */

export const penetrationTree = {
  id: "group",
  name: "新兴际华集团",
  type: "集团总部",
  level: 1,
  metrics: { assets: "2,860 亿", revenue: "1,820 亿", risk: 86 },
  children: [
    {
      id: "xieling-zhuguan",
      name: "新兴铸管股份",
      type: "二级单位",
      level: 2,
      metrics: { assets: "680 亿", revenue: "520 亿", risk: 32 },
      children: [
        {
          id: "xieling-zhuguan-1",
          name: "新兴铸管邯郸基地",
          type: "三级单位",
          level: 3,
          metrics: { assets: "180 亿", revenue: "150 亿", risk: 14 },
          children: [
            {
              id: "acc-zhuguan-base",
              name: "基本户 6228****1234",
              type: "账户/凭证",
              level: 4,
              metrics: { assets: "—", revenue: "—", risk: 5 },
              children: [
                { id: "txn-1", name: "TXN20260716-0001 8,600万 → Everwin", type: "流水", level: 5, metrics: { assets: "—", revenue: "—", risk: 1 } },
                { id: "txn-2", name: "TXN20260715-0042 3,200万 → 鑫达贸易", type: "流水", level: 5, metrics: { assets: "—", revenue: "—", risk: 1 } },
              ],
            },
          ],
        },
      ],
    },
    {
      id: "jihua-touzi",
      name: "际华投资公司",
      type: "二级单位",
      level: 2,
      metrics: { assets: "320 亿", revenue: "180 亿", risk: 24 },
      children: [
        {
          id: "jihua-touzi-1",
          name: "际华新能源",
          type: "三级单位",
          level: 3,
          metrics: { assets: "120 亿", revenue: "60 亿", risk: 18 },
          children: [],
        },
      ],
    },
    {
      id: "xinxing-zhonggong",
      name: "新兴重工集团",
      type: "二级单位",
      level: 2,
      metrics: { assets: "540 亿", revenue: "380 亿", risk: 30 },
      children: [],
    },
  ],
};
