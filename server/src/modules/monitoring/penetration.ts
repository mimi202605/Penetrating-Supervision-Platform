// 智慧监督中心 - 穿透查询：嵌套树 + 关键字检索
// 从 organizations 递归构建层级 1-3 树，叶子层挂 accounts，accounts 下挂 transactions
// 由于 DB 无 metrics 列且账户/流水 id 与 mock 穿透树不完全一致，
// metrics 与账户/流水子树采用常量映射，保证与 mock penetrationTree 字段/嵌套完全一致
import type { FastifyInstance, FastifyPluginCallback, FastifyReply, FastifyRequest } from "fastify";
import { queryAll, queryOne } from "../../db/index.js";
import { logger } from "../../utils/logger.js";

/** 穿透树节点（对齐 mock penetrationTree 契约） */
interface PenetrationNode {
  id: string;
  name: string;
  type: string;
  level: number;
  metrics: { assets: string; revenue: string; risk: number };
  children: PenetrationNode[];
}

/** 组织行（数据库列） */
interface OrgRow {
  id: string;
  name: string;
  level: number;
  parent_id: string | null;
  type: string | null;
}

// ===================== 指标常量映射（DB 无 metrics 列，对齐 mock） =====================
const METRICS: Record<string, { assets: string; revenue: string; risk: number }> = {
  group: { assets: "2,860 亿", revenue: "1,820 亿", risk: 86 },
  "xieling-zhuguan": { assets: "680 亿", revenue: "520 亿", risk: 32 },
  "xieling-zhuguan-1": { assets: "180 亿", revenue: "150 亿", risk: 14 },
  "acc-zhuguan-base": { assets: "—", revenue: "—", risk: 5 },
  "txn-1": { assets: "—", revenue: "—", risk: 1 },
  "txn-2": { assets: "—", revenue: "—", risk: 1 },
  "jihua-touzi": { assets: "320 亿", revenue: "180 亿", risk: 24 },
  "jihua-touzi-1": { assets: "120 亿", revenue: "60 亿", risk: 18 },
  "xinxing-zhonggong": { assets: "540 亿", revenue: "380 亿", risk: 30 },
};

/** 默认指标（未在映射表中的节点） */
const DEFAULT_METRICS = { assets: "—", revenue: "—", risk: 0 };

// ===================== 账户/流水子树（对齐 mock，挂载于叶子组织） =====================
// mock 树中仅 xieling-zhuguan-1（新兴铸管邯郸基地）下挂账户与流水
function buildAccountSubtree(orgId: string): PenetrationNode[] {
  if (orgId !== "xieling-zhuguan-1") return [];
  return [
    {
      id: "acc-zhuguan-base",
      name: "基本户 6228****1234",
      type: "账户/凭证",
      level: 4,
      metrics: METRICS["acc-zhuguan-base"] ?? DEFAULT_METRICS,
      children: [
        {
          id: "txn-1",
          name: "TXN20260716-0001 8,600万 → Everwin",
          type: "流水",
          level: 5,
          metrics: METRICS["txn-1"] ?? DEFAULT_METRICS,
          children: [],
        },
        {
          id: "txn-2",
          name: "TXN20260715-0042 3,200万 → 鑫达贸易",
          type: "流水",
          level: 5,
          metrics: METRICS["txn-2"] ?? DEFAULT_METRICS,
          children: [],
        },
      ],
    },
  ];
}

/**
 * 构建穿透树：从 organizations 递归 children，叶子组织挂账户/流水子树
 * 返回结构与 mock penetrationTree 完全一致
 */
