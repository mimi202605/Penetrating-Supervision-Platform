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
  Connector,
  StreamCatalog,
  TransformType,
  RegulatoryScene,
  RiskClue,
  LinkageRule,
  Agent,
  CollectionTaskRun,
  AuditPoint,
  DirtyRecord,
  AdminRole,
  AdminUser,
  AdminRoleDef,
  AdminAlert,
  CockpitKpi,
  MaskingRule,
  MaskingEvent,
  AuditLog,
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
    subject: "中央企业国际",
    rule: "关联交易规则R-108",
    triggeredAt: "2026-07-16 08:45",
    status: "processing",
    clue: "境外子公司与高管直系亲属控股企业发生 1,200 万美元交易，未履行关联交易审批程序。",
    relatedOrderId: "WO20260715-008",
    raw: [
      { label: "交易主体", value: "中央企业国际（香港）有限公司" },
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
  { id: "org-1", label: "中央企业集团", type: "org", meta: "集团总部" },
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
  name: "中央企业集团",
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

/* ===================== V2 数据源管理与采集系统 ===================== */
// 对齐 collection-system-v2 spec 的预置数据，供 GitHub Pages 演示站点回退使用。
// 真实后端启动时由 server/src/db/seed.ts + seed-regulatory.ts 灌入。

// 20 个连接器（6 实现 + 14 占位）—— 与 server/src/modules/collection/connectors/catalog.ts 同语义
export const connectors: Connector[] = [
  // 6 个已实现
  { type: "kingdee-eas-openapi", name: "金蝶 EAS Cloud OpenAPI", category: "erp", description: "金蝶 EAS 主数据/凭证", capabilities: ["full", "incremental", "discover"], secretFields: ["password"], implemented: true },
  { type: "sap-odata", name: "SAP OData", category: "erp", description: "SAP OData v2/v4 服务", capabilities: ["full", "incremental", "discover"], secretFields: ["password"], implemented: true },
  { type: "jdbc-mysql", name: "MySQL (JDBC)", category: "db", description: "MySQL JDBC 通用连接", capabilities: ["full", "incremental", "discover"], secretFields: ["password"], implemented: true },
  { type: "cdc-mysql", name: "MySQL CDC (binlog)", category: "db", description: "MySQL binlog 实时 CDC", capabilities: ["cdc", "schema-evolution"], secretFields: ["password"], implemented: true },
  { type: "treasury-sys", name: "司库系统", category: "saas", description: "司库 REST API 模拟", capabilities: ["full", "incremental", "discover"], secretFields: ["token"], implemented: true },
  { type: "file-csv", name: "CSV 文件", category: "file", description: "本地/SFTP CSV 流式读取", capabilities: ["full", "discover"], secretFields: [], implemented: true },
  // 14 个占位
  { type: "kingdee-eas-ws", name: "金蝶 EAS WebService (SOAP)", category: "erp", capabilities: ["full", "incremental"], secretFields: ["password"], implemented: false },
  { type: "sap-bapi", name: "SAP BAPI/RFC", category: "erp", capabilities: ["full", "incremental"], secretFields: ["passwd"], implemented: false },
  { type: "sap-idoc", name: "SAP IDoc", category: "erp", capabilities: ["cdc"], secretFields: ["certPath"], implemented: false },
  { type: "igix-rest", name: "浪潮 iGIX REST", category: "erp", capabilities: ["full", "incremental", "discover"], secretFields: ["token"], implemented: false },
  { type: "finance-shared", name: "财务共享平台", category: "saas", capabilities: ["full", "incremental"], secretFields: ["token"], implemented: false },
  { type: "hr-system", name: "人力资源系统", category: "saas", capabilities: ["full", "incremental", "discover"], secretFields: ["token"], implemented: false },
  { type: "salary-mgmt", name: "薪酬福利管理", category: "saas", capabilities: ["full", "incremental"], secretFields: ["token"], implemented: false },
  { type: "finance-acc", name: "财务核算 (JDBC)", category: "db", capabilities: ["full", "incremental", "discover"], secretFields: ["password"], implemented: false },
  { type: "tax-social", name: "税务与社保", category: "saas", capabilities: ["full"], secretFields: ["token"], implemented: false },
  { type: "project-mgmt", name: "项目管理平台", category: "saas", capabilities: ["full", "incremental"], secretFields: ["token"], implemented: false },
  { type: "contract-sys", name: "合同系统", category: "saas", capabilities: ["full", "incremental"], secretFields: ["token"], implemented: false },
  { type: "procurement", name: "采购管理平台", category: "saas", capabilities: ["full", "incremental"], secretFields: ["token"], implemented: false },
  { type: "e-bidding", name: "电子招标平台", category: "saas", capabilities: ["full", "incremental"], secretFields: ["token"], implemented: false },
  { type: "external-credit", name: "外部工商 (天眼查/企查查)", category: "saas", capabilities: ["full"], secretFields: ["token"], implemented: false },
];

// 5 个监管场景（finance-risk 域）—— 与 server/src/db/seed-regulatory.ts SCENES 同语义
export const regulatoryScenes: RegulatoryScene[] = [
  { id: "sc-fin-dup-pay", domain: "finance-risk", name: "重复支付预警", description: "同收款方、同金额、同日多笔支付识别，防止拆分规避审批", status: "online" },
  { id: "sc-fin-private-pay", domain: "finance-risk", name: "非工作时间大额对私支付", description: "22:00-06:00 对私支付且金额超过阈值，识别利益输送或资金挪用", status: "online" },
  { id: "sc-fin-fake-trade", domain: "finance-risk", name: "融资性贸易/空转走单", description: "A→B→A 资金回流 + 无商业实质的关联交易", status: "online" },
  { id: "sc-fin-guarantee", domain: "finance-risk", name: "超股比担保", description: "对外担保金额超过持股比例对应的金额，承担超额风险", status: "online" },
  { id: "sc-fin-funding-due", domain: "finance-risk", name: "融资到期预警", description: "融资到期 30/7/1 天内分级预警，提前筹措还款资金", status: "online" },
];

// 13 类 Transform —— 与 server/src/modules/collection/transform/registry.ts ALL_TRANSFORM_SPECS 同语义
export const transformTypes: TransformType[] = [
  { type: "field-mapping", name: "字段映射", configSchema: { type: "object", properties: { mapping: { type: "object" }, includeOnly: { type: "boolean" } } } },
  { type: "type-cast", name: "类型转换", configSchema: { type: "object", properties: { fields: { type: "object" } } } },
  { type: "clean", name: "数据清洗", configSchema: { type: "object", properties: { trim: { type: "array" }, defaults: { type: "object" } } } },
  { type: "dedup", name: "主键去重", configSchema: { type: "object", properties: { keys: { type: "array" } } } },
  { type: "filter", name: "表达式过滤", configSchema: { type: "object", properties: { expr: { type: "string" } } } },
  { type: "mask", name: "字段脱敏", configSchema: { type: "object", properties: { fields: { type: "array" } } } },
  { type: "flatten", name: "嵌套展开", configSchema: { type: "object", properties: { arrayField: { type: "string" }, mode: { type: "string" } } } },
  { type: "enrich", name: "维表富化", configSchema: { type: "object", properties: { lookup: { type: "object" }, join: { type: "string" } } } },
  { type: "script", name: "脚本（vm2 沙箱）", configSchema: { type: "object", properties: { code: { type: "string" } } } },
  { type: "sql", name: "SQL（alasql）", configSchema: { type: "object", properties: { sql: { type: "string" } } } },
  { type: "entity-resolve", name: "实体消歧", configSchema: { type: "object", properties: { keys: { type: "array" } } } },
  { type: "relationship-extract", name: "关系抽取", configSchema: { type: "object", properties: { nodes: { type: "array" }, edges: { type: "array" } } } },
  { type: "evidence-snapshot", name: "证据快照", configSchema: { type: "object", properties: { condition: { type: "string" } } } },
];

// 16 个 AI 智能体（3 已实现 + 13 占位）—— 与 server/src/modules/ai/agents/registry.ts AGENTS 同语义
export const agents: Agent[] = [
  { id: "info-extract", name: "信息抽取", category: "extract", capabilities: ["文本抽取", "字段提取", "结构化"], inputSchema: "{text:string, fields?:string[]}", outputSchema: "{fields:object, confidence:number}", protocol: "internal", model: "llm", description: "从文本/表格抽取结构化字段", implemented: true },
  { id: "text-compare", name: "文本比对", category: "compare", capabilities: ["查重", "差异比对", "相似度"], inputSchema: "{textA:string, textB:string}", outputSchema: "{similarity:number, diff:[]}", protocol: "internal", model: "hybrid", description: "标书查重/阴阳合同，cosine 相似度 + LCS diff", implemented: true },
  { id: "report-generate", name: "风险报告生成", category: "generate", capabilities: ["报告生成", "markdown", "线索汇总"], inputSchema: "{clueIds:string[]}", outputSchema: "{report:string, clueCount:number}", protocol: "internal", model: "llm", description: "输入 clueIds 生成 markdown 风险处置报告", implemented: true },
  { id: "entity-resolve", name: "实体归一", category: "transform", capabilities: ["实体对齐", "主体归一"], inputSchema: "{entities:object[]}", outputSchema: "{resolved:object[], duplicates:object[]}", protocol: "a2a", model: "hybrid", description: "跨系统主体归一", implemented: false },
  { id: "relationship-extract", name: "关系抽取", category: "extract", capabilities: ["关系抽取", "三元组", "图谱"], inputSchema: "{text:string}", outputSchema: "{triples:[]}", protocol: "internal", model: "llm", description: "抽取实体间关系", implemented: false },
  { id: "anomaly-detect", name: "异常检测", category: "analyze", capabilities: ["异常检测", "统计", "离群点"], inputSchema: "{series:number[]}", outputSchema: "{anomalies:[]}", protocol: "internal", model: "local", description: "统计异常检测", implemented: false },
  { id: "risk-assess", name: "风险评估", category: "analyze", capabilities: ["风险评估", "等级判定"], inputSchema: "{clueId:string}", outputSchema: "{level:string, score:number}", protocol: "a2a", model: "hybrid", description: "风险等级评估", implemented: false },
  { id: "evidence-collect", name: "证据收集", category: "extract", capabilities: ["证据快照", "取证"], inputSchema: "{clueId:string}", outputSchema: "{evidence:[]}", protocol: "internal", model: "local", description: "证据快照收集", implemented: false },
  { id: "graph-build", name: "图谱构建", category: "transform", capabilities: ["图构建", "邻接表"], inputSchema: "{nodes:[], edges:[]}", outputSchema: "{graphId:string}", protocol: "internal", model: "local", description: "邻接表图谱构建", implemented: false },
  { id: "sentiment-analysis", name: "情感分析", category: "analyze", capabilities: ["情感", "舆情"], inputSchema: "{text:string}", outputSchema: "{sentiment:string, score:number}", protocol: "internal", model: "llm", description: "舆情情感分析", implemented: false },
  { id: "nlu-classify", name: "意图分类", category: "analyze", capabilities: ["NLU", "意图识别"], inputSchema: "{text:string}", outputSchema: "{intent:string, confidence:number}", protocol: "internal", model: "llm", description: "自然语言意图分类", implemented: false },
  { id: "summarization", name: "摘要生成", category: "generate", capabilities: ["摘要", "压缩"], inputSchema: "{text:string}", outputSchema: "{summary:string}", protocol: "internal", model: "llm", description: "长文本摘要", implemented: false },
  { id: "translation", name: "翻译", category: "transform", capabilities: ["翻译", "多语言"], inputSchema: "{text:string, target:string}", outputSchema: "{translation:string}", protocol: "internal", model: "llm", description: "多语言翻译", implemented: false },
  { id: "ocr-extract", name: "OCR 抽取", category: "extract", capabilities: ["OCR", "图像"], inputSchema: "{image:string}", outputSchema: "{text:string}", protocol: "internal", model: "local", description: "图像 OCR 文本抽取", implemented: false },
  { id: "data-quality", name: "数据质量", category: "analyze", capabilities: ["质量校验", "完整性"], inputSchema: "{records:[]}", outputSchema: "{issues:[]}", protocol: "internal", model: "local", description: "数据质量评估", implemented: false },
  { id: "compliance-check", name: "合规检查", category: "analyze", capabilities: ["合规", "条款"], inputSchema: "{document:string}", outputSchema: "{violations:[]}", protocol: "a2a", model: "hybrid", description: "条款合规检查", implemented: false },
];

// 10 条联查规则 —— 与 server/src/db/seed-regulatory.ts LINKAGE_RULES 同语义
export const linkageRules: LinkageRule[] = [
  { id: "LR-FIN-DUP-PAY-001", sceneId: "sc-fin-dup-pay", name: "重复支付穿透联查", drillPath: ["ads", "dws", "dwd", "ods"], description: "treasury-sys · 入口指标 → ODS 原始单据" },
  { id: "LR-FIN-PRIVATE-PAY-001", sceneId: "sc-fin-private-pay", name: "非工作时间对私支付联查", drillPath: ["ads", "dws", "dwd", "ods"], description: "treasury-sys · 入口指标 → ODS 原始单据" },
  { id: "LR-FIN-FAKE-TRADE-001", sceneId: "sc-fin-fake-trade", name: "融资性贸易联查", drillPath: ["ads", "dws", "dwd", "ods"], description: "treasury-sys · 入口指标 → ODS 原始单据" },
  { id: "LR-FIN-GUARANTEE-001", sceneId: "sc-fin-guarantee", name: "超股比担保联查", drillPath: ["ads", "dws", "dwd", "ods"], description: "treasury-sys · 入口指标 → ODS 原始单据" },
  { id: "LR-FIN-FUNDING-DUE-001", sceneId: "sc-fin-funding-due", name: "融资到期联查", drillPath: ["ads", "dws", "dwd", "ods"], description: "treasury-sys · 入口指标 → ODS 原始单据" },
  { id: "LR-INV-OVERDEBT-001", sceneId: "sc-fin-fake-trade", name: "投资过度负债联查", drillPath: ["ads", "dws", "dwd", "ods"], description: "kingdee-eas-openapi · 入口指标 → ODS 原始单据" },
  { id: "LR-INV-IRRELEVANT-001", sceneId: "sc-fin-guarantee", name: "无关多元联查", drillPath: ["ads", "dws", "dwd", "ods"], description: "kingdee-eas-openapi · 入口指标 → ODS 原始单据" },
  { id: "LR-INV-LOSS-001", sceneId: "sc-fin-funding-due", name: "投资亏损联查", drillPath: ["ads", "dws", "dwd", "ods"], description: "kingdee-eas-openapi · 入口指标 → ODS 原始单据" },
  { id: "LR-CON-BID-DUP-001", sceneId: "sc-fin-dup-pay", name: "标书查重联查", drillPath: ["ads", "dws", "dwd", "ods"], description: "file-csv · 入口指标 → ODS 原始单据" },
  { id: "LR-CON-YINYANG-001", sceneId: "sc-fin-private-pay", name: "阴阳合同联查", drillPath: ["ads", "dws", "dwd", "ods"], description: "file-csv · 入口指标 → ODS 原始单据" },
];

// 6 条风险线索（覆盖 yellow/orange/red 三级，pending/dispatched/closed 三态）
export const riskClues: RiskClue[] = [
  {
    id: "RC20260716-001",
    sceneId: "sc-fin-dup-pay",
    modelId: "m-fin-dup-pay-001",
    entityType: "supplier",
    entityId: "SUP-001",
    riskLevel: "red",
    riskValue: "12 笔",
    description: "供应商 SUP-001 同日同金额重复支付 12 笔，金额合计 1,200 万元",
    status: "dispatched",
    detectedAt: "2026-07-16 09:18:00",
    dueAt: "2026-07-23 18:00:00",
    assignedTo: "李建国",
    orgCode: "xinxing-zhuguan",
    evidenceJson: { dupCount: 12, totalAmount: 12000000, payee: "鑫达贸易" },
    workOrderId: "WO20260716-001",
  },
  {
    id: "RC20260716-002",
    sceneId: "sc-fin-private-pay",
    modelId: "m-fin-private-pay-001",
    entityType: "employee",
    entityId: "EMP-2058",
    riskLevel: "orange",
    riskValue: "85 万",
    description: "02:13 对私支付 85 万元，超过阈值 20 万元",
    status: "dispatched",
    detectedAt: "2026-07-16 02:15:00",
    dueAt: "2026-07-23 18:00:00",
    assignedTo: "王志远",
    orgCode: "xinxing-zhuguan",
    evidenceJson: { hour: 2, amount: 850000, payee: "张某（个人）" },
    workOrderId: "WO20260716-002",
  },
  {
    id: "RC20260715-008",
    sceneId: "sc-fin-fake-trade",
    modelId: "m-fin-fake-trade-001",
    entityType: "supplier",
    entityId: "SUP-008",
    riskLevel: "red",
    riskValue: "3 笔",
    description: "A→B→A 资金回流 3 笔，金额合计 4,500 万元，无商业实质",
    status: "pending",
    detectedAt: "2026-07-15 16:30:00",
    dueAt: "2026-07-22 18:00:00",
    assignedTo: null,
    orgCode: "jihua-touzi",
    evidenceJson: { roundTripCount: 3, tradeVolume: 45000000 },
    workOrderId: null,
  },
  {
    id: "RC20260715-009",
    sceneId: "sc-fin-guarantee",
    modelId: "m-fin-guarantee-001",
    entityType: "subsidiary",
    entityId: "SUB-际华新能源",
    riskLevel: "yellow",
    riskValue: "1.8 倍",
    description: "对外担保金额 / 持股比例 = 1.8，超过阈值 1",
    status: "pending",
    detectedAt: "2026-07-15 11:20:00",
    dueAt: "2026-07-22 18:00:00",
    assignedTo: null,
    orgCode: "jihua-touzi-1",
    evidenceJson: { guaranteeAmount: 180000000, shareholdingRatio: 0.51, ratio: 1.8 },
    workOrderId: null,
  },
  {
    id: "RC20260714-015",
    sceneId: "sc-fin-funding-due",
    modelId: "m-fin-funding-due-001",
    entityType: "subsidiary",
    entityId: "SUB-新兴重工",
    riskLevel: "red",
    riskValue: "1 天内到期",
    description: "3 亿元融资 1 天内到期，需立即筹措还款资金",
    status: "closed",
    detectedAt: "2026-07-14 09:00:00",
    dueAt: "2026-07-15 18:00:00",
    assignedTo: "周涛",
    orgCode: "xinxing-zhonggong",
    evidenceJson: { daysToDue: 1, amount: 300000000 },
    workOrderId: "WO20260714-018",
  },
  {
    id: "RC20260714-022",
    sceneId: "sc-fin-dup-pay",
    modelId: "m-fin-dup-pay-001",
    entityType: "supplier",
    entityId: "SUP-205",
    riskLevel: "yellow",
    riskValue: "3 笔",
    description: "供应商 SUP-205 同日同金额重复支付 3 笔，金额合计 240 万元",
    status: "closed",
    detectedAt: "2026-07-14 14:50:00",
    dueAt: "2026-07-21 18:00:00",
    assignedTo: "吴芳",
    orgCode: "xinxing-zhuguan",
    evidenceJson: { dupCount: 3, totalAmount: 2400000, payee: "华信物资" },
    workOrderId: "WO20260714-025",
  },
];

// 采集任务运行历史（对应 collectionTasks 第一条 T-001 的最近 3 次 run）
export const collectionTaskRuns: CollectionTaskRun[] = [
  { id: "run-20260716-0910", taskId: "T-001", attempt: 1, status: "success", startedAt: "2026-07-16 09:10:00", finishedAt: "2026-07-16 09:10:42", recordsRead: 1820, recordsWrite: 1818, recordsDirty: 2, bytesRead: 438000, error: null, checkpoint: '{"lastModifiedAt":"2026-07-16T01:10:00Z"}' },
  { id: "run-20260716-0905", taskId: "T-001", attempt: 1, status: "success", startedAt: "2026-07-16 09:05:00", finishedAt: "2026-07-16 09:05:38", recordsRead: 1742, recordsWrite: 1742, recordsDirty: 0, bytesRead: 418000, error: null, checkpoint: '{"lastModifiedAt":"2026-07-16T01:05:00Z"}' },
  { id: "run-20260716-0900", taskId: "T-001", attempt: 1, status: "failed", startedAt: "2026-07-16 09:00:00", finishedAt: "2026-07-16 09:00:21", recordsRead: 528, recordsWrite: 0, recordsDirty: 0, bytesRead: 126000, error: "ErrorLimitExceeded: 脏数据比例 0.13 超过 0.01", checkpoint: null },
  { id: "run-20260716-0912", taskId: "T-002", attempt: 1, status: "running", startedAt: "2026-07-16 09:12:00", finishedAt: undefined, recordsRead: 12340, recordsWrite: 12340, recordsDirty: 0, bytesRead: 2960000, error: null, checkpoint: '{"binlog_file":"mysql-bin.000123","position":456789,"last_pk":12340}' },
];

// 4 审计点吞吐量（对应 T-001 最近一次 run run-20260716-0910）
export const auditPoints: AuditPoint[] = [
  { taskId: "T-001", auditPoint: "reader_in", logTs: "2026-07-16 09:10:02", count: 1820, bytes: 438000, delayMs: 12 },
  { taskId: "T-001", auditPoint: "reader_out", logTs: "2026-07-16 09:10:18", count: 1820, bytes: 438000, delayMs: 8 },
  { taskId: "T-001", auditPoint: "writer_in", logTs: "2026-07-16 09:10:20", count: 1818, bytes: 436000, delayMs: 4 },
  { taskId: "T-001", auditPoint: "writer_out", logTs: "2026-07-16 09:10:42", count: 1818, bytes: 436000, delayMs: 6 },
  { taskId: "T-001", auditPoint: "reader_in", logTs: "2026-07-16 09:05:02", count: 1742, bytes: 418000, delayMs: 11 },
  { taskId: "T-001", auditPoint: "reader_out", logTs: "2026-07-16 09:05:15", count: 1742, bytes: 418000, delayMs: 7 },
  { taskId: "T-001", auditPoint: "writer_in", logTs: "2026-07-16 09:05:17", count: 1742, bytes: 418000, delayMs: 4 },
  { taskId: "T-001", auditPoint: "writer_out", logTs: "2026-07-16 09:05:38", count: 1742, bytes: 418000, delayMs: 5 },
];

// 脏数据记录（对应 T-001 run-20260716-0910 的 2 条脏数据）
export const dirtyRecords: DirtyRecord[] = [
  { taskId: "T-001", runId: "run-20260716-0910", stepId: "type-cast", raw: { voucherNo: "V20260716001", amount: "abc" }, error: "无法将 amount=abc 转换为 decimal" },
  { taskId: "T-001", runId: "run-20260716-0910", stepId: "clean", raw: { voucherNo: "V20260716002", accountDate: null }, error: "accountDate 为空，缺省值补全失败" },
  { taskId: "T-001", runId: "run-20260716-0900", stepId: "type-cast", raw: { voucherNo: "V20260716010", amount: "N/A" }, error: "无法将 amount=N/A 转换为 decimal" },
];

// StreamCatalog（对应司库 MySQL 数据源 DS-002 的 schema 发现结果）
export const streamCatalog: StreamCatalog = {
  streams: [
    {
      name: "payment_flow",
      description: "支付流水主表",
      fields: [
        { name: "id", type: "integer" },
        { name: "voucher_no", type: "string" },
        { name: "payer_account", type: "string" },
        { name: "payee_account", type: "string" },
        { name: "amount", type: "decimal" },
        { name: "currency", type: "string" },
        { name: "pay_time", type: "datetime" },
        { name: "is_private", type: "boolean" },
        { name: "created_at", type: "datetime" },
      ],
    },
    {
      name: "account_balance",
      description: "账户余额快照",
      fields: [
        { name: "id", type: "integer" },
        { name: "account_no", type: "string" },
        { name: "balance", type: "decimal" },
        { name: "snapshot_at", type: "datetime" },
      ],
    },
    {
      name: "guarantee_info",
      description: "担保信息",
      fields: [
        { name: "id", type: "integer" },
        { name: "guarantor", type: "string" },
        { name: "beneficiary", type: "string" },
        { name: "amount", type: "decimal" },
        { name: "shareholding_ratio", type: "decimal" },
        { name: "sign_date", type: "date" },
      ],
    },
  ],
};

/* ===================== 后台管理中心 Mock 数据 ===================== */

// 6 个用户（覆盖三角色三部门）
export const adminUsers: AdminUser[] = [
  { id: "u-admin-001", username: "admin", name: "系统管理员", role: "admin", department: "信息中心", email: "admin@example.com", phone: "138****0001", status: "active", lastLoginAt: "2026-07-17 08:50:12", createdAt: "2025-01-01 09:00:00" },
  { id: "u-verifier-002", username: "verifier", name: "王志远", role: "核查员", department: "监督处", email: "wangzy@example.com", phone: "138****0002", status: "active", lastLoginAt: "2026-07-17 08:42:03", createdAt: "2025-03-12 10:20:00" },
  { id: "u-handler-003", username: "handler", name: "李建国", role: "处置员", department: "处置处", email: "lijg@example.com", phone: "138****0003", status: "active", lastLoginAt: "2026-07-16 18:11:45", createdAt: "2025-04-20 14:00:00" },
  { id: "u-verifier-004", username: "zhaomin", name: "赵敏", role: "核查员", department: "合规处", email: "zhaomin@example.com", phone: "138****0004", status: "active", lastLoginAt: "2026-07-17 09:01:22", createdAt: "2025-06-08 11:30:00" },
  { id: "u-handler-005", username: "suntlei", name: "孙磊", role: "处置员", department: "处置处", email: "sunl@example.com", phone: "138****0005", status: "disabled", lastLoginAt: "2026-06-30 17:25:00", createdAt: "2025-08-15 09:45:00" },
  { id: "u-admin-006", username: "wufang", name: "吴芳", role: "admin", department: "信息中心", email: "wufang@example.com", phone: "138****0006", status: "active", lastLoginAt: "2026-07-17 07:55:30", createdAt: "2025-10-01 08:00:00" },
];

// 权限模块清单（矩阵列）—— 与后台 4 大模块对齐
export const ADMIN_PERMISSION_MODULES = [
  "运营监控",
  "系统管理",
  "数据采集运维",
  "监管配置",
] as const;
export const ADMIN_PERMISSION_OPS = ["查看", "新增", "编辑", "删除", "导出"] as const;

// 3 个角色定义 + 权限矩阵
export const adminRoles: AdminRoleDef[] = [
  {
    id: "r-admin",
    name: "系统管理员",
    code: "admin",
    description: "拥有后台全部模块全部操作权限",
    userCount: 2,
    permissions: ADMIN_PERMISSION_MODULES.map((module) => ({
      module,
      operations: ADMIN_PERMISSION_OPS.map((op) => ({ op, allowed: true })),
    })),
  },
  {
    id: "r-verifier",
    name: "核查员",
    code: "核查员",
    description: "前台核查工单处置，后台只读监控",
    userCount: 2,
    permissions: ADMIN_PERMISSION_MODULES.map((module) => ({
      module,
      operations: ADMIN_PERMISSION_OPS.map((op) => ({
        op,
        allowed: op === "查看" || op === "导出",
      })),
    })),
  },
  {
    id: "r-handler",
    name: "处置员",
    code: "处置员",
    description: "前台风险线索处置，后台仅运营监控只读",
    userCount: 2,
    permissions: ADMIN_PERMISSION_MODULES.map((module) => ({
      module,
      operations: ADMIN_PERMISSION_OPS.map((op) => ({
        op,
        allowed: module === "运营监控" && (op === "查看" || op === "导出"),
      })),
    })),
  },
];

// 8 条告警（覆盖 red/orange/yellow 三级）
export const adminAlerts: AdminAlert[] = [
  { id: "AL-001", title: "采集任务 T-006 连续失败 3 次", severity: "red", status: "active", module: "数据采集运维", detail: "项目档案同步任务失败，错误：ErrorLimitExceeded 脏数据比例超限", triggeredAt: "2026-07-17 08:30:00" },
  { id: "AL-002", title: "司库 MySQL CDC 延迟 > 30s", severity: "red", status: "active", module: "数据采集运维", detail: "binlog 消费延迟 42s，可能影响资金实时监控", triggeredAt: "2026-07-17 08:15:00" },
  { id: "AL-003", title: "规则 R-021 命中率异常下降", severity: "orange", status: "active", module: "监管配置", detail: "资金异动规则近 1 小时命中 0 次，平日均值 8 次/小时", triggeredAt: "2026-07-17 07:40:00" },
  { id: "AL-004", title: "AI 报告生成智能体调用失败率 12%", severity: "orange", status: "active", module: "监管配置", detail: "report-generate 近 1 小时调用 50 次失败 6 次", triggeredAt: "2026-07-17 06:20:00" },
  { id: "AL-005", title: "核查工单 WO20260715-008 即将超时", severity: "orange", status: "confirmed", module: "运营监控", detail: "剩余处置时长 1.2h，低于 SLA 阈值 2h", triggeredAt: "2026-07-17 05:00:00", confirmedBy: "王志远" },
  { id: "AL-006", title: "数据源 DS-005 健康度降至 30%", severity: "yellow", status: "active", module: "数据采集运维", detail: "项目档案库连接异常，最近 4 次探测 3 次超时", triggeredAt: "2026-07-17 03:10:00" },
  { id: "AL-007", title: "审计日志写入延迟 2.3s", severity: "yellow", status: "silenced", module: "系统管理", detail: "审计点 writer_out 延迟略高，已静默观察", triggeredAt: "2026-07-16 22:45:00", confirmedBy: "系统管理员" },
  { id: "AL-008", title: "用户 sunlei 连续登录失败 5 次", severity: "yellow", status: "confirmed", module: "系统管理", detail: "账号已自动停用，疑似密码遗忘", triggeredAt: "2026-07-16 17:30:00", confirmedBy: "吴芳" },
];

// 驾驶舱 KPI 聚合（含 7 日趋势）
export const cockpitKpi: CockpitKpi = {
  collectionThroughput: { value: 1820, unit: "条/s", delta: "↑ 8.2%", trend: "up" },
  ruleHits: { value: 326, delta: "↑ 12%", trend: "up" },
  orderSla: { value: "4.2h", delta: "↓ 0.3h", trend: "down" },
  aiCalls: { value: 1284, delta: "↑ 5.6%", trend: "up" },
  moduleHealth: [
    { name: "数据采集中心", health: 99, tone: "success" },
    { name: "智慧监督中心", health: 97, tone: "success" },
    { name: "调度指挥中心", health: 88, tone: "warning" },
    { name: "AI 智能体", health: 92, tone: "success" },
    { name: "监管配置", health: 95, tone: "success" },
    { name: "系统管理", health: 90, tone: "warning" },
  ],
  trends: (() => {
    const arr: CockpitKpi["trends"] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(2026, 6, 17);
      d.setDate(d.getDate() - i);
      const label = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      arr.push({
        date: label,
        collection: 1600 + Math.round(Math.sin(i / 2) * 200) + (i % 3) * 80,
        ruleHits: 40 + Math.round(Math.cos(i / 3) * 8) + (i % 4) * 3,
        orders: 8 + (i % 3) + Math.round(Math.sin(i) * 2),
        ai: 160 + Math.round(Math.cos(i / 2) * 30) + (i % 5) * 12,
      });
    }
    return arr;
  })(),
  alertSummary: [
    { severity: "red", count: 2 },
    { severity: "orange", count: 3 },
    { severity: "yellow", count: 3 },
  ],
};

