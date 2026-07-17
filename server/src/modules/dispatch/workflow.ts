// 调度指挥中心 - 工单状态机（Flowable 等价）
// 节点顺序：verify → rectify → review → archive
// advanceWorkOrder 校验当前节点并推进，更新 progress / current_node / status / updated_at
// 到达 archive 时同步将关联风险预警置为 resolved，并记审计 + emit 'workorder.advanced'
import { execute, queryAll, queryOne } from "../../db/index.js";
import { camelize } from "../../utils/case.js";
import { recordAudit } from "../platform/audit.js";
import { eventBus } from "../platform/eventbus.js";
import { incWorkorderAdvance } from "../../health.js";
import { logger } from "../../utils/logger.js";

/** 工单节点顺序 */
export const NODE_ORDER = ["verify", "rectify", "review", "archive"] as const;
export type WorkOrderNode = (typeof NODE_ORDER)[number];

/** 各节点对应进度（0-100） */
export const PROGRESS_BY_NODE: Record<WorkOrderNode, number> = {
  verify: 20,
  rectify: 50,
  review: 80,
  archive: 100,
};

/** 工单数据库行（snake_case 列） */
export interface WorkOrderRow {
  id: string;
  risk_source: string | null;
  owner: string | null;
  current_node: string;
  progress: number;
  status: string;
  risk_warning_id: string | null;
  created_at: string;
  updated_at: string;
}

/** 操作人上下文（用于审计；自动派单场景为 null） */
export interface AdvanceActor {
  userId: string | null;
  ip: string | null;
}

/** 推进结果 */
export interface AdvanceResult {
  ok: boolean;
  message: string;
  order?: Record<string, unknown>;
  fromNode?: string;
  toNode?: string;
}

/** 当前时间字符串（YYYY-MM-DD HH:mm，与种子格式一致） */
function nowFormatted(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 校验是否合法节点 */
function isNode(n: string): n is WorkOrderNode {
  return (NODE_ORDER as readonly string[]).includes(n);
}

/**
 * 推进工单至下一节点
 * - 校验当前节点是否合法、是否已 archive
 * - 更新 current_node / progress / status / updated_at
 * - 到达 archive 且有关联 risk_warning_id 时，同步将风险预警置为 resolved
 * - 记审计 + 指标 +1 + emit 'workorder.advanced'
 */
export function advanceWorkOrder(
  orderId: string,
  result?: unknown,
  actor?: AdvanceActor,
): AdvanceResult {
  const row = queryOne<WorkOrderRow>(
    "SELECT id, risk_source, owner, current_node, progress, status, risk_warning_id, created_at, updated_at FROM work_orders WHERE id = ?",
    [orderId],
  );
  if (!row) {
    return { ok: false, message: "工单不存在" };
  }
  if (!isNode(row.current_node)) {
    return { ok: false, message: `当前节点非法：${row.current_node}` };
  }
  if (row.current_node === "archive") {
    return { ok: false, message: "工单已归档，无法继续推进" };
  }

  const fromNode = row.current_node;
  const idx = NODE_ORDER.indexOf(fromNode);
  const toNode = NODE_ORDER[idx + 1];
  const progress = PROGRESS_BY_NODE[toNode];
  const status = toNode === "archive" ? "archived" : "processing";
  const now = nowFormatted();

  execute(
    "UPDATE work_orders SET current_node = ?, progress = ?, status = ?, updated_at = ? WHERE id = ?",
    [toNode, progress, status, now, orderId],
  );

  // 到达归档：同步将关联风险预警置为 resolved
  if (toNode === "archive" && row.risk_warning_id) {
    execute(
      "UPDATE risk_warnings SET status = 'resolved' WHERE id = ?",
      [row.risk_warning_id],
    );
  }

  const updated = queryOne<WorkOrderRow>(
    "SELECT id, risk_source, owner, current_node, progress, status, risk_warning_id, created_at, updated_at FROM work_orders WHERE id = ?",
    [orderId],
  );

  // 指标 +1
  incWorkorderAdvance();

  // 审计
  recordAudit({
    userId: actor?.userId ?? null,
    action: "advance",
    target: `/dispatch/work-orders/${orderId}/advance`,
    ip: actor?.ip ?? null,
    detail: {
      orderId,
      fromNode,
      toNode,
      progress,
      status,
      riskWarningId: row.risk_warning_id,
      result: result ?? null,
    },
  });

  // 事件
  eventBus.emit("workorder.advanced", {
    orderId,
    fromNode,
    toNode,
    progress,
    status,
    riskWarningId: row.risk_warning_id,
    result: result ?? null,
  });

  logger.info({ orderId, fromNode, toNode, progress }, "工单推进");

  return {
    ok: true,
    message: `已推进至 ${toNode}`,
    order: updated ? camelize<Record<string, unknown>>(updated) : undefined,
    fromNode,
    toNode,
  };
}

/**
 * 超时工单检查（模拟）：
 * - 查找 created_at 超过 24h 且未 archive 的工单
 * - 对每个超时工单 emit 告警事件（简单实现）
 * 供调度任务或运维接口按需调用
 */
export function markOverdue(): { count: number; overdueIds: string[] } {
  const rows = queryAll<{ id: string; risk_source: string | null; owner: string | null; created_at: string }>(
    `SELECT id, risk_source, owner, created_at FROM work_orders
     WHERE status != 'archived'
       AND created_at IS NOT NULL
       AND datetime(created_at) < datetime('now', '-24 hours')`,
  );
  for (const r of rows) {
    logger.warn(
      { orderId: r.id, owner: r.owner, riskSource: r.risk_source, createdAt: r.created_at },
      "工单超时未归档，触发告警",
    );
    eventBus.emit("workorder.advanced", {
      orderId: r.id,
      type: "overdue",
      owner: r.owner,
      riskSource: r.risk_source,
      createdAt: r.created_at,
    });
  }
  if (rows.length > 0) {
    logger.info({ count: rows.length }, "超时工单检查完成");
  }
  return { count: rows.length, overdueIds: rows.map((r) => r.id) };
}
