// 数据采集中心 - 数据源管理（CRUD + 连接器集成 + 凭据加密 + 健康检查 + schema 发现）
// 对应 data_sources + data_source_secrets + data_source_health 表
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { execute, queryAll, queryOne, transaction } from "../../db/index.js";
import { camelize } from "../../utils/case.js";
import { requireRole } from "../platform/rbac.js";
import { recordAudit } from "../platform/audit.js";
import { encryptSecret, decryptSecret, maskSecrets } from "./crypto.js";
import {
  registerAllConnectors,
  getConnector,
  listConnectors,
  listConnectorsByCategory,
} from "./connectors/index.js";
import type { ConnectorSpec, StreamCatalog, TestResult } from "./connectors/index.js";

// 应用启动时注册连接器
registerAllConnectors();

/** 数据源新建/更新请求体（V2 扩展） */
interface DataSourceBody {
  id?: string;
  name: string;
  type?: string;
  status?: string;
  records?: string;
  updateFreq?: string;
  owner?: string;
  // V2 新增
  connectorType?: string;
  endpoint?: string;
  authType?: string;
  sceneId?: string;
  config?: Record<string, unknown>; // 含敏感字段（password/token），凭据字段加密入 data_source_secrets
}

/** 从请求中提取当前用户ID */
function userIdOf(request: FastifyRequest): string | null {
  return (request.user as { id?: string } | undefined)?.id ?? null;
}

/** 取连接器 spec */
function specOf(type: string | undefined): ConnectorSpec | undefined {
  if (!type) return undefined;
  try {
    return getConnector(type).spec;
  } catch {
    return undefined;
  }
}

/** 从 DB 行驼峰化并解析 JSON 字段 */
function rowToApi(row: Record<string, unknown> | undefined, includeSecrets = false): Record<string, unknown> {
  if (!row) return {};
  const camel = camelize(row) as Record<string, unknown>;
  // 解析 JSON 字段
  for (const k of ["capabilities", "schemaCatalog", "configJson"]) {
    if (typeof camel[k] === "string" && camel[k]) {
      try {
        camel[k] = JSON.parse(camel[k] as string);
      } catch {
        // 保留原值
      }
    }
  }
  void includeSecrets;
  return camel;
}

/** 读取并解密数据源的完整 config（合并非敏感 config_json + 解密后的凭据） */
function loadFullConfig(
  row: Record<string, unknown>,
  _spec: ConnectorSpec | undefined,
): Record<string, unknown> {
  // 非敏感配置：从 config_json 解析
  let nonSecret: Record<string, unknown> = {};
  const configJson = row.config_json;
  if (typeof configJson === "string" && configJson) {
    try {
      nonSecret = JSON.parse(configJson) as Record<string, unknown>;
    } catch {
      nonSecret = {};
    }
  }
  // 兜底：若 config_json 为空，回退到 endpoint 字段
  if (!nonSecret.endpoint && row.endpoint) {
    nonSecret.endpoint = row.endpoint;
  }
  // 解密凭据
  const sourceId = String(row.id);
  let secret: Record<string, unknown> = {};
  const secretRow = queryOne<{ secret_blob: Uint8Array }>(
    "SELECT secret_blob FROM data_source_secrets WHERE source_id = ?",
    [sourceId],
  );
  if (secretRow) {
    try {
      secret = decryptSecret<Record<string, unknown>>(secretRow.secret_blob);
    } catch {
      secret = {};
    }
  }
  return { ...nonSecret, ...secret };
}

/** 从 config 中分离敏感与非敏感字段 */
function splitSecrets(
  config: Record<string, unknown>,
  secretFields: string[],
): { nonSecret: Record<string, unknown>; secret: Record<string, unknown> } {
  const nonSecret: Record<string, unknown> = {};
  const secret: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config)) {
    if (secretFields.includes(k)) secret[k] = v;
    else nonSecret[k] = v;
  }
  return { nonSecret, secret };
}

