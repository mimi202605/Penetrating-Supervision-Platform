// 数据采集中心 - 数据源管理（CRUD）
// 对应 data_sources 表，API 返回驼峰（DataSource 契约）
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { execute, queryAll, queryOne } from "../../db/index.js";
import { camelize } from "../../utils/case.js";
import { requireRole } from "../platform/rbac.js";
import { recordAudit } from "../platform/audit.js";

/** 数据源新建/更新请求体 */
interface DataSourceBody {
  id?: string;
  name: string;
  type?: string;
  status?: string;
  records?: string;
  updateFreq?: string;
  owner?: string;
}

/** 从请求中提取当前用户ID（authenticate 后必存在，做防御性处理） */
function userIdOf(request: FastifyRequest): string | null {
  return (request.user as { id?: string } | undefined)?.id ?? null;
}

/** 注册数据源管理路由 */
export const registerCollectionSources: FastifyPluginAsync = async (app, _opts) => {
  // 所有接口需登录
  app.addHook("preHandler", app.authenticate);

  // GET /collection/sources - 返回数据源全表，支持 ?status= 过滤
  app.get("/collection/sources", async (request: FastifyRequest, reply: FastifyReply) => {
    const { status } = request.query as { status?: string };
    const rows = status
      ? queryAll<Record<string, unknown>>(
          "SELECT * FROM data_sources WHERE status = ? ORDER BY id",
          [status],
        )
      : queryAll<Record<string, unknown>>("SELECT * FROM data_sources ORDER BY id");
    reply.send(rows.map((r) => camelize(r)));
  });

  // GET /collection/sources/:id - 单条
  app.get("/collection/sources/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const row = queryOne<Record<string, unknown>>(
      "SELECT * FROM data_sources WHERE id = ?",
      [id],
    );
    if (!row) {
      reply.code(404).send({ error: "not_found", message: "数据源不存在", statusCode: 404 });
      return;
    }
    reply.send(camelize(row));
  });

  // POST /collection/sources - 新建（需 admin）
  app.post(
    "/collection/sources",
    { preHandler: [requireRole("admin")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as DataSourceBody;
      if (!body || !body.name) {
        reply.code(400).send({ error: "bad_request", message: "name 必填", statusCode: 400 });
        return;
      }
      const id = body.id || `DS-${Date.now()}`;
      execute(
        "INSERT INTO data_sources (id, name, type, status, records, update_freq, owner) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
          id,
          body.name,
          body.type || "REST API",
          body.status || "online",
          body.records || "0 条",
          body.updateFreq || "实时",
          body.owner || null,
        ],
      );
      recordAudit({
        userId: userIdOf(request),
        action: "create",
        target: `/collection/sources/${id}`,
        ip: request.ip || null,
        detail: { id, name: body.name },
      });
      const row = queryOne<Record<string, unknown>>(
        "SELECT * FROM data_sources WHERE id = ?",
        [id],
      );
      reply.code(201).send(camelize(row));
    },
  );

  // PUT /collection/sources/:id - 更新（需 admin）
  app.put(
    "/collection/sources/:id",
    { preHandler: [requireRole("admin")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = request.body as Partial<DataSourceBody>;
      const existing = queryOne<Record<string, unknown>>(
        "SELECT * FROM data_sources WHERE id = ?",
        [id],
      );
      if (!existing) {
        reply.code(404).send({ error: "not_found", message: "数据源不存在", statusCode: 404 });
        return;
      }
      const merged = { ...camelize<DataSourceBody>(existing), ...body };
      execute(
        "UPDATE data_sources SET name = ?, type = ?, status = ?, records = ?, update_freq = ?, owner = ? WHERE id = ?",
        [
          merged.name,
          merged.type || null,
          merged.status || "online",
          merged.records || null,
          merged.updateFreq || null,
          merged.owner || null,
          id,
        ],
      );
      recordAudit({
        userId: userIdOf(request),
        action: "update",
        target: `/collection/sources/${id}`,
        ip: request.ip || null,
        detail: body,
      });
      const row = queryOne<Record<string, unknown>>(
        "SELECT * FROM data_sources WHERE id = ?",
        [id],
      );
      reply.send(camelize(row));
    },
  );

  // DELETE /collection/sources/:id - 删除（需 admin）
  app.delete(
    "/collection/sources/:id",
    { preHandler: [requireRole("admin")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const r = execute("DELETE FROM data_sources WHERE id = ?", [id]);
      if (r.changes === 0) {
        reply.code(404).send({ error: "not_found", message: "数据源不存在", statusCode: 404 });
        return;
      }
      recordAudit({
        userId: userIdOf(request),
        action: "delete",
        target: `/collection/sources/${id}`,
        ip: request.ip || null,
        detail: { id },
      });
      reply.send({ success: true });
    },
  );
};
