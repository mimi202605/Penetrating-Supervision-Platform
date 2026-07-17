// 监管场景 + 模型 + 指标 + 采集任务模板 预置种子数据（V2 Task 13）
// 5 个监管场景（finance-risk 域）+ 5 个监管模型 + 各 3-5 个指标 + 5 个采集任务模板
// 幂等：按 id INSERT OR IGNORE
import { transaction, execute } from "../db/index.js";
import { logger } from "../utils/logger.js";

/** 5 个监管场景 */
const SCENES = [
  {
    id: "sc-fin-dup-pay",
    domain: "finance-risk",
    issue_code: "dup_payment",
    name: "重复支付预警",
    description: "同收款方、同金额、同日多笔支付识别，防止拆分规避审批",
    data_sources: ["treasury-sys"],
    indicators: ["dupCount", "totalAmount"],
    threshold: { yellow: 2, orange: 5, red: 10 },
    freq: "realtime",
    model_id: "m-fin-dup-pay-001",
  },
  {
    id: "sc-fin-private-pay",
    domain: "finance-risk",
    issue_code: "private_off_hours_pay",
    name: "非工作时间大额对私支付",
    description: "22:00-06:00 对私支付且金额超过阈值，识别利益输送或资金挪用",
    data_sources: ["treasury-sys"],
    indicators: ["amount", "isPrivate", "hour"],
    threshold: { yellow: 50000, orange: 200000, red: 1000000 },
    freq: "realtime",
    model_id: "m-fin-private-pay-001",
  },
  {
    id: "sc-fin-fake-trade",
    domain: "finance-risk",
    issue_code: "fake_trade",
    name: "融资性贸易/空转走单",
    description: "A→B→A 资金回流 + 无商业实质的关联交易",
    data_sources: ["treasury-sys", "jdbc-mysql"],
    indicators: ["roundTripCount", "tradeVolume"],
    threshold: { yellow: 1, orange: 3, red: 5 },
    freq: "daily",
    model_id: "m-fin-fake-trade-001",
  },
  {
    id: "sc-fin-guarantee",
    domain: "finance-risk",
    issue_code: "over_guarantee",
    name: "超股比担保",
    description: "对外担保金额超过持股比例对应的金额，承担超额风险",
    data_sources: ["treasury-sys"],
    indicators: ["guaranteeAmount", "shareholdingRatio", "ratio"],
    threshold: { yellow: 1, orange: 2, red: 5 },
    freq: "daily",
    model_id: "m-fin-guarantee-001",
  },
  {
    id: "sc-fin-funding-due",
    domain: "finance-risk",
    issue_code: "funding_due",
    name: "融资到期预警",
    description: "融资到期 30/7/1 天内分级预警，提前筹措还款资金",
    data_sources: ["treasury-sys"],
    indicators: ["daysToDue", "amount"],
    threshold: { yellow: 30, orange: 7, red: 1 },
    freq: "daily",
    model_id: "m-fin-funding-due-001",
  },
];

