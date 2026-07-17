// 种子数据：将 src/mock/index.ts 的数据迁入数据库
// 严格对齐前端契约字段（src/api/types.ts），数据库列用 snake_case
// 种子幂等：使用 INSERT OR IGNORE（依赖主键 / UNIQUE 约束）
import { logger } from "../utils/logger.js";
import { db, transaction } from "./index.js";
import { insertOrIgnore } from "./repository.js";

// ===================== 组织机构 =====================
// 来源：penetrationTree（集团→二级→三级）+ graphNodes(type=org)
interface OrgSeed {
  id: string;
  name: string;
  level: number;
  parent_id: string | null;
  type: string;
}
const ORGS: OrgSeed[] = [
  // 来自穿透树
  { id: "group", name: "中央企业集团", level: 1, parent_id: null, type: "集团总部" },
  { id: "xieling-zhuguan", name: "新兴铸管股份", level: 2, parent_id: "group", type: "二级单位" },
  { id: "jihua-touzi", name: "际华投资公司", level: 2, parent_id: "group", type: "二级单位" },
  { id: "xinxing-zhonggong", name: "新兴重工集团", level: 2, parent_id: "group", type: "二级单位" },
  { id: "xieling-zhuguan-1", name: "新兴铸管邯郸基地", level: 3, parent_id: "xieling-zhuguan", type: "三级单位" },
  { id: "jihua-touzi-1", name: "际华新能源", level: 3, parent_id: "jihua-touzi", type: "三级单位" },
  // 来自图谱 org 节点
  { id: "org-1", name: "中央企业集团", level: 1, parent_id: null, type: "集团总部" },
  { id: "org-2", name: "新兴铸管股份", level: 2, parent_id: "org-1", type: "二级单位" },
  { id: "org-3", name: "际华投资公司", level: 2, parent_id: "org-1", type: "二级单位" },
];

// ===================== 账户 =====================
// 来源：graphNodes(type=account) + penetrationTree 账户节点
interface AccountSeed {
  id: string;
  org_id: string;
  name: string;
  account_no: string;
  type: string;
}
const ACCOUNTS: AccountSeed[] = [
  { id: "acc-1", org_id: "org-2", name: "新兴铸管基本户", account_no: "6228****1234", type: "基本户" },
  { id: "acc-2", org_id: "org-2", name: "新兴铸管一般户", account_no: "6228****5678", type: "一般户" },
  { id: "acc-3", org_id: "org-3", name: "际华投资结算户", account_no: "6228****9012", type: "结算户" },
  { id: "acc-zhuguan-base", org_id: "xieling-zhuguan", name: "基本户 6228****1234", account_no: "6228****1234", type: "基本户" },
];

// ===================== 交易对手方 =====================
interface CpSeed {
  id: string;
  name: string;
  meta: string;
}
const COUNTERPARTIES: CpSeed[] = [
  { id: "cp-1", name: "Everwin Holdings", meta: "境外·新建账户" },
  { id: "cp-2", name: "鑫达贸易", meta: "境内·成立30天" },
  { id: "cp-3", name: "华信物资", meta: "境内·关联" },
];

