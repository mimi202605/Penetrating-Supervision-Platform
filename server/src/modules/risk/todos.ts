// 待办模块：基于 risk_clues 派生的待办视图
// 待办 = status IN ('pending','dispatched') AND (assigned_to=userId OR 用户岗位对 model_id 有 grant)
// claim：未派单线索（assigned_to IS NULL）由用户认领 → assigned_to=userId
// complete：标记线索 disposed（不直接 close，close 走 closeClue）
import { execute, queryAll, queryOne, transaction } from "../../db/index.js";
import { camelize } from "../../utils/case.js";
import { logger } from "../../utils/logger.js";
import { recordDisposal } from "./disposals.js";

/** 待办查询入参 */
export interface TodoQuery {
  userId: string;
  role: string;
  orgId?: string | null;
  status?: string; // 默认 pending,dispatched
}

/** 待办项（基于 risk_clues） */
export interface TodoItem {
  id: string;
  clueId: string;
  sceneId: string;
  modelId: string;
  riskLevel: string;
  description: string | null;
  status: string;
  assignedTo: string | null;
  detectedAt: string;
  dueAt: string | null;
  workOrderId: string | null;
  orgCode: string | null;
}

/** row → API 驼峰化 */
function clueRowToTodo(row: Record<string, unknown>): TodoItem {
  const c = camelize(row) as Record<string, unknown>;
  return {
    id: c.id as string,
    clueId: c.id as string,
    sceneId: c.sceneId as string,
    modelId: c.modelId as string,
    riskLevel: c.riskLevel as string,
    description: (c.description as string) ?? null,
    status: c.status as string,
    assignedTo: (c.assignedTo as string) ?? null,
    detectedAt: c.detectedAt as string,
    dueAt: (c.dueAt as string) ?? null,
    workOrderId: (c.workOrderId as string) ?? null,
    orgCode: (c.orgCode as string) ?? null,
  };
}

/**
 * 查询当前用户待办
 * - admin/leader：全部 pending/dispatched
 * - 其他角色：assigned_to=userId OR assigned_to IS NULL（待认领）OR 用户岗位有 model grant
 */
export function myTodos(query: TodoQuery): TodoItem[] {
  const statusFilter = query.status ?? "pending,dispatched";
  const statuses = statusFilter.split(",").map((s) => s.trim()).filter(Boolean);
  if (statuses.length === 0) return [];

  const placeholders = statuses.map(() => "?").join(",");
  const params: unknown[] = [...statuses];

  let whereExtra = "";
  if (query.role === "admin" || query.role === "leader") {
    // 全部
  } else {
    // 查找用户有 grant 的 model_id 集合
    const grants = queryAll<{ model_id: string }>(
      `SELECT DISTINCT model_id FROM position_model_grant pmg
       JOIN regulatory_positions rp ON rp.code = pmg.position_code
       WHERE rp.code LIKE ? OR pmg.permission IN ('view','dispose','approve')`,
      [`%-${query.userId}-%`],
    );
    const modelIds = grants.map((g) => g.model_id);
    const clauses = ["assigned_to = ?", "assigned_to IS NULL"];
    params.push(query.userId);
    if (modelIds.length > 0) {
      const mPh = modelIds.map(() => "?").join(",");
      clauses.push(`model_id IN (${mPh})`);
      params.push(...modelIds);
    }
    whereExtra = " AND (" + clauses.join(" OR ") + ")";
  }

  const rows = queryAll<Record<string, unknown>>(
    `SELECT * FROM risk_clues WHERE status IN (${placeholders}) ${whereExtra} ORDER BY detected_at DESC, id DESC LIMIT 200`,
    params,
  );
  return rows.map((r) => clueRowToTodo(r));
}

/** 认领待办：assigned_to IS NULL → assigned_to=userId */
export function claimTodo(todoId: string, userId: string): { ok: boolean; message: string; todo?: TodoItem } {
  const row = queryOne<{ id: string; status: string; assigned_to: string | null }>(
    "SELECT id, status, assigned_to FROM risk_clues WHERE id = ?",
    [todoId],
  );
  if (!row) return { ok: false, message: `线索不存在: ${todoId}` };
  if (row.status === "closed") return { ok: false, message: "线索已关闭" };
  if (row.assigned_to && row.assigned_to !== userId) {
    return { ok: false, message: `已被 ${row.assigned_to} 认领` };
  }
  transaction(() => {
    execute(
      "UPDATE risk_clues SET assigned_to = ? WHERE id = ?",
      [userId, todoId],
    );
  });
  // 认领即记一条 receive 处置流水
  recordDisposal({
    clueId: todoId,
    step: "receive",
    handler: userId,
    comment: "认领待办",
  });
  const updated = queryOne<Record<string, unknown>>(
    "SELECT * FROM risk_clues WHERE id = ?",
    [todoId],
  );
  logger.info({ clueId: todoId, userId }, "待办已认领");
  return { ok: true, message: "认领成功", todo: updated ? clueRowToTodo(updated) : undefined };
}

/** 完成待办：写处置流水 + clue.status → disposed（不直接 close） */
export function completeTodo(
  todoId: string,
  userId: string,
  result: { comment?: string; attachment?: string; roleCode?: string } = {},
): { ok: boolean; message: string; todo?: TodoItem } {
  const row = queryOne<{ id: string; status: string; assigned_to: string | null }>(
    "SELECT id, status, assigned_to FROM risk_clues WHERE id = ?",
    [todoId],
  );
  if (!row) return { ok: false, message: `线索不存在: ${todoId}` };
  if (row.status === "closed") return { ok: false, message: "线索已关闭" };

  transaction(() => {
    execute(
      "UPDATE risk_clues SET status = 'disposed' WHERE id = ?",
      [todoId],
    );
  });
  recordDisposal({
    clueId: todoId,
    step: "dispose",
    handler: userId,
    roleCode: result.roleCode,
    comment: result.comment || "处置完成",
    attachment: result.attachment,
  });
  const updated = queryOne<Record<string, unknown>>(
    "SELECT * FROM risk_clues WHERE id = ?",
    [todoId],
  );
  logger.info({ clueId: todoId, userId }, "待办处置完成");
  return { ok: true, message: "处置完成", todo: updated ? clueRowToTodo(updated) : undefined };
}

void logger;
