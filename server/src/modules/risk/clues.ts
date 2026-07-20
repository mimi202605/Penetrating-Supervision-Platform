// 风险线索模块：CRUD + 派单 + 关闭（T+5 销警）
// 对应 risk_clues 表，集中式线索池
// 状态机：pending → dispatched → disposed → closed（含 confirmed/transferred 旁路）
import { execute, queryAll, queryOne, transaction } from "../../db/index.js";
import { camelize } from "../../utils/case.js";
import { eventBus } from "../platform/eventbus.js";
import { logger } from "../../utils/logger.js";
import { PROGRESS_BY_NODE, advanceWorkOrder } from "../dispatch/workflow.js";
import { incRiskCluesPending, decRiskCluesPending } from "../../health.js";

/** 线索状态 */
export type ClueStatus =
  | "pending"
  | "confirmed"
  | "dispatched"
  | "disposed"
  | "closed"
  | "transferred";

/** 风险等级 */
export type RiskLevel = "yellow" | "orange" | "red";

/** 线索请求体（监听器内部创建用） */
export interface ClueCreateInput {
  id?: string;
  sceneId: string;
  modelId: string;
  entityType?: string;
  entityId?: string;
  riskLevel: RiskLevel;
  riskValue?: string;
  description?: string;
  orgCode?: string;
  evidenceJson?: unknown;
  detectedAt?: string;
}

/** 线索列表过滤条件 */
export interface ClueListFilter {
  status?: string;
  riskLevel?: string;
  sceneId?: string;
  orgCode?: string;
  assignedTo?: string;
  limit?: number;
}

/** row → API 驼峰化 + JSON 字段解析 */
function clueRowToApi(row: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!row) return {};
  const camel = camelize(row) as Record<string, unknown>;
  if (typeof camel.evidenceJson === "string" && camel.evidenceJson) {
    try {
      camel.evidenceJson = JSON.parse(camel.evidenceJson as string);
    } catch {
      // 保留原值
    }
  }
  return camel;
}

/** 当前时间字符串（YYYY-MM-DD HH:mm） */
function nowFormatted(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 生成线索 ID：CLUE + YYYYMMDDHHmmss + 6 位随机 */
function generateClueId(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const rand = Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");
  return `CLUE${stamp}${rand}`;
}

/**
 * 计算 T+5 工作日（跳过周末）
 * @param from 起始日期
 * @param days 工作日数（默认 5）
 * @returns 目标日期字符串 YYYY-MM-DD HH:mm
 */
export function computeDueAt(from: Date = new Date(), days: number = 5): string {
  const d = new Date(from.getTime());
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay(); // 0=Sun, 6=Sat
    if (dow !== 0 && dow !== 6) {
      added++;
    }
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 列出线索（按多维过滤） */
export function listClues(filter: ClueListFilter = {}): Array<Record<string, unknown>> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.status) {
    where.push("status = ?");
    params.push(filter.status);
  }
  if (filter.riskLevel) {
    where.push("risk_level = ?");
    params.push(filter.riskLevel);
  }
  if (filter.sceneId) {
    where.push("scene_id = ?");
    params.push(filter.sceneId);
  }
  if (filter.orgCode) {
    where.push("org_code = ?");
    params.push(filter.orgCode);
  }
  if (filter.assignedTo) {
    where.push("assigned_to = ?");
    params.push(filter.assignedTo);
  }
  const whereClause = where.length ? "WHERE " + where.join(" AND ") : "";
  const limit = Math.min(filter.limit ?? 200, 500);
  const rows = queryAll<Record<string, unknown>>(
    `SELECT * FROM risk_clues ${whereClause} ORDER BY detected_at DESC, id DESC LIMIT ?`,
    [...params, limit],
  );
  return rows.map((r) => clueRowToApi(r));
}

/** 取单个线索（含 evidence） */
export function getClue(id: string): Record<string, unknown> | null {
  const row = queryOne<Record<string, unknown>>(
    "SELECT * FROM risk_clues WHERE id = ?",
    [id],
  );
  return row ? clueRowToApi(row) : null;
}

/** 创建线索（监听器调用） */
export function createClue(input: ClueCreateInput): Record<string, unknown> {
  const id = input.id || generateClueId();
  const detectedAt = input.detectedAt || nowFormatted();
  const dueAt = computeDueAt(new Date(), 5);
  transaction(() => {
    execute(
      `INSERT INTO risk_clues
        (id, scene_id, model_id, entity_type, entity_id, risk_level, risk_value,
         description, status, detected_at, due_at, assigned_to, org_code, evidence_json, work_order_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, NULL, ?, ?, NULL)`,
      [
        id,
        input.sceneId,
        input.modelId,
        input.entityType || null,
        input.entityId || null,
        input.riskLevel,
        input.riskValue || null,
        input.description || null,
        detectedAt,
        dueAt,
        input.orgCode || null,
        input.evidenceJson ? JSON.stringify(input.evidenceJson) : null,
      ],
    );
  });
  const clue = getClue(id) as Record<string, unknown>;
  logger.info({ clueId: id, sceneId: input.sceneId, modelId: input.modelId, riskLevel: input.riskLevel }, "风险线索已入库");
  // 递增 Prometheus 指标 risk_clues_pending_total
  incRiskCluesPending();
  // emit 线索创建事件（供 dispatch 监听器自动派单）
  eventBus.emit("risk.clue.created", {
    clueId: id,
    sceneId: input.sceneId,
    modelId: input.modelId,
    riskLevel: input.riskLevel,
    orgCode: input.orgCode ?? null,
    dueAt,
  });
  return clue;
}