// 脱敏规则
export const maskingRules: MaskingRule[] = [
  { id: "MR-001", name: "账户号脱敏", field: "account_no", algorithm: "mask", pattern: "保留前4后4，中间*号", sourceId: "DS-002", sourceName: "司库 MySQL 主库", enabled: true },
  { id: "MR-002", name: "身份证号哈希", field: "id_card", algorithm: "hash", pattern: "SHA-256 单向哈希", sourceId: "DS-001", sourceName: "浪潮 iGIX 财务模块", enabled: true },
  { id: "MR-003", name: "手机号掩码", field: "phone", algorithm: "mask", pattern: "保留前3后4，中间*号", enabled: true },
  { id: "MR-004", name: "金额加密", field: "amount", algorithm: "encrypt", pattern: "AES-256 可逆加密", sourceId: "DS-002", sourceName: "司库 MySQL 主库", enabled: true },
  { id: "MR-005", name: "对手方名称替换", field: "counterparty", algorithm: "replace", pattern: "替换为统一占位符", sourceId: "DS-001", sourceName: "浪潮 iGIX 财务模块", enabled: false },
];

// 脱敏事件审计
export const maskingEvents: MaskingEvent[] = [
  { id: "ME-001", ruleId: "MR-001", ruleName: "账户号脱敏", sourceId: "DS-002", field: "account_no", appliedAt: "2026-07-17 09:12:00", count: 1820 },
  { id: "ME-002", ruleId: "MR-002", ruleName: "身份证号哈希", sourceId: "DS-001", field: "id_card", appliedAt: "2026-07-17 09:10:00", count: 42 },
  { id: "ME-003", ruleId: "MR-004", ruleName: "金额加密", sourceId: "DS-002", field: "amount", appliedAt: "2026-07-17 09:12:00", count: 1820 },
  { id: "ME-004", ruleId: "MR-003", ruleName: "手机号掩码", sourceId: "DS-001", field: "phone", appliedAt: "2026-07-17 08:45:00", count: 88 },
];

