// 智慧监督中心 - 监控规则 CRUD + 规则评估端点
// 字段：id, name, domain, dsl(JSON), priority, enabled, version
import type { FastifyInstance, FastifyPluginCallback, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { queryAll, queryOne, execute } from "../../db/index.js";
import { recordAudit } from "../platform/audit.js";
import { requirePermission } from "../platform/rbac.js";
import type { JwtUser } from "../platform/auth.js";
import { evaluateRule, type RuleFacts } from "./rule-engine.js";

/** 规则数据库行 */
interface RuleRow {
  id: string;
  name: string;
  domain: string | null;
  dsl_json: string;
  priority: number;
  enabled: number;
  version: number;
}

/** 将规则行映射为前端契约（驼峰 + dsl 还原为对象） */
function mapRule(row: RuleRow) {
  let dsl: unknown = null;
  try {
    dsl = JSON.parse(row.dsl_json);
  } catch {
    dsl = null;
  }
  return {
    id: row.id,
    name: row.name,
    domain: row.domain ?? "",
    dsl,
    priority: row.priority,
    enabled: row.enabled === 1,
    version: row.version,
  };
}

const createSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  domain: z.string().optional().default(""),
  dsl: z.record(z.unknown()),
  priority: z.number().int().optional().default(1),
  enabled: z.boolean().optional().default(true),
  version: z.number().int().optional().default(1),
});

const updateSchema = createSchema.partial();

/** 规则路由插件 */
export const registerRules: FastifyPluginCallback = (app: FastifyInstance, _opts, done) => {
  // GET /monitoring/rules：规则列表
  app.get(
    "/monitoring/rules",
    { preHandler: [app.authenticate] },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const rows = queryAll<RuleRow>(
        "SELECT id, name, domain, dsl_json, priority, enabled, version FROM rules ORDER BY priority DESC, id",
      );
      reply.send(rows.map(mapRule));
    },
  );

  // POST /monitoring/rules：新建规则
  app.post(
    "/monitoring/rules",
    { preHandler: [app.authenticate, requirePermission("rule:write")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = createSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: "bad_request", message: parsed.error.message, statusCode: 400 });
        return;
      }
      const b = parsed.data;
      execute(
        "INSERT INTO rules (id, name, domain, dsl_json, priority, enabled, version) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [b.id, b.name, b.domain, JSON.stringify(b.dsl), b.priority, b.enabled ? 1 : 0, b.version],
      );
      const user = (request.user as JwtUser | undefined) ?? undefined;
      recordAudit({
        userId: user?.id ?? null,
        action: "create",
        target: `/monitoring/rules/${b.id}`,
        ip: request.ip || null,
        detail: { ruleId: b.id, name: b.name },
      });
      reply.code(201).send({ id: b.id });
    },
  );

  // PUT /monitoring/rules/:id：更新规则
  app.put(
    "/monitoring/rules/:id",
    { preHandler: [app.authenticate, requirePermission("rule:write")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const parsed = updateSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: "bad_request", message: parsed.error.message, statusCode: 400 });
        return;
      }
      const existing = queryOne<{ id: string }>("SELECT id FROM rules WHERE id = ?", [id]);
      if (!existing) {
        reply.code(404).send({ error: "not_found", message: "规则不存在", statusCode: 404 });
        return;
      }
      const b = parsed.data;
      const sets: string[] = [];
      const params: unknown[] = [];
      if (b.name !== undefined) { sets.push("name = ?"); params.push(b.name); }
      if (b.domain !== undefined) { sets.push("domain = ?"); params.push(b.domain); }
      if (b.dsl !== undefined) { sets.push("dsl_json = ?"); params.push(JSON.stringify(b.dsl)); }
      if (b.priority !== undefined) { sets.push("priority = ?"); params.push(b.priority); }
      if (b.enabled !== undefined) { sets.push("enabled = ?"); params.push(b.enabled ? 1 : 0); }
      if (b.version !== undefined) { sets.push("version = ?"); params.push(b.version); }
      if (sets.length > 0) {
        params.push(id);
        execute(`UPDATE rules SET ${sets.join(", ")} WHERE id = ?`, params);
      }
      const user = (request.user as JwtUser | undefined) ?? undefined;
      recordAudit({
        userId: user?.id ?? null,
        action: "update",
        target: `/monitoring/rules/${id}`,
        ip: request.ip || null,
        detail: { ruleId: id, fields: Object.keys(b) },
      });
      reply.send({ id });
    },
  );

  // DELETE /monitoring/rules/:id：删除规则
  app.delete(
    "/monitoring/rules/:id",
    { preHandler: [app.authenticate, requirePermission("rule:write")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const r = execute("DELETE FROM rules WHERE id = ?", [id]);
      if (r.changes === 0) {
        reply.code(404).send({ error: "not_found", message: "规则不存在", statusCode: 404 });
        return;
      }
      const user = (request.user as JwtUser | undefined) ?? undefined;
      recordAudit({
        userId: user?.id ?? null,
        action: "delete",
        target: `/monitoring/rules/${id}`,
        ip: request.ip || null,
        detail: { ruleId: id },
      });
      reply.send({ id, deleted: true });
    },
  );

  // POST /monitoring/rules/:id/evaluate：传入 facts，调用规则推理
  app.post(
    "/monitoring/rules/:id/evaluate",
    { preHandler: [app.authenticate, requirePermission("rule:write")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = (request.body as { facts?: RuleFacts }) ?? {};
      const facts: RuleFacts = body.facts ?? (request.body as RuleFacts) ?? {};
      const result = await evaluateRule(id, facts);
      reply.send(result);
    },
  );

  done();
};