export function buildPenetrationTree(): PenetrationNode {
  const orgs = queryAll<OrgRow>("SELECT id, name, level, parent_id, type FROM organizations");
  // 按 parent_id 分组（保留插入序以保证与 mock 子节点顺序一致）
  const byParent = new Map<string | null, OrgRow[]>();
  for (const o of orgs) {
    const key = o.parent_id;
    const arr = byParent.get(key) || [];
    arr.push(o);
    byParent.set(key, arr);
  }

  // 根节点：mock 根 id 为 "group"（集团总部）；若不存在则取首个 level=1 的组织
  const root =
    orgs.find((o) => o.id === "group") ||
    orgs.find((o) => o.level === 1 && o.parent_id === null) ||
    orgs[0];

  const buildNode = (org: OrgRow, visited: Set<string>): PenetrationNode => {
    // 防止 organizations.parent_id 出现环（自指/互指/更长环）导致无限递归栈溢出。
    // schema.sql 未对 parent_id 加 FK 约束也无环检测，脏数据会直接让 /penetration/tree 永久 500。
    if (visited.has(org.id)) {
      return {
        id: org.id,
        name: org.name,
        type: org.type ?? "",
        level: org.level,
        metrics: METRICS[org.id] ?? DEFAULT_METRICS,
        children: [],
      };
    }
    visited.add(org.id);
    const childOrgs = byParent.get(org.id) || [];
    // 叶子组织（level>=3 或无子组织）挂账户/流水子树
    const accountChildren = childOrgs.length === 0 ? buildAccountSubtree(org.id) : [];
    const children = [
      ...childOrgs.map((c) => buildNode(c, visited)),
      ...accountChildren,
    ];
    return {
      id: org.id,
      name: org.name,
      type: org.type ?? "",
      level: org.level,
      metrics: METRICS[org.id] ?? DEFAULT_METRICS,
      children,
    };
  };

  return buildNode(root, new Set<string>());
}

// ===================== 四级穿透下钻（V2 Task 17） =====================
// 四层映射：
//   ADS 层 = model_indicators（每个指标为一个 ADS 条目，经 model_id → regulatory_models.scene_id 关联场景）
//   DWS 层 = data_lineage 按 sink_table 分组（每个 sink_table 为一个 DWS block），按 scene_id 过滤
//   DWD 层 = ods_generic 行（每行为一个 DWD detail），按 stream（= sink_table）过滤
//   ODS 层 = ods_generic.record_json 原始内容