/**
 * 派单：创建 dispatch 工单并回写 work_order_id
 * - 工单初始节点为 dispatch（七态状态机）
 * - clue.status → dispatched
 * @returns { clueId, orderId, owner }
 */
export function dispatchClue(
  clueId: string,
  owner: string | null = null,
  actor: { userId: string | null; ip: string | null } | null = null,
): { clueId: string; orderId: string; owner: string | null } {
  const clue = queryOne<{ id: string; scene_id: string; model_id: string; risk_level: string; description: string | null; org_code: string | null; status: string }>(
    "SELECT id, scene_id, model_id, risk_level, description, org_code, status FROM risk_clues WHERE id = ?",
    [clueId],
  );
  if (!clue) throw new Error(`线索不存在: ${clueId}`);
  if (clue.status === "closed") throw new Error(`线索已关闭，无法派单: ${clueId}`);

  // 路由 owner：传入则用，否则按 scene/model 推断（这里以 model_id 末段作 fallback）
  const resolvedOwner = owner || `dispatcher-${clue.scene_id}`;

  const orderId = generateOrderId();
  const now = nowFormatted();
  transaction(() => {
    execute(
      `INSERT INTO work_orders (id, risk_source, owner, current_node, progress, status, risk_warning_id, created_at, updated_at)
       VALUES (?, ?, ?, 'dispatch', ?, 'processing', NULL, ?, ?)`,
      [orderId, clue.description || `线索 ${clueId}`, resolvedOwner, PROGRESS_BY_NODE.dispatch, now, now],
    );
    execute(
      "UPDATE risk_clues SET status = 'dispatched', assigned_to = ?, work_order_id = ? WHERE id = ?",
      [resolvedOwner, orderId, clueId],
    );
  });
  logger.info({ clueId, orderId, owner: resolvedOwner }, "线索已派单");
  // 审计通过 recordAudit 由调用方处理（routes 层）；此处仅发事件
  eventBus.emit("risk.clue.dispatched", { clueId, orderId, owner: resolvedOwner });
  return { clueId, orderId, owner: resolvedOwner };
}

/**
 * 关闭线索（销警）
 * - clue.status → closed
 * - 工单 archive
 */
export function closeClue(
  clueId: string,
  actor: { userId: string | null; ip: string | null } | null = null,
): { clueId: string; orderId: string | null } {
  const clue = queryOne<{ id: string; work_order_id: string | null; status: string }>(
    "SELECT id, work_order_id, status FROM risk_clues WHERE id = ?",
    [clueId],
  );
  if (!clue) throw new Error(`线索不存在: ${clueId}`);
  if (clue.status === "closed") throw new Error(`线索已关闭: ${clueId}`);

  transaction(() => {
    execute(
      "UPDATE risk_clues SET status = 'closed' WHERE id = ?",
      [clueId],
    );
  });
  // 工单推进走状态机 advanceWorkOrder，确保 risk_warnings 联动置 resolved、
  // workorder.advanced 事件 emit、审计落库；避免直接 UPDATE archive 绕过状态机
  if (clue.work_order_id) {
    // 循环推进到 archive（advanceWorkOrder 每次推进一步）
    // 安全上限 10 次防止异常节点陷入死循环
    let safety = 10;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    let result: { ok: boolean; message: string; toNode?: string };
    do {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      result = advanceWorkOrder(clue.work_order_id, "线索关闭，自动归档", actor ?? undefined);
      safety -= 1;
    } while (result.ok && result.toNode !== "archive" && safety > 0);
  }
  // 触发规则反哺事件
  eventBus.emit("risk.clue.closed", { clueId, orderId: clue.work_order_id });
  // 递减 Prometheus 指标 risk_clues_pending_total
  decRiskCluesPending();
  logger.info({ clueId, orderId: clue.work_order_id }, "线索已关闭（销警）");
  return { clueId, orderId: clue.work_order_id };
}

/** 生成工单 ID：WO + YYYYMMDDHHmmss + 6 位随机 */
function generateOrderId(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const rand = Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");
  return `WO${stamp}${rand}`;
}

/** 按状态统计（供 dashboard / 健康指标） */
export function countByStatus(): Record<string, number> {
  const rows = queryAll<{ status: string; cnt: number }>(
    "SELECT status, COUNT(*) AS cnt FROM risk_clues GROUP BY status",
  );
  const out: Record<string, number> = {};
  for (const r of rows) {
    out[r.status] = r.cnt;
  }
  return out;
}

/** 待办数（pending + dispatched，按 assigned_to 过滤） */
export function countTodos(userId: string): number {
  const r = queryOne<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM risk_clues WHERE status IN ('pending','dispatched') AND (assigned_to = ? OR assigned_to IS NULL)`,
    [userId],
  );
  return r?.cnt ?? 0;
}

void logger; // 预留日志
