// 审计日志：所有查询/处置/登录操作落 audit_logs 表（Ranger 等价）
import type { FastifyReply, FastifyRequest } from "fastify";
import { execute, queryOne } from "../../db/index.js";
import { camelize } from "../../utils/case.js";

export interface AuditPayload {
  userId: string | null;
  action: string; // login/logout/create/update/delete/query
  target: string; // 操作目标（路由路径或资源标识）
  ip: string | null;
  detail: unknown; // 详情（会被 JSON 序列化）
}

/** 手动记录审计日志（可在路由内显式调用） */
export function recordAudit(p: AuditPayload): void {
  execute(
    "INSERT INTO audit_logs (user_id, action, target, ip, detail) VALUES (?, ?, ?, ?, ?)",
    [
      p.userId,
      p.action,
      p.target,
      p.ip,
      typeof p.detail === "string" ? p.detail : JSON.stringify(p.detail ?? {}),
    ],
  );
}

/**
 * 审计中间件：对处置类请求（POST/PUT/DELETE/PATCH）在响应后自动记录
 * 仅记录写操作以避免审计洪泛；查询类审计由具体路由按需调用 recordAudit
 */
export function auditMiddleware(): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const method = request.method.toUpperCase();
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return;
    // 鉴权接口（登录/登出）在 auth 路由内单独记录，此处跳过避免重复
    if (request.url.includes("/auth/")) return;
    const user = (request.user as { id?: string } | undefined) ?? undefined;
    const ip = request.ip || null;
    recordAudit({
      userId: user?.id ?? null,
      action: method.toLowerCase(),
      target: request.url.split("?")[0],
      ip,
      detail: { method, path: request.url.split("?")[0] },
    });
  };
}

/** 查询审计日志详情（驼峰化） */
export function getAuditLog(id: number): unknown | undefined {
  const row = queryOne<Record<string, unknown>>("SELECT * FROM audit_logs WHERE id = ?", [id]);
  return row ? camelize(row) : undefined;
}