/** 5 个监管模型 + 各模型 rule_dsl（json-rules-engine 格式） */
const MODELS = [
  {
    id: "m-fin-dup-pay-001",
    scene_id: "sc-fin-dup-pay",
    domain: "finance-risk",
    category: "rule",
    name: "重复支付检测",
    description: "同收款方同金额同日 dupCount ≥ 2 触发预警",
    rule_type: "enterprise",
    rule_dsl: {
      conditions: {
        all: [
          { fact: "dupCount", operator: "greaterThanInclusive", value: 2 },
        ],
      },
      event: { type: "risk-hit", params: { level: "yellow", modelId: "m-fin-dup-pay-001", title: "重复支付预警" } },
    },
    threshold_json: { yellow: 2, orange: 5, red: 10 },
    schedule_cron: "*/5 * * * *",
    status: "online",
    version: "1.0.0",
    owner_dept: "财务部",
    effectiveness: "P0",
  },
  {
    id: "m-fin-private-pay-001",
    scene_id: "sc-fin-private-pay",
    domain: "finance-risk",
    category: "rule",
    name: "非工作时间大额对私支付",
    description: "22:00-06:00 对私支付 amount ≥ 50000 触发预警",
    rule_type: "enterprise",
    rule_dsl: {
      conditions: {
        all: [
          { fact: "hour", operator: "lessThan", value: 6 },
          { fact: "isPrivate", operator: "equal", value: true },
          { fact: "amount", operator: "greaterThanInclusive", value: 50000 },
        ],
      },
      event: { type: "risk-hit", params: { level: "yellow", modelId: "m-fin-private-pay-001", title: "非工作时间大额对私支付" } },
    },
    threshold_json: { yellow: 50000, orange: 200000, red: 1000000 },
    schedule_cron: "*/1 * * * *",
    status: "online",
    version: "1.0.0",
    owner_dept: "财务部",
    effectiveness: "P0",
  },
  {
    id: "m-fin-fake-trade-001",
    scene_id: "sc-fin-fake-trade",
    domain: "finance-risk",
    category: "rule",
    name: "融资性贸易/空转走单",
    description: "资金回流 roundTripCount ≥ 1 触发预警",
    rule_type: "enterprise",
    rule_dsl: {
      conditions: {
        all: [
          { fact: "roundTripCount", operator: "greaterThanInclusive", value: 1 },
        ],
      },
      event: { type: "risk-hit", params: { level: "yellow", modelId: "m-fin-fake-trade-001", title: "融资性贸易/空转走单" } },
    },
    threshold_json: { yellow: 1, orange: 3, red: 5 },
    schedule_cron: "0 2 * * *",
    status: "online",
    version: "1.0.0",
    owner_dept: "财务部",
    effectiveness: "P0",
  },
  {
    id: "m-fin-guarantee-001",
    scene_id: "sc-fin-guarantee",
    domain: "finance-risk",
    category: "rule",
    name: "超股比担保",
    description: "担保金额/持股比例 > 1 触发预警（ratio = guaranteeAmount / shareholdingRatio）",
    rule_type: "enterprise",
    rule_dsl: {
      conditions: {
        all: [
          { fact: "ratio", operator: "greaterThan", value: 1 },
        ],
      },
      event: { type: "risk-hit", params: { level: "yellow", modelId: "m-fin-guarantee-001", title: "超股比担保" } },
    },
    threshold_json: { yellow: 1, orange: 2, red: 5 },
    schedule_cron: "0 2 * * *",
    status: "online",
    version: "1.0.0",
    owner_dept: "财务部",
    effectiveness: "P0",
  },
  {
    id: "m-fin-funding-due-001",
    scene_id: "sc-fin-funding-due",
    domain: "finance-risk",
    category: "rule",
    name: "融资到期预警",
    description: "融资到期 daysToDue ≤ 30 触发预警",
    rule_type: "enterprise",
    rule_dsl: {
      conditions: {
        all: [
          { fact: "daysToDue", operator: "lessThanInclusive", value: 30 },
        ],
      },
      event: { type: "risk-hit", params: { level: "yellow", modelId: "m-fin-funding-due-001", title: "融资到期预警" } },
    },
    threshold_json: { yellow: 30, orange: 7, red: 1 },
    schedule_cron: "0 8 * * *",
    status: "online",
    version: "1.0.0",
    owner_dept: "财务部",
    effectiveness: "P0",
  },
];

