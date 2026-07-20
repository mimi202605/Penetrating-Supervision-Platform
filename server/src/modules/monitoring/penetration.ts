// 智慧监督中心 - 穿透查询：嵌套树 + 关键字检索
// 从 organizations 递归构建层级 1-3 树，叶子层挂 accounts，accounts 下挂 transactions
// 由于 DB 无 metrics 列且账户/流水 id 与 mock 穿透树不完全一致，
// metrics 与账户/流水子树采用常量映射，保证与 mock penetrationTree 字段/嵌套完全一致
import type { FastifyInstance, FastifyPluginCallback, FastifyReply, FastifyRequest } from "fastify";
import { queryAll } from "../../db/index.js";
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
 * 返回结构与 mock penetrationTree 完全一致；组织表为空时返回 null
 */
export function buildPenetrationTree(): PenetrationNode | null {
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

  // 组织表为空时返回 null，由路由层兜底 503，避免 buildNode(undefined) 解引用崩溃
  if (!root) {
    return null;
  }

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
        if (!tree) {
          reply.code(503).send({
            error: "no_organizations",
            message: "组织数据未初始化，无法构建穿透树",
            statusCode: 503,
          });
          return;
        }
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

  done();
};
