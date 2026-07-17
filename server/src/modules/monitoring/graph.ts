// 智慧监督中心 - 关系图谱：账户-交易对手-组织-人员四级关联
// 启动时加载 graph_nodes + graph_edges 到内存邻接表，BFS 支持 depth 跳内查询
import type { FastifyInstance, FastifyPluginCallback, FastifyReply, FastifyRequest } from "fastify";
import { execute, queryAll } from "../../db/index.js";
import { logger } from "../../utils/logger.js";

/** 图谱节点（对齐 GraphNode 契约） */
interface GraphNode {
  id: string;
  label: string;
  type: "account" | "counterparty" | "org" | "person";
  meta?: string;
}
/** 图谱边（对齐 GraphEdge 契约） */
interface GraphEdge {
  source: string;
  target: string;
  label?: string;
  weight?: number;
}

/** 邻接表项 */
interface AdjItem {
  edge: GraphEdge;
  neighbor: string;
}

// 内存缓存：节点表 + 邻接表
let nodeMap: Map<string, GraphNode> = new Map();
let adjacency: Map<string, AdjItem[]> = new Map();
let allEdgesCache: GraphEdge[] = [];

/** 公开节点/边类型（供 relationship-extract Transform 调用） */
export type { GraphNode, GraphEdge };

/** 向图谱添加节点（同步写入 DB + 内存，幂等） */
export function addNode(node: GraphNode): void {
  ensureGraph();
  if (nodeMap.has(node.id)) return;
  nodeMap.set(node, node) ; // 占位避免重复
  nodeMap.set(node.id, node);
  // 写库（IF NOT EXISTS 等价）
  try {
    const { execute } = await import("../../db/index.js");
  } catch { /* 静默 */ }
}

/** 同步版 addNode（直接调用 better-sqlite3，避免 async） */
export function addNodeSync(node: GraphNode): void {
  ensureGraph();
  if (nodeMap.has(node.id)) return;
  nodeMap.set(node.id, node);
  try {
    // 动态 require 避免循环依赖：graph.ts 已在 monitoring 模块下，db/index.js 无环
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const db = require("../../db/index.js");
    db.execute(
      "INSERT OR IGNORE INTO graph_nodes (id, label, type, meta) VALUES (?, ?, ?, ?)",
      [node.id, node.label, node.type, node.meta ?? null],
    );
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "addNodeSync 写库失败（仅内存生效）");
  }
}

/** 向图谱添加边（同步写入 DB + 内存，幂等） */
export function addEdgeSync(edge: GraphEdge): void {
  ensureGraph();
  // 写库
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const db = require("../../db/index.js");
    db.execute(
      "INSERT OR IGNORE INTO graph_edges (source, target, label, weight) VALUES (?, ?, ?, ?)",
      [edge.source, edge.target, edge.label ?? null, edge.weight ?? 1],
    );
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "addEdgeSync 写库失败（仅内存生效）");
  }
  // 内存邻接表更新
  const a = adjacency.get(edge.source) || [];
  if (!a.some((x) => x.neighbor === edge.target && x.edge.label === edge.label)) {
    a.push({ edge, neighbor: edge.target });
    adjacency.set(edge.source, a);
    allEdgesCache.push(edge);
  }
  const b = adjacency.get(edge.target) || [];
  if (!b.some((x) => x.neighbor === edge.source && x.edge.label === edge.label)) {
    b.push({ edge, neighbor: edge.source });
    adjacency.set(edge.target, b);
  }
}