/** 注册数据源管理路由（V2） */
export const registerCollectionSources: FastifyPluginAsync = async (app, _opts) => {
  app.addHook("preHandler", app.authenticate);

  // ========== 连接器目录 ==========

  // GET /collection/connectors - 列出全部连接器 spec
  app.get("/collection/connectors", async (_req, reply) => {
    reply.send({
      total: listConnectors().length,
      byCategory: listConnectorsByCategory(),
      connectors: listConnectors(),
    });
  });

  // GET /collection/connectors/:type - 单个连接器详情
  app.get("/collection/connectors/:type", async (request, reply) => {
    const { type } = request.params as { type: string };
    try {
      reply.send(getConnector(type).spec);
    } catch {
      reply.code(404).send({ error: "not_found", message: "连接器不存在", statusCode: 404 });
    }
  });

  // ========== 数据源 CRUD ==========

  // GET /collection/sources - 全表，支持 ?status= 过滤
  app.get("/collection/sources", async (request, reply) => {
    const { status } = request.query as { status?: string };
    const rows = status
      ? queryAll<Record<string, unknown>>(
          "SELECT * FROM data_sources WHERE status = ? ORDER BY id",
          [status],
        )
      : queryAll<Record<string, unknown>>("SELECT * FROM data_sources ORDER BY id");
    reply.send(rows.map((r) => rowToApi(r)));
  });

  // GET /collection/sources/:id
  app.get("/collection/sources/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = queryOne<Record<string, unknown>>(
      "SELECT * FROM data_sources WHERE id = ?",
      [id],
    );
    if (!row) {
      reply.code(404).send({ error: "not_found", message: "数据源不存在", statusCode: 404 });
      return;
    }
    const api = rowToApi(row);
    const spec = specOf(api.connectorType as string);
    // 合并非敏感 config + 解密后的凭据，再统一脱敏
    const fullConfig = loadFullConfig(row, spec);
    api.config = maskSecrets(fullConfig, spec?.secretFields || []);
    reply.send(api);
  });

  // POST /collection/sources - 新建（需 admin）
  app.post(
    "/collection/sources",
    { preHandler: [requireRole("admin")] },
    async (request, reply) => {
      const body = request.body as DataSourceBody;
      if (!body || !body.name) {
        reply.code(400).send({ error: "bad_request", message: "name 必填", statusCode: 400 });
        return;
      }
      const spec = specOf(body.connectorType);
      const id = body.id || `DS-${Date.now()}`;
      const config = body.config || {};
      const { nonSecret, secret } = spec
        ? splitSecrets(config, spec.secretFields)
        : { nonSecret: config, secret: {} };

      transaction(() => {
        execute(
          `INSERT INTO data_sources
            (id, name, type, status, records, update_freq, owner,
             connector_type, endpoint, auth_type, capabilities, scene_id, config_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            body.name,
            body.type || body.connectorType || "REST API",
            body.status || "online",
            body.records || "0 条",
            body.updateFreq || "实时",
            body.owner || null,
            body.connectorType || null,
            body.endpoint || (nonSecret.endpoint as string) || null,
            body.authType || spec?.auth || null,
            spec ? JSON.stringify(spec.capabilities) : null,
            body.sceneId || null,
            Object.keys(nonSecret).length > 0 ? JSON.stringify(nonSecret) : null,
          ],
        );
        // 凭据加密入库
        if (Object.keys(secret).length > 0) {
          const blob = encryptSecret(secret);
          execute(
            `INSERT INTO data_source_secrets (source_id, secret_blob, secret_key_ref)
             VALUES (?, ?, ?)
             ON CONFLICT(source_id) DO UPDATE SET secret_blob = excluded.secret_blob, updated_at = datetime('now')`,
            [id, Buffer.from(blob), "SOURCE_SECRET_KEY"],
          );
        }
      });

      recordAudit({
        userId: userIdOf(request),
        action: "create",
        target: `/collection/sources/${id}`,
        ip: request.ip || null,
        detail: { id, name: body.name, connectorType: body.connectorType },
      });
      const row = queryOne<Record<string, unknown>>(
        "SELECT * FROM data_sources WHERE id = ?",
        [id],
      );
      reply.code(201).send(rowToApi(row));
    },
  );

  // PUT /collection/sources/:id - 更新
  app.put(
    "/collection/sources/:id",
    { preHandler: [requireRole("admin")] },
    async (request, reply) => {
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
      const merged = { ...camelize<DataSourceBody>(existing), ...body } as DataSourceBody;
      const spec = specOf(merged.connectorType);
      const config = body.config || {};
      const { nonSecret, secret } = spec
        ? splitSecrets(config, spec.secretFields)
        : { nonSecret: config, secret: {} };

      transaction(() => {
        execute(
          `UPDATE data_sources SET
            name = ?, type = ?, status = ?, records = ?, update_freq = ?, owner = ?,
            connector_type = ?, endpoint = ?, auth_type = ?, scene_id = ?, config_json = ?
           WHERE id = ?`,
          [
            merged.name,
            merged.type || merged.connectorType || null,
            merged.status || "online",
            merged.records || null,
            merged.updateFreq || null,
            merged.owner || null,
            merged.connectorType || null,
            merged.endpoint || (nonSecret.endpoint as string) || null,
            merged.authType || spec?.auth || null,
            merged.sceneId || null,
            Object.keys(nonSecret).length > 0 ? JSON.stringify(nonSecret) : null,
            id,
          ],
        );
        if (Object.keys(secret).length > 0) {
          const blob = encryptSecret(secret);
          execute(
            `INSERT INTO data_source_secrets (source_id, secret_blob, secret_key_ref)
             VALUES (?, ?, ?)
             ON CONFLICT(source_id) DO UPDATE SET secret_blob = excluded.secret_blob, updated_at = datetime('now')`,
            [id, Buffer.from(blob), "SOURCE_SECRET_KEY"],
          );
        }
      });

      recordAudit({
        userId: userIdOf(request),
        action: "update",
        target: `/collection/sources/${id}`,
        ip: request.ip || null,
        detail: { id, ...body },
      });
      const row = queryOne<Record<string, unknown>>(
        "SELECT * FROM data_sources WHERE id = ?",
        [id],
      );
      reply.send(rowToApi(row));
    },
  );

  // DELETE /collection/sources/:id - 删除（级联删凭据+健康历史）
  app.delete(
    "/collection/sources/:id",
    { preHandler: [requireRole("admin")] },
    async (request, reply) => {
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

  // ========== 测试连接 + 发现 schema + 健康检查 ==========

  // POST /collection/sources/test - 测试连接（不落库）
  app.post(
    "/collection/sources/test",
    { preHandler: [requireRole("admin", "group_admin")] },
    async (request, reply) => {
      const body = request.body as { connectorType: string; config: Record<string, unknown> };
      if (!body?.connectorType) {
        reply.code(400).send({ error: "bad_request", message: "connectorType 必填", statusCode: 400 });
        return;
      }
      try {
        const connector = getConnector(body.connectorType);
        const result: TestResult = await connector.test(body.config || {});
        reply.send(result);
      } catch (err) {
        reply.code(400).send({
          status: "offline",
          latencyMs: 0,
          error: (err as Error).message,
        });
      }
    },
  );

  // POST /collection/sources/:id/test - 测试已存数据源，结果写 health
  app.post(
    "/collection/sources/:id/test",
    { preHandler: [requireRole("admin", "group_admin")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const row = queryOne<Record<string, unknown>>(
        "SELECT * FROM data_sources WHERE id = ?",
        [id],
      );
      if (!row) {
        reply.code(404).send({ error: "not_found", message: "数据源不存在", statusCode: 404 });
        return;
      }
      const connectorType = row.connector_type as string;
      if (!connectorType) {
        reply.code(400).send({ error: "bad_request", message: "数据源未绑定 connectorType", statusCode: 400 });
        return;
      }
      const spec = specOf(connectorType);
      const config = loadFullConfig(row, spec);
      const t0 = Date.now();
      try {
        const connector = getConnector(connectorType);
        const result = await connector.test(config);
        const checkedAt = new Date().toISOString();
        const healthScore =
          result.status === "online" ? 100 : result.status === "degraded" ? 60 : 0;
        execute(
          "INSERT INTO data_source_health (source_id, checked_at, latency_ms, status, error) VALUES (?, ?, ?, ?, ?)",
          [id, checkedAt, result.latencyMs, result.status, result.error || null],
        );
        execute(
          "UPDATE data_sources SET health_score = ?, last_check_at = ? WHERE id = ?",
          [healthScore, checkedAt, id],
        );
        recordAudit({
          userId: userIdOf(request),
          action: "test",
          target: `/collection/sources/${id}/test`,
          ip: request.ip || null,
          detail: { id, status: result.status, latencyMs: result.latencyMs },
        });
        reply.send(result);
      } catch (err) {
        const checkedAt = new Date().toISOString();
        execute(
          "INSERT INTO data_source_health (source_id, checked_at, latency_ms, status, error) VALUES (?, ?, ?, ?, ?)",
          [id, checkedAt, Date.now() - t0, "offline", (err as Error).message],
        );
        execute(
          "UPDATE data_sources SET health_score = 0, last_check_at = ? WHERE id = ?",
          [checkedAt, id],
        );
        reply.send({ status: "offline", latencyMs: Date.now() - t0, error: (err as Error).message });
      }
    },
  );

  // POST /collection/sources/:id/discover - 发现 schema
  app.post(
    "/collection/sources/:id/discover",
    { preHandler: [requireRole("admin", "group_admin")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const row = queryOne<Record<string, unknown>>(
        "SELECT * FROM data_sources WHERE id = ?",
        [id],
      );
      if (!row) {
        reply.code(404).send({ error: "not_found", message: "数据源不存在", statusCode: 404 });
        return;
      }
      const connectorType = row.connector_type as string;
      if (!connectorType) {
        reply.code(400).send({ error: "bad_request", message: "数据源未绑定 connectorType", statusCode: 400 });
        return;
      }
      const spec = specOf(connectorType);
      const config = loadFullConfig(row, spec);
      try {
        const connector = getConnector(connectorType);
        const catalog: StreamCatalog = await connector.discover(config);
        execute(
          "UPDATE data_sources SET schema_catalog = ? WHERE id = ?",
          [JSON.stringify(catalog), id],
        );
        recordAudit({
          userId: userIdOf(request),
          action: "discover",
          target: `/collection/sources/${id}/discover`,
          ip: request.ip || null,
          detail: { id, streamCount: catalog.streams.length },
        });
        reply.send(catalog);
      } catch (err) {
        reply.code(400).send({ error: "discover_failed", message: (err as Error).message, statusCode: 400 });
      }
    },
  );

  // GET /collection/sources/:id/health-history - 健康度历史
  app.get("/collection/sources/:id/health-history", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { hours } = request.query as { hours?: string };
    const h = Number(hours) || 24;
    const rows = queryAll<Record<string, unknown>>(
      `SELECT * FROM data_source_health
       WHERE source_id = ? AND checked_at >= datetime('now', ?)
       ORDER BY checked_at DESC LIMIT 1000`,
      [id, `-${h} hours`],
    );
    reply.send(rows.map((r) => camelize(r)));
  });

  // POST /collection/sources/:id/health-check - 手动触发健康检查（同 test）
  app.post(
    "/collection/sources/:id/health-check",
    { preHandler: [requireRole("admin", "group_admin")] },
    async (request, reply) => {
      // 复用 test 逻辑：内部重定向
      const { id } = request.params as { id: string };
      const row = queryOne<Record<string, unknown>>(
        "SELECT * FROM data_sources WHERE id = ?",
        [id],
      );
      if (!row) {
        reply.code(404).send({ error: "not_found", message: "数据源不存在", statusCode: 404 });
        return;
      }
      const connectorType = row.connector_type as string;
      if (!connectorType) {
        reply.code(400).send({ error: "bad_request", message: "数据源未绑定 connectorType", statusCode: 400 });
        return;
      }
      const spec = specOf(connectorType);
      const config = loadFullConfig(row, spec);
      const t0 = Date.now();
      try {
        const connector = getConnector(connectorType);
        const result = await connector.test(config);
        const checkedAt = new Date().toISOString();
        const healthScore =
          result.status === "online" ? 100 : result.status === "degraded" ? 60 : 0;
        execute(
          "INSERT INTO data_source_health (source_id, checked_at, latency_ms, status, error) VALUES (?, ?, ?, ?, ?)",
          [id, checkedAt, result.latencyMs, result.status, result.error || null],
        );
        execute(
          "UPDATE data_sources SET health_score = ?, last_check_at = ? WHERE id = ?",
          [healthScore, checkedAt, id],
        );
        reply.send(result);
      } catch (err) {
        reply.send({ status: "offline", latencyMs: Date.now() - t0, error: (err as Error).message });
      }
    },
  );
};