/** 每个模型 3-5 个指标 */
const INDICATORS = [
  // m-fin-dup-pay-001: 4 个指标
  { id: "ind-dup-1", model_id: "m-fin-dup-pay-001", name: "重复支付笔数", expr: "count(payment_id) where payee=payee and amount=amount and day=day", data_source: "ods_payment_flow", unit: "笔" },
  { id: "ind-dup-2", model_id: "m-fin-dup-pay-001", name: "重复支付总金额", expr: "sum(amount) where dupCount>=2", data_source: "ods_payment_flow", unit: "元" },
  { id: "ind-dup-3", model_id: "m-fin-dup-pay-001", name: "涉及收款方数", expr: "count(distinct payee) where dupCount>=2", data_source: "ods_payment_flow", unit: "个" },
  { id: "ind-dup-4", model_id: "m-fin-dup-pay-001", name: "最大重复次数", expr: "max(dupCount)", data_source: "ods_payment_flow", unit: "次" },
  // m-fin-private-pay-001: 3 个指标
  { id: "ind-pp-1", model_id: "m-fin-private-pay-001", name: "非工作时间对私支付笔数", expr: "count(*) where hour<6 or hour>=22 and isPrivate=true", data_source: "ods_payment_flow", unit: "笔" },
  { id: "ind-pp-2", model_id: "m-fin-private-pay-001", name: "非工作时间对私支付总金额", expr: "sum(amount) where isPrivate=true and amount>=50000", data_source: "ods_payment_flow", unit: "元" },
  { id: "ind-pp-3", model_id: "m-fin-private-pay-001", name: "最大单笔金额", expr: "max(amount) where isPrivate=true", data_source: "ods_payment_flow", unit: "元" },
  // m-fin-fake-trade-001: 3 个指标
  { id: "ind-ft-1", model_id: "m-fin-fake-trade-001", name: "资金回流笔数", expr: "count(*) where roundTrip=true", data_source: "ods_transaction", unit: "笔" },
  { id: "ind-ft-2", model_id: "m-fin-fake-trade-001", name: "回流总金额", expr: "sum(amount) where roundTrip=true", data_source: "ods_transaction", unit: "元" },
  { id: "ind-ft-3", model_id: "m-fin-fake-trade-001", name: "回流链条长度", expr: "max(chainLength) where roundTrip=true", data_source: "ods_transaction", unit: "跳" },
  // m-fin-guarantee-001: 3 个指标
  { id: "ind-gua-1", model_id: "m-fin-guarantee-001", name: "担保金额", expr: "guaranteeAmount", data_source: "ods_guarantee_info", unit: "元" },
  { id: "ind-gua-2", model_id: "m-fin-guarantee-001", name: "持股比例", expr: "shareholdingRatio", data_source: "ods_shareholder", unit: "%" },
  { id: "ind-gua-3", model_id: "m-fin-guarantee-001", name: "担保/持股比", expr: "guaranteeAmount / shareholdingRatio", data_source: "ods_guarantee_info", unit: "倍" },
  // m-fin-funding-due-001: 3 个指标
  { id: "ind-fd-1", model_id: "m-fin-funding-due-001", name: "到期天数", expr: "datediff(dueDate, now())", data_source: "ods_funding", unit: "天" },
  { id: "ind-fd-2", model_id: "m-fin-funding-due-001", name: "融资金额", expr: "amount", data_source: "ods_funding", unit: "元" },
  { id: "ind-fd-3", model_id: "m-fin-funding-due-001", name: "融资利率", expr: "rate", data_source: "ods_funding", unit: "%" },
];