// 操作审计日志（8 条，覆盖各模块动作）
export const auditLogs: AuditLog[] = [
  { id: "LOG-001", userId: "u-admin-001", action: "登录", target: "/admin/cockpit", ip: "10.0.0.12", detail: "管理员登录后台", createdAt: "2026-07-17 08:50:12" },
  { id: "LOG-002", userId: "u-admin-001", action: "新增", target: "数据源 DS-007", ip: "10.0.0.12", detail: "新建数据源「司库 Oracle 备库」", createdAt: "2026-07-17 09:02:33" },
  { id: "LOG-003", userId: "u-verifier-002", action: "查询", target: "穿透查询 q=新兴铸管", ip: "10.0.0.25", detail: "穿透查询主体", createdAt: "2026-07-17 09:05:18" },
  { id: "LOG-004", userId: "u-admin-006", action: "编辑", target: "角色 r-verifier", ip: "10.0.0.18", detail: "调整核查员权限矩阵", createdAt: "2026-07-17 09:10:45" },
  { id: "LOG-005", userId: "u-handler-003", action: "处置", target: "工单 WO20260716-001", ip: "10.0.0.33", detail: "推进工单至 rectify 节点", createdAt: "2026-07-17 09:15:02" },
  { id: "LOG-006", userId: "u-admin-001", action: "导出", target: "操作审计日志", ip: "10.0.0.12", detail: "导出 7 日审计日志 CSV", createdAt: "2026-07-17 09:20:11" },
  { id: "LOG-007", userId: "u-verifier-004", action: "查询", target: "风险预警列表", ip: "10.0.0.41", detail: "筛选 high 级别预警", createdAt: "2026-07-17 09:22:30" },
  { id: "LOG-008", userId: "u-admin-006", action: "停用", target: "用户 u-handler-005", ip: "10.0.0.18", detail: "停用用户 sunlei（连续登录失败）", createdAt: "2026-07-16 17:31:00" },
];