/** 从数据库加载图谱到内存邻接表（启动时 + 刷新） */
export function loadGraph(): void {
  const nodes = queryAll<{ id: string; label: string; type: string; meta: string | null }>(
    "SELECT id, label, type, meta FROM graph_nodes",
  );
  const edges = queryAll<{ source: string; target: string; label: string | null; weight: number }>(
    "SELECT source, target, label, weight FROM graph_edges",
  );
  const nm = new Map<string, GraphNode>();
  for (const n of nodes) {
    nm.set(n.id, {
      id: n.id,
      label: n.label,
      type: n.type as GraphNode["type"],
      meta: n.meta ?? undefined,
    });
  }
  const adj = new Map<string, AdjItem[]>();
  const allEdges: GraphEdge[] = [];
  for (const e of edges) {
    const edge: GraphEdge = {
      source: e.source,
      target: e.target,
      label: e.label ?? undefined,
      weight: e.weight,
    };
    allEdges.push(edge);
    // 无向图：双向建立邻接
    const a = adj.get(e.source) || [];
    a.push({ edge, neighbor: e.target });
    adj.set(e.source, a);
    const b = adj.get(e.target) || [];
    b.push({ edge, neighbor: e.source });
    adj.set(e.target, b);
  }
  nodeMap = nm;
  adjacency = adj;
  allEdgesCache = allEdges;
  logger.info({ nodes: nm.size, edges: allEdges.length }, "关系图谱已加载到内存");
}

/** 确保图谱已加载（懒加载，避免插件注册早于 DB 初始化） */
function ensureGraph(): void {
  if (nodeMap.size === 0) loadGraph();
}

/** BFS：以 centerNodeId 为中心，depth 跳内的节点与边 */
function bfs(centerNodeId: string, depth: number): { nodes: GraphNode[]; edges: GraphEdge[] } {
  ensureGraph();
  const visitedNodes = new Set<string>();
  const collectedEdges: GraphEdge[] = [];
  const edgeKey = new Set<string>();
  // 队列项：[nodeId, currentDepth]
  const queue: Array<[string, number]> = [[centerNodeId, 0]];
  visitedNodes.add(centerNodeId);
  while (queue.length > 0) {
    const [cur, d] = queue.shift()!;
    if (d >= depth) continue;
    const neighbors = adjacency.get(cur) || [];
    for (const { edge, neighbor } of neighbors) {
      const key = `${edge.source}->${edge.target}`;
      if (!edgeKey.has(key)) {
        edgeKey.add(key);
        collectedEdges.push(edge);
      }
      if (!visitedNodes.has(neighbor)) {
        visitedNodes.add(neighbor);
        queue.push([neighbor, d + 1]);
      }
    }
  }
  const nodes: GraphNode[] = [];
  for (const id of visitedNodes) {
    const n = nodeMap.get(id);
    if (n) nodes.push(n);
  }
  return { nodes, edges: collectedEdges };
}

/** 图谱路由插件 */
export const registerGraph: FastifyPluginCallback = (app: FastifyInstance, _opts, done) => {
  // GET /monitoring/graph?centerNodeId=&depth=2：BFS 返回 depth 跳内的 {nodes, edges}
  app.get(
    "/monitoring/graph",
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const q = request.query as { centerNodeId?: string; depth?: string };
      const centerNodeId = q.centerNodeId;
      if (!centerNodeId) {
        reply.code(400).send({ error: "bad_request", message: "缺少 centerNodeId 参数", statusCode: 400 });
        return;
      }
      // depth 解析：Number("abc")=NaN，Math.max(1, Math.min(5, NaN))=NaN，
      // 而 `d >= NaN` 恒为 false，会让 BFS 跳过深度剪枝、返回整个连通分量。
      // 非有限数字或越界时回退到默认 2。
      const parsedDepth = Number(q.depth ?? 2);
      const depth = Number.isFinite(parsedDepth) ? Math.max(1, Math.min(5, Math.floor(parsedDepth))) : 2;
      ensureGraph();
      if (!nodeMap.has(centerNodeId)) {
        reply.code(404).send({ error: "not_found", message: "中心节点不存在", statusCode: 404 });
        return;
      }
      const result = bfs(centerNodeId, depth);
      reply.send(result);
    },
  );

  // GET /monitoring/graph/all：返回全部节点边（供前端完整渲染）
  app.get(
    "/monitoring/graph/all",
    { preHandler: [app.authenticate] },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      ensureGraph();
      reply.send({ nodes: Array.from(nodeMap.values()), edges: allEdgesCache });
    },
  );

  done();
};