/** 5 个采集任务模板（对应 5 个场景） */
const TEMPLATES = [
  {
    id: "tpl-dup-pay",
    scene_id: "sc-fin-dup-pay",
    name: "司库支付流水采集-重复支付",
    connector_type: "treasury-sys",
    stream: "payment_flow",
    schedule_cron: "*/5 * * * *",
    transform_pipeline: {
      steps: [
        { id: "s1", type: "field-mapping", config: { mapping: { FPayee: "payee", FAmount: "amount", FPayTime: "payTime" } }, onError: "skip" },
        { id: "s2", type: "type-cast", config: { target: "number", fields: ["amount"] }, onError: "skip" },
      ],
    },
    field_mapping: { FPayee: "payee", FAmount: "amount", FPayTime: "payTime" },
  },
  {
    id: "tpl-private-pay",
    scene_id: "sc-fin-private-pay",
    name: "司库支付流水采集-对私支付",
    connector_type: "treasury-sys",
    stream: "payment_flow",
    schedule_cron: "*/1 * * * *",
    transform_pipeline: {
      steps: [
        { id: "s1", type: "field-mapping", config: { mapping: { FAmount: "amount", FPayTime: "payTime", FCounterpartyType: "isPrivate" } }, onError: "skip" },
      ],
    },
    field_mapping: { FAmount: "amount", FPayTime: "payTime", FCounterpartyType: "isPrivate" },
  },
  {
    id: "tpl-fake-trade",
    scene_id: "sc-fin-fake-trade",
    name: "交易流水采集-资金回流",
    connector_type: "jdbc-mysql",
    stream: "transaction",
    schedule_cron: "0 2 * * *",
    transform_pipeline: {
      steps: [
        { id: "s1", type: "field-mapping", config: { mapping: { FFrom: "from", FTo: "to", FAmount: "amount" } }, onError: "skip" },
      ],
    },
    field_mapping: { FFrom: "from", FTo: "to", FAmount: "amount" },
  },
  {
    id: "tpl-guarantee",
    scene_id: "sc-fin-guarantee",
    name: "司库担保记录采集",
    connector_type: "treasury-sys",
    stream: "guarantee_info",
    schedule_cron: "0 2 * * *",
    transform_pipeline: {
      steps: [
        { id: "s1", type: "field-mapping", config: { mapping: { FGuaranteeAmount: "guaranteeAmount", FShareholdingRatio: "shareholdingRatio" } }, onError: "skip" },
      ],
    },
    field_mapping: { FGuaranteeAmount: "guaranteeAmount", FShareholdingRatio: "shareholdingRatio" },
  },
  {
    id: "tpl-funding-due",
    scene_id: "sc-fin-funding-due",
    name: "司库融资到期采集",
    connector_type: "treasury-sys",
    stream: "bill_info",
    schedule_cron: "0 8 * * *",
    transform_pipeline: {
      steps: [
        { id: "s1", type: "field-mapping", config: { mapping: { FDueDate: "dueDate", FAmount: "amount" } }, onError: "skip" },
      ],
    },
    field_mapping: { FDueDate: "dueDate", FAmount: "amount" },
  },
];

/** 灌入监管种子数据（幂等） */
export function seedRegulatory(): void {
  transaction(() => {
    for (const s of SCENES) {
      execute(
        `INSERT OR IGNORE INTO regulatory_scenes
          (id, domain, issue_code, name, description, data_sources, indicators, threshold, freq, model_id, enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          s.id, s.domain, s.issue_code, s.name, s.description,
          JSON.stringify(s.data_sources), JSON.stringify(s.indicators),
          JSON.stringify(s.threshold), s.freq, s.model_id, 1,
        ],
      );
    }
    for (const m of MODELS) {
      execute(
        `INSERT OR IGNORE INTO regulatory_models
          (id, scene_id, domain, category, name, description, rule_type,
           indicator_count, rule_dsl, threshold_json, schedule_cron, status,
           version, owner_dept, effectiveness)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          m.id, m.scene_id, m.domain, m.category, m.name, m.description,
          m.rule_type, 0, JSON.stringify(m.rule_dsl), JSON.stringify(m.threshold_json),
          m.schedule_cron, m.status, m.version, m.owner_dept, m.effectiveness,
        ],
      );
      // 更新指标数
      const indCount = INDICATORS.filter((i) => i.model_id === m.id).length;
      execute("UPDATE regulatory_models SET indicator_count = ? WHERE id = ?", [indCount, m.id]);
    }
    for (const i of INDICATORS) {
      execute(
        `INSERT OR IGNORE INTO model_indicators (id, model_id, name, expr, data_source, unit)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [i.id, i.model_id, i.name, i.expr, i.data_source, i.unit],
      );
    }
    for (const t of TEMPLATES) {
      execute(
        `INSERT OR IGNORE INTO collection_task_templates
          (id, scene_id, name, connector_type, stream, schedule_cron, transform_pipeline, field_mapping)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          t.id, t.scene_id, t.name, t.connector_type, t.stream,
          t.schedule_cron, JSON.stringify(t.transform_pipeline), JSON.stringify(t.field_mapping),
        ],
      );
    }
  });
  logger.info(
    { scenes: SCENES.length, models: MODELS.length, indicators: INDICATORS.length, templates: TEMPLATES.length },
    "监管种子数据灌入完成",
  );
}