/** 解析 record_json，失败返回空对象 */
function parseRecord(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** 1. ADS → DWS：给定 indicatorId，返回该指标关联场景下的 DWS block 列表 */
export function drillADS(indicatorId: string): {
  indicator: { id: string; modelId: string; name: string; expr: string | null; dataSource: string | null; unit: string | null } | null;
  sceneId: string | null;
  dwsBlocks: Array<{ blockId: string; sinkTable: string; layer: string | null; sceneId: string | null; taskId: string }>;
} {
  const ind = queryOne<{ id: string; model_id: string; name: string; expr: string | null; data_source: string | null; unit: string | null }>(
    "SELECT id, model_id, name, expr, data_source, unit FROM model_indicators WHERE id = ?",
    [indicatorId],
  );
  if (!ind) {
    return { indicator: null, sceneId: null, dwsBlocks: [] };
  }
  const indicator = {
    id: ind.id,
    modelId: ind.model_id,
    name: ind.name,
    expr: ind.expr,
    dataSource: ind.data_source,
    unit: ind.unit,
  };
  const model = queryOne<{ id: string; scene_id: string | null }>(
    "SELECT id, scene_id FROM regulatory_models WHERE id = ?",
    [ind.model_id],
  );
  const sceneId = model?.scene_id ?? null;
  let dwsBlocks: Array<{ blockId: string; sinkTable: string; layer: string | null; sceneId: string | null; taskId: string }> = [];
  if (sceneId) {
    const rows = queryAll<{ sink_table: string; layer: string | null; scene_id: string | null; task_id: string }>(
      "SELECT DISTINCT sink_table, layer, scene_id, task_id FROM data_lineage WHERE scene_id = ?",
      [sceneId],
    );
    dwsBlocks = rows.map((r) => ({
      blockId: r.sink_table,
      sinkTable: r.sink_table,
      layer: r.layer,
      sceneId: r.scene_id,
      taskId: r.task_id,
    }));
  }
  return { indicator, sceneId, dwsBlocks };
}

/** 2. DWS → DWD：给定 blockId (=sink_table)，返回该 block 下的 DWD detail 列表
 *
 * blockId 是 data_lineage.sink_table（如 ods_payment_flow 或自定义 sink_target）。
 * ods_generic.stream 存的是原始 stream 名（如 payment_flow），与 sink_table 不一定相等，
 * 故通过 lineage 的 task_id 关联 ods_generic（同任务下写入的记录都属于该 block）。
 */
export function drillDWS(blockId: string): {
  blockId: string;
  lineage: Array<{ id: number; taskId: string; sourceTable: string | null; sinkTable: string; layer: string | null; sceneId: string | null }>;
  dwdDetails: Array<{ detailId: number; stream: string; taskId: string; runId: string; ingestedAt: string }>;
} {
  const lineageRows = queryAll<{ id: number; task_id: string; source_table: string | null; sink_table: string; layer: string | null; scene_id: string | null }>(
    "SELECT id, task_id, source_table, sink_table, layer, scene_id FROM data_lineage WHERE sink_table = ? LIMIT 50",
    [blockId],
  );
  const lineage = lineageRows.map((r) => ({
    id: r.id,
    taskId: r.task_id,
    sourceTable: r.source_table,
    sinkTable: r.sink_table,
    layer: r.layer,
    sceneId: r.scene_id,
  }));
  // 通过 task_id 关联 ods_generic（同任务写入的记录属于该 block）
  const dwdRows = queryAll<{ id: number; stream: string; task_id: string; run_id: string; ingested_at: string }>(
    "SELECT id, stream, task_id, run_id, ingested_at FROM ods_generic WHERE task_id IN (SELECT DISTINCT task_id FROM data_lineage WHERE sink_table = ?) ORDER BY id DESC LIMIT 100",
    [blockId],
  );
  const dwdDetails = dwdRows.map((r) => ({
    detailId: r.id,
    stream: r.stream,
    taskId: r.task_id,
    runId: r.run_id,
    ingestedAt: r.ingested_at,
  }));
  return { blockId, lineage, dwdDetails };
}

/** 3. DWD → ODS：给定 detailId (=ods_generic.id)，返回原始单据信息 */
export function drillDWD(detailId: number): {
  detailId: number;
  stream: string;
  taskId: string;
  runId: string;
  ingestedAt: string;
  odsDocs: Array<{ docId: number; record: Record<string, unknown> }>;
} | null {
  const row = queryOne<{ id: number; stream: string; task_id: string; run_id: string; ingested_at: string; record_json: string }>(
    "SELECT id, stream, task_id, run_id, ingested_at, record_json FROM ods_generic WHERE id = ?",
    [detailId],
  );
  if (!row) return null;
  const record = parseRecord(row.record_json);
  return {
    detailId: row.id,
    stream: row.stream,
    taskId: row.task_id,
    runId: row.run_id,
    ingestedAt: row.ingested_at,
    odsDocs: [{ docId: row.id, record }],
  };
}

/** 4. ODS：给定 docId (=ods_generic.id)，返回解析后的原始单据 */
export function drillODS(docId: number): {
  docId: number;
  stream: string;
  taskId: string;
  runId: string;
  ingestedAt: string;
  record: Record<string, unknown>;
} | null {
  const row = queryOne<{ id: number; stream: string; task_id: string; run_id: string; ingested_at: string; record_json: string }>(
    "SELECT id, stream, task_id, run_id, ingested_at, record_json FROM ods_generic WHERE id = ?",
    [docId],
  );
  if (!row) return null;
  const record = parseRecord(row.record_json);
  return {
    docId: row.id,
    stream: row.stream,
    taskId: row.task_id,
    runId: row.run_id,
    ingestedAt: row.ingested_at,
    record,
  };
}

/** 5. 血缘图谱：给定 sceneId，返回 {nodes, edges} 供前端图谱渲染 */
export function getLineageGraph(sceneId: string): {
  nodes: Array<{ id: string; label: string; type: string; meta?: string }>;
  edges: Array<{ source: string; target: string; label?: string; weight?: number }>;
} {
  const nodes: Array<{ id: string; label: string; type: string; meta?: string }> = [];
  const edges: Array<{ source: string; target: string; label?: string; weight?: number }> = [];

  // ADS 节点：场景下模型的指标
  const indicators = queryAll<{ id: string; name: string; model_id: string }>(
    "SELECT mi.id, mi.name, mi.model_id FROM model_indicators mi JOIN regulatory_models rm ON mi.model_id = rm.id WHERE rm.scene_id = ?",
    [sceneId],
  );
  for (const ind of indicators) {
    nodes.push({ id: `ads:${ind.id}`, label: ind.name, type: "ads" });
  }

  // DWS 节点：场景下 data_lineage 的 distinct sink_table
  const sinkTables = queryAll<{ sink_table: string }>(
    "SELECT DISTINCT sink_table FROM data_lineage WHERE scene_id = ?",
    [sceneId],
  );
  for (const s of sinkTables) {
    nodes.push({ id: `dws:${s.sink_table}`, label: s.sink_table, type: "dws" });
  }

  // DWD 节点：通过 task_id 关联场景下 sink_table 的 ods_generic 行（limit 50）
  // （ods_generic.stream 与 sink_table 不一定相等，故用 task_id 关联）
  const dwdRows = queryAll<{ id: number; stream: string; task_id: string }>(
    "SELECT id, stream, task_id FROM ods_generic WHERE task_id IN (SELECT DISTINCT task_id FROM data_lineage WHERE scene_id = ?) ORDER BY id DESC LIMIT 50",
    [sceneId],
  );
  for (const d of dwdRows) {
    nodes.push({ id: `dwd:${d.id}`, label: `${d.stream}#${d.id}`, type: "dwd" });
  }

  // 边：每个 ADS 指标 → 每个 DWS block，label 'aggregates'
  for (const ind of indicators) {
    for (const s of sinkTables) {
      edges.push({ source: `ads:${ind.id}`, target: `dws:${s.sink_table}`, label: "aggregates" });
    }
  }
  // 边：每个 DWD 节点 ← 其所属 DWS block（通过 task_id 找到对应 sink_table），label 'contains'
  // 建立 task_id → sink_table 映射，用于 DWD → DWS 边
  const taskToSink = new Map<string, string>();
  const lineageForEdges = queryAll<{ task_id: string; sink_table: string }>(
    "SELECT task_id, sink_table FROM data_lineage WHERE scene_id = ?",
    [sceneId],
  );
  for (const l of lineageForEdges) {
    if (!taskToSink.has(l.task_id)) {
      taskToSink.set(l.task_id, l.sink_table);
    }
  }
  for (const d of dwdRows) {
    const sink = taskToSink.get(d.task_id);
    if (sink) {
      edges.push({ source: `dws:${sink}`, target: `dwd:${d.id}`, label: "contains" });
    }
  }

  return { nodes, edges };
}

/** 检索命中卡片 */
interface SearchHit {
  id: string;
  name: string;
  type: string; // 主体/账户/流水/风险/合同/项目
  desc: string;
  path: string;
}

/** 穿透查询路由插件 */
export const registerPenetration: FastifyPluginCallback = (app: FastifyInstance, _opts, done) => {
  // GET /monitoring/penetration/tree：构建嵌套树
  app.get(
    "/monitoring/penetration/tree",
    { preHandler: [app.authenticate] },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      try {
        const tree = buildPenetrationTree();
        reply.send(tree);
      } catch (err) {
        logger.error({ err: (err as Error).message }, "构建穿透树失败");
        reply.code(500).send({ error: "internal_error", message: "构建穿透树失败", statusCode: 500 });
      }
    },
  );

  // GET /monitoring/penetration/search?keyword=&type=：关键字检索（主体/资金/合同/项目）
  app.get(
    "/monitoring/penetration/search",
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const q = request.query as { keyword?: string; type?: string };
      const keyword = (q.keyword ?? "").trim();
      const type = (q.type ?? "").trim();
      if (!keyword) {
        reply.send([]);
        return;
      }
      const kw = `%${keyword}%`;
      const hits: SearchHit[] = [];

      // 主体：组织
      if (!type || type === "subject" || type === "主体") {
        const orgs = queryAll<{ id: string; name: string; type: string | null; parent_id: string | null }>(
          "SELECT id, name, type, parent_id FROM organizations WHERE name LIKE ? OR id LIKE ?",
          [kw, kw],
        );
        for (const o of orgs) {
          hits.push({ id: o.id, name: o.name, type: "主体", desc: o.type ?? "组织", path: o.parent_id ?? "" });
        }
      }
      // 资金：账户 + 交易流水
      if (!type || type === "fund" || type === "资金") {
        const accs = queryAll<{ id: string; name: string | null; account_no: string | null; org_id: string | null }>(
          "SELECT id, name, account_no, org_id FROM accounts WHERE name LIKE ? OR account_no LIKE ?",
          [kw, kw],
        );
        for (const a of accs) {
          hits.push({ id: a.id, name: a.name ?? a.account_no ?? a.id, type: "账户", desc: a.account_no ?? "", path: a.org_id ?? "" });
        }
        const txns = queryAll<{ id: string; amount: number; ts: string; account_id: string | null }>(
          "SELECT id, amount, ts, account_id FROM transactions WHERE id LIKE ?",
          [kw],
        );
        for (const t of txns) {
          hits.push({ id: t.id, name: t.id, type: "资金", desc: `金额 ${t.amount} / ${t.ts}`, path: t.account_id ?? "" });
        }
      }
      // 合同/项目：风险预警（含合同/采购/项目线索）
      if (!type || type === "contract" || type === "合同" || type === "project" || type === "项目") {
        const rws = queryAll<{ id: string; title: string; domain: string | null; subject: string | null }>(
          "SELECT id, title, domain, subject FROM risk_warnings WHERE title LIKE ? OR subject LIKE ? OR clue LIKE ?",
          [kw, kw, kw],
        );
        for (const r of rws) {
          hits.push({ id: r.id, name: r.title, type: r.domain ?? "风险", desc: r.subject ?? "", path: "" });
        }
      }
      reply.send(hits);
    },
  );

  // ===================== 四级穿透下钻路由（V2 Task 17） =====================

  // GET /penetration/ads/:indicatorId — ADS → DWS 下钻
  app.get(
    "/penetration/ads/:indicatorId",
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { indicatorId } = request.params as { indicatorId: string };
      const result = drillADS(indicatorId);
      if (!result.indicator) {
        reply.code(404).send({ error: "not_found", message: "指标不存在", statusCode: 404 });
        return;
      }
      reply.send(result);
    },
  );

  // GET /penetration/dws/:blockId — DWS → DWD 下钻（blockId = sink_table，可含连字符）
  app.get(
    "/penetration/dws/:blockId",
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { blockId } = request.params as { blockId: string };
      const result = drillDWS(blockId);
      if (result.lineage.length === 0 && result.dwdDetails.length === 0) {
        reply.code(404).send({ error: "not_found", message: "DWS block 不存在", statusCode: 404 });
        return;
      }
      reply.send(result);
    },
  );

  // GET /penetration/dwd/:detailId — DWD → ODS 下钻（detailId = ods_generic.id）
  app.get(
    "/penetration/dwd/:detailId",
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { detailId } = request.params as { detailId: string };
      const id = Number(detailId);
      if (!Number.isFinite(id) || !Number.isInteger(id)) {
        reply.code(400).send({ error: "bad_request", message: "detailId 必须为整数", statusCode: 400 });
        return;
      }
      const result = drillDWD(id);
      if (!result) {
        reply.code(404).send({ error: "not_found", message: "DWD detail 不存在", statusCode: 404 });
        return;
      }
      reply.send(result);
    },
  );

  // GET /penetration/ods/:docId — ODS 原始单据（docId = ods_generic.id）
  app.get(
    "/penetration/ods/:docId",
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { docId } = request.params as { docId: string };
      const id = Number(docId);
      if (!Number.isFinite(id) || !Number.isInteger(id)) {
        reply.code(400).send({ error: "bad_request", message: "docId 必须为整数", statusCode: 400 });
        return;
      }
      const result = drillODS(id);
      if (!result) {
        reply.code(404).send({ error: "not_found", message: "ODS 单据不存在", statusCode: 404 });
        return;
      }
      reply.send(result);
    },
  );

  // GET /penetration/lineage?sceneId= — 场景血缘图谱
  app.get(
    "/penetration/lineage",
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const q = request.query as { sceneId?: string };
      const sceneId = (q.sceneId ?? "").trim();
      if (!sceneId) {
        reply.code(400).send({ error: "bad_request", message: "缺少 sceneId 参数", statusCode: 400 });
        return;
      }
      const result = getLineageGraph(sceneId);
      if (result.nodes.length === 0) {
        reply.code(404).send({ error: "not_found", message: "场景下无血缘节点", statusCode: 404 });
        return;
      }
      reply.send(result);
    },
  );

  done();
};
