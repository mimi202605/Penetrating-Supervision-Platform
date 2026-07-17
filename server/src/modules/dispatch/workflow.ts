// 调度指挥中心 - 工单状态机（Flowable 等价）
// V2 七态：detect → dispatch → receive → dispose → approve → close → archive
// V1 向后兼容：verify → rectify → review → archive 通过 NODE_ALIASES 映射到 V2 等价节点
// advanceWorkOrder 校验当前节点并推进，更新 progress / current_node / status / updated_at
// 到达 archive 时同步将关联风险预警置为 resolved + 关联 risk_clues 置为 closed，
// 并记审计 + emit 'workorder.advanced' / 'risk.clue.closed'
import { execute, queryAll, queryOne, transaction } from "../../db/index.js";
import { camelize } from "../../utils/case.js";
import { recordAudit } from "../platform/audit.js";
import { eventBus } from "../platform/eventbus.js";
import { incWorkorderAdvance } from "../../health.js";
import { logger } from "../../utils/logger.js";

/** V2 七态节点顺序 */
export const NODE_ORDER = ["detect", "dispatch", "receive", "dispose", "approve", "close", "archive"] as const;
export type WorkOrderNode = (typeof NODE_ORDER)[number];

/** V1 节点 → V2 节点别名映射（向后兼容） */
export const NODE_ALIASES: Record<string, WorkOrderNode> = {
  // V1 原生
  verify: "receive",
  rectify: "dispose",
  review: "approve",
  // V2 原生（自映射）
  detect: "detect",
  dispatch: "dispatch",
  receive: "receive",
  dispose: "dispose",
  approve: "approve",
  close: "close",
  archive: "archive",
};

/** 各节点对应进度（0-100） */
export const PROGRESS_BY_NODE: Record<WorkOrderNode, number> = {
  detect: 5,
  dispatch: 15,
  receive: 30,
  dispose: 50,
  approve: 75,
  close: 90,
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

/** 校验是否合法节点（含 V1 别名） */
function isNode(n: string): n is WorkOrderNode {
  return n in NODE_ALIASES;
}

/** 将任意节点名归一为 V2 标准节点名 */
function normalizeNode(n: string): WorkOrderNode {
  return NODE_ALIASES[n] ?? "archive";
}

/**
 * 推进工单至下一节点
 * - 校验当前节点是否合法（含 V1 别名 verify/rectify/review）、是否已 archive
 * - V1 别名先归一为 V2 节点（verify→receive, rectify→dispose, review→approve）
 * - 更新 current_node / progress / status / updated_at
 * - 到达 archive 时：① 关联 risk_warning_id 的 risk_warnings 置 resolved ② 关联 risk_clues 置 closed
 * - 记审计 + 指标 +1 + emit 'workorder.advanced'（archive 时另 emit 'risk.clue.closed'）
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
  const currentNormalized = normalizeNode(row.current_node);
  if (currentNormalized === "archive") {
    return { ok: false, message: "工单已归档，无法继续推进" };
  }

  const fromNode = currentNormalized;
  const idx = NODE_ORDER.indexOf(fromNode);
  const toNode = NODE_ORDER[idx + 1];
  const progress = PROGRESS_BY_NODE[toNode];
  const status = toNode === "archive" ? "archived" : "processing";
  const now = nowFormatted();

  // 事务包裹 work_orders 推进 + risk_warnings/risk_clues 联动，避免一半提交一半失败导致
  // 工单已 archive 但风险预警/线索永远停在 processing 的不可恢复不一致
  transaction(() => {
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

    // 到达归档：同步将关联风险线索置为 closed
    if (toNode === "archive") {
      execute(
        "UPDATE risk_clues SET status = 'closed' WHERE work_order_id = ? AND status != 'closed'",
        [orderId],
      );
    }
  });

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

  // 归档时触发风险线索关闭事件（规则反哺）
  if (toNode === "archive") {
    const clue = queryOne<{ id: string }>(
      "SELECT id FROM risk_clues WHERE work_order_id = ?",
      [orderId],
    );
    if (clue) {
      eventBus.emit("risk.clue.closed", { clueId: clue.id, orderId });
    }
  }

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
 *
 * 注意：created_at 由 nowFormatted() 写入，使用本机时区(Asia/Shanghai)的本地时间字符串；
 * 而 datetime('now') 返回 UTC。直接比较会偏 8 小时，导致 16h 工单被误判超时、23h 工单漏报。
 * 这里将 created_at 当作本地时间，与本地时间 new Date() 比较，避免时区错配。
 */
export function markOverdue(): { count: number; overdueIds: string[] } {
  const rows = queryAll<{ id: string; risk_source: string | null; owner: string | null; created_at: string }>(
    `SELECT id, risk_source, owner, created_at FROM work_orders
     WHERE status != 'archived'
       AND created_at IS NOT NULL`,
  );
  const now = Date.now();
  const OVERDUE_MS = 24 * 60 * 60 * 1000;
  const overdueIds: string[] = [];
  for (const r of rows) {
    // created_at 形如 "YYYY-MM-DD HH:mm"，按本地时间解析
    const created = new Date(r.created_at.replace(" ", "T"));
    if (Number.isNaN(created.getTime()) || now - created.getTime() < OVERDUE_MS) continue;
    overdueIds.push(r.id);
    logger.warn(
      { orderId: r.id, owner: r.owner, riskSource: r.risk_source, createdAt: r.created_at },
      "工单超时未归档，触发告警",
    );
    // 使用独立事件名 'workorder.overdue'，避免与 'workorder.advanced' 契约（fromNode/toNode/progress/status）冲突
    eventBus.emit("workorder.overdue", {
      orderId: r.id,
      owner: r.owner,
      riskSource: r.risk_source,
      createdAt: r.created_at,
    });
  }
  if (overdueIds.length > 0) {
    logger.info({ count: overdueIds.length }, "超时工单检查完成");
  }
  return { count: overdueIds.length, overdueIds };
}
