// 系统模块 - 审计日志查询
// 对应 audit_logs 表，支持 ?userId=&action=&startTime=&endTime=&page=&pageSize= 分页过滤
// 返回 {list, total, page, pageSize}，字段驼峰（user_id→userId 等）
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { queryAll, queryOne } from "../../db/index.js";
import { camelize } from "../../utils/case.js";
import { requirePermission } from "../platform/rbac.js";

/** 审计查询参数 */
interface AuditQuery {
  userId?: string;
  action?: string;
  startTime?: string;
  endTime?: string;
  page?: string;
  pageSize?: string;
}

/** 将日期字符串补全为 datetime 比较格式（仅日期补 00:00:00 / 23:59:59） */
function normalizeTimeBoundary(t: string, end: boolean): string {
  if (!t) return "";
  // 已包含时间部分（长度 > 10）
  if (t.length > 10) return t;
  return end ? `${t} 23:59:59` : `${t} 00:00:00`;
}

/** 转换审计日志行：驼峰化 + 解析 detail JSON */
function transformAuditRow(row: Record<string, unknown>): Record<string, unknown> {
  const c = camelize<Record<string, unknown>>(row);
  if (typeof c.detail === "string" && c.detail.length > 0) {
    try {
      c.detail = JSON.parse(c.detail);
    } catch {
      // 保留原字符串
    }
  }
  return c;
}

/** 注册审计日志查询路由 */
export const registerSystemAudit: FastifyPluginAsync = async (app, _opts) => {
  app.addHook("preHandler", app.authenticate);

  // GET /system/audit - 审计日志分页查询（含登录 IP、全量操作明细，仅授予 audit:read 的角色可读）
  app.get(
    "/system/audit",
    { preHandler: [requirePermission("audit:read")] },
    async (request: FastifyRequest, reply) => {
    const q = request.query as AuditQuery;
    const page = Math.max(1, parseInt(q.page || "1", 10) || 1);
    const pageSize = Math.max(1, Math.min(200, parseInt(q.pageSize || "20", 10) || 20));
    const offset = (page - 1) * pageSize;

    const where: string[] = [];
    const params: unknown[] = [];
    if (q.userId) {
      where.push("user_id = ?");
      params.push(q.userId);
    }
    if (q.action) {
      where.push("action = ?");
      params.push(q.action);
    }
    if (q.startTime) {
      where.push("created_at >= ?");
      params.push(normalizeTimeBoundary(q.startTime, false));
    }
    if (q.endTime) {
      where.push("created_at <= ?");
      params.push(normalizeTimeBoundary(q.endTime, true));
    }
    const whereClause = where.length ? "WHERE " + where.join(" AND ") : "";

    const rows = queryAll<Record<string, unknown>>(
      `SELECT * FROM audit_logs ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );
    const totalRow = queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total FROM audit_logs ${whereClause}`,
      params,
    );
    const total = totalRow?.total ?? 0;

    reply.send({
      list: rows.map(transformAuditRow),
      total,
      page,
      pageSize,
    });
  });
};
