// 智慧监督中心 - 风险预警：列表筛选 / 详情 / 状态更新
// 数据库列 snake_case（raw_json 存 JSON 数组），返回统一驼峰 + raw 还原
import type { FastifyInstance, FastifyPluginCallback, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { queryAll, queryOne, execute } from "../../db/index.js";
import { recordAudit } from "../platform/audit.js";
import { requirePermission } from "../platform/rbac.js";
import type { JwtUser } from "../platform/auth.js";

/** 风险预警原始行（数据库列） */
interface RiskWarningRow {
  id: string;
  title: string;
  domain: string | null;
  level: string;
  subject: string | null;
  rule: string | null;
  triggered_at: string | null;
  status: string;
  clue: string | null;
  related_order_id: string | null;
  raw_json: string | null;
}

/** raw 字段明细项 */
interface RawItem {
  label: string;
  value: string;
}

/** 将数据库行映射为前端契约 RiskWarning（驼峰 + raw 还原） */
function mapRow(row: RiskWarningRow) {
  let raw: RawItem[] | undefined;
  if (row.raw_json) {
    try {
      const parsed = JSON.parse(row.raw_json);
      if (Array.isArray(parsed)) {
        raw = parsed as RawItem[];
      }
    } catch {
      raw = undefined;
    }
  }
  return {
    id: row.id,
    title: row.title,
    domain: row.domain ?? "",
    level: row.level,
    subject: row.subject ?? "",
    rule: row.rule ?? "",
    triggeredAt: row.triggered_at ?? "",
    status: row.status,
    clue: row.clue ?? undefined,
    relatedOrderId: row.related_order_id ?? undefined,
    raw,
  };
}

const statusUpdateSchema = z.object({
  status: z.enum(["pending", "processing", "resolved"]),
});

/** 风险预警路由插件 */
export const registerRiskWarnings: FastifyPluginCallback = (app: FastifyInstance, _opts, done) => {
  // GET /monitoring/risk-warnings：支持 ?level=&status=&domain=&keyword= 筛选（all 表示不过滤）
  app.get(
    "/monitoring/risk-warnings",
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const q = request.query as {
        level?: string;
        status?: string;
        domain?: string;
        keyword?: string;
      };
      const where: string[] = [];
      const params: unknown[] = [];
      if (q.level && q.level !== "all") {
        where.push("level = ?");
        params.push(q.level);
      }
      if (q.status && q.status !== "all") {
        where.push("status = ?");
        params.push(q.status);
      }
      if (q.domain && q.domain !== "all") {
        where.push("domain = ?");
        params.push(q.domain);
      }
      if (q.keyword && q.keyword !== "all") {
        where.push("(title LIKE ? OR subject LIKE ? OR clue LIKE ?)");
        const kw = `%${q.keyword}%`;
        params.push(kw, kw, kw);
      }
      const whereClause = where.length ? "WHERE " + where.join(" AND ") : "";
      const rows = queryAll<RiskWarningRow>(
        `SELECT id, title, domain, level, subject, rule, triggered_at, status, clue, related_order_id, raw_json
         FROM risk_warnings ${whereClause}
         ORDER BY triggered_at DESC`,
        params,
      );
      reply.send(rows.map(mapRow));
    },
  );

  // GET /monitoring/risk-warnings/:id：单条详情
  app.get(
    "/monitoring/risk-warnings/:id",
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const row = queryOne<RiskWarningRow>(
        `SELECT id, title, domain, level, subject, rule, triggered_at, status, clue, related_order_id, raw_json
         FROM risk_warnings WHERE id = ?`,
        [id],
      );
      if (!row) {
        reply.code(404).send({ error: "not_found", message: "风险预警不存在", statusCode: 404 });
        return;
      }
      reply.send(mapRow(row));
    },
  );

  // PUT /monitoring/risk-warnings/:id/status：更新状态（pending/processing/resolved），记审计
  app.put(
    "/monitoring/risk-warnings/:id/status",
    { preHandler: [app.authenticate, requirePermission("risk:write")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const parsed = statusUpdateSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: "bad_request", message: "status 必须为 pending/processing/resolved", statusCode: 400 });
        return;
      }
      const existing = queryOne<{ id: string }>("SELECT id FROM risk_warnings WHERE id = ?", [id]);
      if (!existing) {
        reply.code(404).send({ error: "not_found", message: "风险预警不存在", statusCode: 404 });
        return;
      }
      execute("UPDATE risk_warnings SET status = ? WHERE id = ?", [parsed.data.status, id]);
      const user = (request.user as JwtUser | undefined) ?? undefined;
      recordAudit({
        userId: user?.id ?? null,
        action: "update",
        target: `/monitoring/risk-warnings/${id}/status`,
        ip: request.ip || null,
        detail: { riskWarningId: id, status: parsed.data.status },
      });
      reply.send({ id, status: parsed.data.status });
    },
  );

  done();
};