// ===================== 关系图谱节点 =====================
interface GraphNodeSeed {
  id: string;
  label: string;
  type: string;
  meta: string | null;
}
const GRAPH_NODES: GraphNodeSeed[] = [
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

// ===================== 关系图谱边 =====================
interface GraphEdgeSeed {
  source: string;
  target: string;
  label: string;
  weight: number;
}
const GRAPH_EDGES: GraphEdgeSeed[] = [
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

// ===================== 交易流水 =====================
// 来源：graphEdges 金额边 + riskWarnings raw 构造
interface TxnSeed {
  id: string;
  account_id: string;
  counterparty_id: string;
  amount: number;
  ts: string;
  type: string;
  raw_json: string;
}
const TRANSACTIONS: TxnSeed[] = [
  {
    id: "TXN20260716-0001",
    account_id: "acc-1",
    counterparty_id: "cp-1",
    amount: 86000000,
    ts: "2026-07-16 09:12",
    type: "outflow",
    raw_json: JSON.stringify({ label: "8,600万 → Everwin", value: 86000000 }),
  },
  {
    id: "TXN20260715-0042",
    account_id: "acc-1",
    counterparty_id: "cp-2",
    amount: 32000000,
    ts: "2026-07-15 14:20",
    type: "outflow",
    raw_json: JSON.stringify({ label: "3,200万 → 鑫达贸易", value: 32000000 }),
  },
  {
    id: "TXN20260714-0088",
    account_id: "acc-2",
    counterparty_id: "cp-3",
    amount: 18000000,
    ts: "2026-07-14 10:30",
    type: "outflow",
    raw_json: JSON.stringify({ label: "1,800万 → 华信物资", value: 18000000 }),
  },
  {
    id: "TXN20260713-0156",
    account_id: "acc-3",
    counterparty_id: "cp-3",
    amount: 50000000,
    ts: "2026-07-13 16:45",
    type: "outflow",
    raw_json: JSON.stringify({ label: "5,000万 → 华信物资", value: 50000000 }),
  },
];

// ===================== 风险预警 =====================
// 对齐 RiskWarning 契约：triggeredAt→triggered_at, relatedOrderId→related_order_id, raw→raw_json
interface RawItem {
  label: string;
  value: string;
}
interface RiskWarningSeed {
  id: string;
  title: string;
  domain: string;
  level: string;
  subject: string;
  rule: string;
  triggered_at: string;
  status: string;
  clue: string;
  related_order_id: string | null;
  raw: RawItem[];
}
const RISK_WARNINGS: RiskWarningSeed[] = [
  {
    id: "RW20260716001",
    title: "新兴铸管大额资金异常流出",
    domain: "财务领域",
    level: "high",
    subject: "新兴铸管股份",
    rule: "资金异动规则R-021",
    triggered_at: "2026-07-16 09:12",
    status: "pending",
    clue: "30 分钟内累计流出资金 8,600 万元，超过预设阈值 5,000 万元；流向 3 个新建账户。",
    related_order_id: "WO20260716-001",
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
    triggered_at: "2026-07-16 08:45",
    status: "processing",
    clue: "境外子公司与高管直系亲属控股企业发生 1,200 万美元交易，未履行关联交易审批程序。",
    related_order_id: "WO20260715-008",
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
    triggered_at: "2026-07-15 16:30",
    status: "pending",
    clue: "5,000 万元股权投资项目仅由二级单位党委会审议通过，未报集团董事会审批。",
    related_order_id: "WO20260715-008",
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
    triggered_at: "2026-07-15 14:20",
    status: "resolved",
    clue: "采购合同与销售合同金额一致、货物品类相同、流转周期 < 1 天，疑似无商业实质的循环贸易。",
    related_order_id: "WO20260713-015",
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
    triggered_at: "2026-07-15 10:08",
    status: "processing",
    clue: "某三级子公司高管绩效奖金占工资总额比例 38%，超集团规定上限 25%。",
    related_order_id: "WO20260714-022",
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
    triggered_at: "2026-07-14 17:55",
    status: "pending",
    clue: "某二级单位将持有 5 年以上的国有产权协议转让给非关联方，未经国资委备案。",
    related_order_id: null,
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
    triggered_at: "2026-07-14 11:30",
    status: "pending",
    clue: "资产负债率达 78%，超过国资委监管红线 70%，且本月新增融资 3 亿元。",
    related_order_id: null,
    raw: [
      { label: "主体", value: "新兴重工集团有限公司" },
      { label: "资产负债率", value: "78%（红线 70%）" },
      { label: "本月新增融资", value: "3 亿元" },
      { label: "用途", value: "偿还到期债务" },
    ],
  },
];

// 工单 → 风险预警反向映射（用于回填 work_orders.risk_warning_id）
const WO_TO_RW: Record<string, string> = {
  "WO20260716-001": "RW20260716001",
  "WO20260715-008": "RW20260716002",
  "WO20260714-022": "RW20260715005",
  "WO20260713-015": "RW20260715004",
};

// ===================== 核查工单 =====================
// 对齐 WorkOrder 契约：riskSource→risk_source, currentNode→current_node
interface WorkOrderSeed {
  id: string;
  risk_source: string;
  owner: string;
  current_node: string;
  progress: number;
  status: string;
  risk_warning_id: string | null;
}
const WORK_ORDERS: WorkOrderSeed[] = [
  { id: "WO20260716-001", risk_source: "资金异动", owner: "李建国", current_node: "rectify", progress: 65, status: "processing", risk_warning_id: WO_TO_RW["WO20260716-001"] ?? null },
  { id: "WO20260715-008", risk_source: "决策越权", owner: "王志远", current_node: "verify", progress: 20, status: "processing", risk_warning_id: WO_TO_RW["WO20260715-008"] ?? null },
  { id: "WO20260714-022", risk_source: "关联交易", owner: "赵敏", current_node: "review", progress: 85, status: "processing", risk_warning_id: WO_TO_RW["WO20260714-022"] ?? null },
  { id: "WO20260713-015", risk_source: "隐患整改", owner: "孙磊", current_node: "archive", progress: 100, status: "archived", risk_warning_id: WO_TO_RW["WO20260713-015"] ?? null },
  { id: "WO20260712-007", risk_source: "虚假贸易", owner: "周涛", current_node: "rectify", progress: 55, status: "processing", risk_warning_id: null },
  { id: "WO20260711-019", risk_source: "产权违规", owner: "吴芳", current_node: "review", progress: 78, status: "processing", risk_warning_id: null },
];

// ===================== 监控规则 =====================
// 从 riskWarnings.rule 反推初始规则集，DSL 采用 json-rules-engine fact/condition 格式
interface RuleSeed {
  id: string;
  name: string;
  domain: string;
  dsl_json: string;
  priority: number;
  enabled: number;
  version: number;
}
const RULES: RuleSeed[] = [
  {
    id: "R-021",
    name: "资金异动规则R-021",
    domain: "财务领域",
    priority: 10,
    enabled: 1,
    version: 1,
    dsl_json: JSON.stringify({
      conditions: {
        all: [
          { fact: "amount", operator: "greaterThanInclusive", value: 50000000 },
          { fact: "outflowCount30min", operator: "greaterThanInclusive", value: 3 },
        ],
      },
      event: { type: "risk.warning", params: { rule: "资金异动规则R-021", level: "high", domain: "财务领域" } },
    }),
  },
  {
    id: "R-108",
    name: "关联交易规则R-108",
    domain: "境外单位领域",
    priority: 9,
    enabled: 1,
    version: 1,
    dsl_json: JSON.stringify({
      conditions: {
        all: [
          { fact: "counterpartyRelated", operator: "equal", value: true },
          { fact: "approved", operator: "equal", value: false },
        ],
      },
      event: { type: "risk.warning", params: { rule: "关联交易规则R-108", level: "high", domain: "境外单位领域" } },
    }),
  },
  {
    id: "R-056",
    name: "决策越权规则R-056",
    domain: "投资领域",
    priority: 9,
    enabled: 1,
    version: 1,
    dsl_json: JSON.stringify({
      conditions: {
        all: [
          { fact: "investAmount", operator: "greaterThanInclusive", value: 50000000 },
          { fact: "approvalLevel", operator: "equal", value: "二级单位党委会" },
        ],
      },
      event: { type: "risk.warning", params: { rule: "决策越权规则R-056", level: "high", domain: "投资领域" } },
    }),
  },
  {
    id: "R-203",
    name: "虚假贸易规则R-203",
    domain: "采购与供应链领域",
    priority: 8,
    enabled: 1,
    version: 1,
    dsl_json: JSON.stringify({
      conditions: {
        all: [
          { fact: "buyAmount", operator: "equal", value: { fact: "sellAmount" } },
          { fact: "turnaroundHours", operator: "lessThanInclusive", value: 24 },
        ],
      },
      event: { type: "risk.warning", params: { rule: "虚假贸易规则R-203", level: "medium", domain: "采购与供应链领域" } },
    }),
  },
  {
    id: "R-012",
    name: "过度负债规则R-012",
    domain: "金融风险领域",
    priority: 9,
    enabled: 1,
    version: 1,
    dsl_json: JSON.stringify({
      conditions: {
        all: [{ fact: "debtRatio", operator: "greaterThanInclusive", value: 0.7 }],
      },
      event: { type: "risk.warning", params: { rule: "过度负债规则R-012", level: "high", domain: "金融风险领域" } },
    }),
  },
];

// ===================== 采集任务 =====================
// 对齐 CollectionTask 契约：lastStatus→last_status, lastRun→last_run
interface CollectionTaskSeed {
  id: string;
  name: string;
  source: string;
  mode: string;
  schedule: string;
  last_status: string;
  throughput: string;
  last_run: string;
}
const COLLECTION_TASKS: CollectionTaskSeed[] = [
  { id: "T-001", name: "浪潮-财务凭证主表（增量）", source: "浪潮 iGIX", mode: "增量", schedule: "*/5 * * * *", last_status: "成功", throughput: "1,820 条/s", last_run: "2026-07-16 09:10" },
  { id: "T-002", name: "司库-账户流水 CDC", source: "司库 MySQL", mode: "CDC", schedule: "实时", last_status: "运行中", throughput: "320 条/s", last_run: "2026-07-16 09:12" },
  { id: "T-003", name: "浪潮-合同头表全量", source: "浪潮 iGIX", mode: "全量", schedule: "0 2 * * *", last_status: "成功", throughput: "12,400 条/s", last_run: "2026-07-16 02:00" },
  { id: "T-004", name: "司库-担保记录增量", source: "司库 Oracle", mode: "增量", schedule: "*/15 * * * *", last_status: "成功", throughput: "120 条/s", last_run: "2026-07-16 09:00" },
  { id: "T-005", name: "组织架构主数据同步", source: "浪潮 iGIX", mode: "全量", schedule: "0 3 * * 0", last_status: "成功", throughput: "8,200 条/s", last_run: "2026-07-14 03:00" },
  { id: "T-006", name: "项目档案同步", source: "浪潮 iGIX", mode: "增量", schedule: "*/30 * * * *", last_status: "失败", throughput: "—", last_run: "2026-07-16 08:30" },
  { id: "T-007", name: "客商主数据全量", source: "浪潮 iGIX", mode: "全量", schedule: "0 4 * * *", last_status: "成功", throughput: "9,600 条/s", last_run: "2026-07-16 04:00" },
  { id: "T-008", name: "支付订单 CDC", source: "司库 MySQL", mode: "CDC", schedule: "实时", last_status: "运行中", throughput: "180 条/s", last_run: "2026-07-16 09:12" },
];

// ===================== 数据源 =====================
// 对齐 DataSource 契约：updateFreq→update_freq
interface DataSourceSeed {
  id: string;
  name: string;
  type: string;
  status: string;
  records: string;
  update_freq: string;
  owner: string;
}
const DATA_SOURCES: DataSourceSeed[] = [
  { id: "DS-001", name: "浪潮 iGIX 财务模块", type: "REST API", status: "online", records: "2.1 亿条", update_freq: "5 分钟", owner: "张明" },
  { id: "DS-002", name: "司库 MySQL 主库", type: "binlog CDC", status: "online", records: "8,600 万条", update_freq: "实时", owner: "李建国" },
  { id: "DS-003", name: "司库 Oracle 库", type: "JDBC", status: "online", records: "3,200 万条", update_freq: "15 分钟", owner: "李建国" },
  { id: "DS-004", name: "浪潮 iGIX 合同模块", type: "REST API", status: "online", records: "560 万条", update_freq: "1 天", owner: "王志远" },
  { id: "DS-005", name: "项目档案库", type: "REST API", status: "error", records: "180 万条", update_freq: "30 分钟", owner: "王志远" },
  { id: "DS-006", name: "客商主数据中心", type: "REST API", status: "online", records: "92 万条", update_freq: "1 天", owner: "赵敏" },
];

// ===================== 用户 =====================
// 5 类角色种子用户；password_hash 字段存明文（dev 环境，生产应 bcrypt）
interface UserSeed {
  id: string;
  username: string;
  password_hash: string;
  role: string;
  org_id: string;
  name: string;
}
const USERS: UserSeed[] = [
  { id: "U-ADMIN", username: "admin", password_hash: "admin123", role: "admin", org_id: "group", name: "集团监管员" },
  { id: "U-GROUP2", username: "group2", password_hash: "admin123", role: "group_admin", org_id: "xieling-zhuguan", name: "二级监管员" },
  { id: "U-INSPECTOR", username: "inspector", password_hash: "admin123", role: "inspector", org_id: "group", name: "核查人员" },
  { id: "U-DUTY", username: "duty", password_hash: "admin123", role: "duty_officer", org_id: "group", name: "值班员" },
  { id: "U-LEADER", username: "leader", password_hash: "admin123", role: "leader", org_id: "group", name: "集团领导" },
];

// ===================== 脱敏策略 =====================
// 默认覆盖：银行卡/身份证/手机号/姓名/金额/账户号/统一社会信用代码
interface SanitizerPolicySeed {
  name: string;
  field_pattern: string;
  algorithm: string;
  replace_value: string | null;
  enabled: number;
  role_scope: string;
}
const SANITIZER_POLICIES: SanitizerPolicySeed[] = [
  { name: "银行卡号掩码", field_pattern: "(bank_?card|card_?no|银行卡号?)", algorithm: "mask", replace_value: null, enabled: 1, role_scope: "*" },
  { name: "身份证号掩码", field_pattern: "(id_?card|identity|身份证号?)", algorithm: "mask", replace_value: null, enabled: 1, role_scope: "*" },
  { name: "手机号掩码", field_pattern: "(phone|mobile|手机号?)", algorithm: "mask", replace_value: null, enabled: 1, role_scope: "*" },
  { name: "姓名掩码", field_pattern: "(name|姓名)", algorithm: "mask", replace_value: null, enabled: 1, role_scope: "*" },
  { name: "金额区间化", field_pattern: "(amount|金额)", algorithm: "range", replace_value: null, enabled: 1, role_scope: "*" },
  { name: "账户号掩码", field_pattern: "(account_?no|账号)", algorithm: "mask", replace_value: null, enabled: 1, role_scope: "*" },
  { name: "统一社会信用代码掩码", field_pattern: "(credit_?code|uscc|社会信用代码)", algorithm: "mask", replace_value: null, enabled: 1, role_scope: "*" },
];

/** 执行种子数据灌入（幂等） */
export function seedDatabase(): void {
  const conn = db();
  transaction(() => {
    // 组织
    for (const o of ORGS) {
      insertOrIgnore("organizations", { id: o.id, name: o.name, level: o.level, parent_id: o.parent_id, type: o.type });
    }
    // 账户
    for (const a of ACCOUNTS) {
      insertOrIgnore("accounts", { id: a.id, org_id: a.org_id, name: a.name, account_no: a.account_no, type: a.type });
    }
    // 对手方
    for (const c of COUNTERPARTIES) {
      insertOrIgnore("counterparties", { id: c.id, name: c.name, meta: c.meta });
    }
    // 图谱节点
    for (const n of GRAPH_NODES) {
      insertOrIgnore("graph_nodes", { id: n.id, label: n.label, type: n.type, meta: n.meta });
    }
    // 图谱边（无主键约束，先清后插保证幂等）
    conn.exec("DELETE FROM graph_edges;");
    for (const e of GRAPH_EDGES) {
      insertOrIgnore("graph_edges", { source: e.source, target: e.target, label: e.label, weight: e.weight });
    }
    // 交易流水
    for (const t of TRANSACTIONS) {
      insertOrIgnore("transactions", {
        id: t.id,
        account_id: t.account_id,
        counterparty_id: t.counterparty_id,
        amount: t.amount,
        ts: t.ts,
        type: t.type,
        raw_json: t.raw_json,
      });
    }
    // 风险预警
    for (const r of RISK_WARNINGS) {
      insertOrIgnore("risk_warnings", {
        id: r.id,
        title: r.title,
        domain: r.domain,
        level: r.level,
        subject: r.subject,
        rule: r.rule,
        triggered_at: r.triggered_at,
        status: r.status,
        clue: r.clue,
        related_order_id: r.related_order_id,
        raw_json: JSON.stringify(r.raw),
      });
    }
    // 工单
    for (const w of WORK_ORDERS) {
      insertOrIgnore("work_orders", {
        id: w.id,
        risk_source: w.risk_source,
        owner: w.owner,
        current_node: w.current_node,
        progress: w.progress,
        status: w.status,
        risk_warning_id: w.risk_warning_id,
        created_at: "2026-07-16",
        updated_at: "2026-07-16",
      });
    }
    // 规则
    for (const r of RULES) {
      insertOrIgnore("rules", {
        id: r.id,
        name: r.name,
        domain: r.domain,
        dsl_json: r.dsl_json,
        priority: r.priority,
        enabled: r.enabled,
        version: r.version,
      });
    }
    // 采集任务
    for (const t of COLLECTION_TASKS) {
      insertOrIgnore("collection_tasks", {
        id: t.id,
        name: t.name,
        source: t.source,
        mode: t.mode,
        schedule: t.schedule,
        last_status: t.last_status,
        throughput: t.throughput,
        last_run: t.last_run,
      });
    }
    // 数据源
    for (const d of DATA_SOURCES) {
      insertOrIgnore("data_sources", {
        id: d.id,
        name: d.name,
        type: d.type,
        status: d.status,
        records: d.records,
        update_freq: d.update_freq,
        owner: d.owner,
      });
    }
    // 用户
    for (const u of USERS) {
      insertOrIgnore("users", {
        id: u.id,
        username: u.username,
        password_hash: u.password_hash,
        role: u.role,
        org_id: u.org_id,
        name: u.name,
      });
    }
    // 脱敏策略（先清后插保证幂等，自增主键）
    conn.exec("DELETE FROM sanitizer_policies;");
    for (const p of SANITIZER_POLICIES) {
      insertOrIgnore("sanitizer_policies", {
        name: p.name,
        field_pattern: p.field_pattern,
        algorithm: p.algorithm,
        replace_value: p.replace_value,
        enabled: p.enabled,
        role_scope: p.role_scope,
      });
    }
  });
  logger.info("种子数据灌入完成");
}
