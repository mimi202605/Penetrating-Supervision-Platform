// 人工智能与数据脱敏 - 脱敏策略 CRUD + 启动加载到内存
// 字段：name, field_pattern, algorithm, replace_value, enabled, role_scope
import type { FastifyInstance, FastifyPluginCallback, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { queryAll, queryOne, execute } from "../../db/index.js";
import { camelize } from "../../utils/case.js";
import { recordAudit } from "../platform/audit.js";
import { requirePermission } from "../platform/rbac.js";
import type { JwtUser } from "../platform/auth.js";
import type { SanitizationRule, SanitizerAlgorithm } from "./sanitizer.js";
import { logger } from "../../utils/logger.js";

/** 策略数据库行（snake_case） */
interface PolicyRow {
  id: number;
  name: string;
  field_pattern: string;
  algorithm: string;
  replace_value: string | null;
  enabled: number;
  role_scope: string | null;
  created_at: string;
}

/** 将数据库行映射为前端契约（驼峰） */
function mapPolicy(row: PolicyRow) {
  return {
    id: row.id,
    name: row.name,
    fieldPattern: row.field_pattern,
    algorithm: row.algorithm,
    replaceValue: row.replace_value,
    enabled: row.enabled === 1,
    roleScope: row.role_scope ?? "*",
    createdAt: row.created_at,
  };
}

const createSchema = z.object({
  name: z.string().min(1),
  field_pattern: z.string().min(1),
  algorithm: z.enum(["mask", "hash", "replace", "range"]),
  replace_value: z.string().nullable().optional(),
  enabled: z.boolean().optional().default(true),
  role_scope: z.string().optional().default("*"),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  field_pattern: z.string().min(1).optional(),
  algorithm: z.enum(["mask", "hash", "replace", "range"]).optional(),
  replace_value: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
  role_scope: z.string().optional(),
});

// ===================== 内存策略缓存（供 sanitizeForAI 使用） =====================

let cachedRules: SanitizationRule[] | null = null;

/** 从数据库加载启用的策略到内存（供 sanitizeForAI 使用） */
export function loadEnabledPolicies(): SanitizationRule[] {
  const rows = queryAll<PolicyRow>(
    "SELECT id, name, field_pattern, algorithm, replace_value, enabled, role_scope, created_at FROM sanitizer_policies WHERE enabled = 1",
  );
  cachedRules = rows.map((r) => ({
    name: r.name,
    fieldPattern: r.field_pattern,
    algorithm: r.algorithm as SanitizerAlgorithm,
    replaceValue: r.replace_value,
    roleScope: r.role_scope ?? "*",
  }));
  logger.info({ count: cachedRules.length }, "已加载启用的脱敏策略到内存");
  return cachedRules;
}

/** 获取内存中的启用策略（懒加载） */
export function getEnabledPolicies(): SanitizationRule[] {
  if (!cachedRules) return loadEnabledPolicies();
  return cachedRules;
}

/** 刷新内存策略缓存（写操作后调用） */
export function refreshPolicies(): void {
  loadEnabledPolicies();
}

/** 策略路由插件 */
export const registerSanitizerPolicies: FastifyPluginCallback = (app: FastifyInstance, _opts, done) => {
  // GET /ai/sanitizer/policies：查询全部策略
  app.get(
    "/ai/sanitizer/policies",
    { preHandler: [app.authenticate] },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const rows = queryAll<PolicyRow>(
        "SELECT id, name, field_pattern, algorithm, replace_value, enabled, role_scope, created_at FROM sanitizer_policies ORDER BY id",
      );
      reply.send(rows.map(mapPolicy));
    },
  );

  // POST /ai/sanitizer/policies：新建策略
  app.post(
    "/ai/sanitizer/policies",
    { preHandler: [app.authenticate, requirePermission("sanitizer:write")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = createSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: "bad_request", message: parsed.error.message, statusCode: 400 });
        return;
      }
      const b = parsed.data;
      const r = execute(
        "INSERT INTO sanitizer_policies (name, field_pattern, algorithm, replace_value, enabled, role_scope) VALUES (?, ?, ?, ?, ?, ?)",
        [b.name, b.field_pattern, b.algorithm, b.replace_value ?? null, b.enabled ? 1 : 0, b.role_scope],
      );
      const id = Number(r.lastInsertRowid);
      refreshPolicies();
      const user = (request.user as JwtUser | undefined) ?? undefined;
      recordAudit({
        userId: user?.id ?? null,
        action: "create",
        target: `/ai/sanitizer/policies/${id}`,
        ip: request.ip || null,
        detail: { name: b.name, algorithm: b.algorithm },
      });
      // 返回新建策略详情
      const row = queryOne<PolicyRow>(
        "SELECT id, name, field_pattern, algorithm, replace_value, enabled, role_scope, created_at FROM sanitizer_policies WHERE id = ?",
        [id],
      );
      reply.code(201).send(row ? camelize(row) : { id });
    },
  );

  // PUT /ai/sanitizer/policies/:id：更新策略（含启停 enabled）
  app.put(
    "/ai/sanitizer/policies/:id",
    { preHandler: [app.authenticate, requirePermission("sanitizer:write")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const numId = Number(id);
      const parsed = updateSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: "bad_request", message: parsed.error.message, statusCode: 400 });
        return;
      }
      const existing = queryOne<{ id: number }>("SELECT id FROM sanitizer_policies WHERE id = ?", [numId]);
      if (!existing) {
        reply.code(404).send({ error: "not_found", message: "策略不存在", statusCode: 404 });
        return;
      }
      const b = parsed.data;
      const sets: string[] = [];
      const params: unknown[] = [];
      if (b.name !== undefined) { sets.push("name = ?"); params.push(b.name); }
      if (b.field_pattern !== undefined) { sets.push("field_pattern = ?"); params.push(b.field_pattern); }
      if (b.algorithm !== undefined) { sets.push("algorithm = ?"); params.push(b.algorithm); }
      if (b.replace_value !== undefined) { sets.push("replace_value = ?"); params.push(b.replace_value); }
      if (b.enabled !== undefined) { sets.push("enabled = ?"); params.push(b.enabled ? 1 : 0); }
      if (b.role_scope !== undefined) { sets.push("role_scope = ?"); params.push(b.role_scope); }
      if (sets.length > 0) {
        params.push(numId);
        execute(`UPDATE sanitizer_policies SET ${sets.join(", ")} WHERE id = ?`, params);
      }
      refreshPolicies();
      const user = (request.user as JwtUser | undefined) ?? undefined;
      recordAudit({
        userId: user?.id ?? null,
        action: "update",
        target: `/ai/sanitizer/policies/${numId}`,
        ip: request.ip || null,
        detail: { id: numId, fields: Object.keys(b) },
      });
      reply.send({ id: numId });
    },
  );

  // DELETE /ai/sanitizer/policies/:id：删除策略
  app.delete(
    "/ai/sanitizer/policies/:id",
    { preHandler: [app.authenticate, requirePermission("sanitizer:write")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const numId = Number(id);
      const r = execute("DELETE FROM sanitizer_policies WHERE id = ?", [numId]);
      if (r.changes === 0) {
        reply.code(404).send({ error: "not_found", message: "策略不存在", statusCode: 404 });
        return;
      }
      refreshPolicies();
      const user = (request.user as JwtUser | undefined) ?? undefined;
      recordAudit({
        userId: user?.id ?? null,
        action: "delete",
        target: `/ai/sanitizer/policies/${numId}`,
        ip: request.ip || null,
        detail: { id: numId },
      });
      reply.send({ id: numId, deleted: true });
    },
  );

  done();
};
