// 数据采集中心 - 采集任务 CRUD + 采集任务执行器
// 对应 collection_tasks 表，API 返回驼峰（CollectionTask 契约）
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { execute, queryAll, queryOne, transaction } from "../../db/index.js";
import { camelize } from "../../utils/case.js";
import { requireRole } from "../platform/rbac.js";
import { recordAudit } from "../platform/audit.js";
import { eventBus } from "../platform/eventbus.js";
import { incCollectionRun, incCollectionFailure } from "../../health.js";
import { logger } from "../../utils/logger.js";
import { runQualityCheck, listQualityIssues } from "./quality.js";
import { runTask, runTaskSync } from "./runtime.js";

/** 采集任务新建/更新请求体 */
interface CollectionTaskBody {
  id?: string;
  name: string;
  source?: string;
  mode?: string;
  schedule?: string;
  sourceId?: string;
  sinkType?: string;
  sinkTarget?: string;
  writeMode?: string;
  transformPipeline?: unknown;
  concurrency?: number;
  retryMax?: number;
  retryIntervalSec?: number;
  timeoutSec?: number;
  priority?: number;
  dependsOn?: string[];
  enabled?: number;
  sceneId?: string;
  modelId?: string;
}

/** 格式化当前时间为 "YYYY-MM-DD HH:mm"（与种子 last_run 格式一致） */
function nowFormatted(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 从请求中提取当前用户ID */
function userIdOf(request: FastifyRequest): string | null {
  return (request.user as { id?: string } | undefined)?.id ?? null;
}

/** 安全 JSON 解析（失败返回原字符串） */
function safeJsonParse(s: string | null): unknown {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

/** 把 row 驼峰化并解析任务级 JSON 字段（transformPipeline/dependsOn） */
function taskRowToApi(row: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!row) return {};
  const camel = camelize(row) as Record<string, unknown>;
  for (const k of ["transformPipeline", "dependsOn", "checkpointState", "fieldMapping"]) {
    if (typeof camel[k] === "string" && camel[k]) {
      try {
        camel[k] = JSON.parse(camel[k] as string);
      } catch {
        // 保留原值
      }
    }
  }
  return camel;
}

/** 根据采集模式生成随机吞吐量（条/s）与本次采集记录数 */
function generateThroughput(mode: string): { throughput: string; records: number } {
  let base: number;
  switch (mode) {
    case "全量":
      base = 5000 + Math.floor(Math.random() * 10000); // 5000-15000
      break;
    case "增量":
      base = 100 + Math.floor(Math.random() * 1900); // 100-2000
      break;
    case "CDC":
      base = 100 + Math.floor(Math.random() * 400); // 100-500
      break;
    default:
      base = 100 + Math.floor(Math.random() * 500);
  }
  const records = base * 60; // 模拟运行 60 秒的采集量
  return { throughput: `${base.toLocaleString("en-US")} 条/s`, records };
}

/**
 * 兼容入口：旧版模拟执行器，已迁移到 runtime.runTaskSync（SeaTunnel 等价真采集）
 * 仍保留旧 collection_logs/throughput 字段写入，便于前端趋势图兼容
 * 内部委托 runtime.runTaskSync 异步执行（不阻塞调度器）
 */
export function runCollectionTask(taskId: string): void {
  const task = queryOne<{ id: string; name: string; mode: string }>(
    "SELECT id, name, mode FROM collection_tasks WHERE id = ?",
    [taskId],
  );
  if (!task) {
    logger.warn({ taskId }, "采集任务不存在，跳过执行");
    return;
  }
  const startedAt = nowFormatted();
  incCollectionRun();
  // 兼容旧 collection_logs（任务起始日志）
  execute(
    "INSERT INTO collection_logs (task_id, status, started_at, finished_at, records_count, error) VALUES (?, ?, ?, ?, ?, ?)",
    [taskId, "运行中", startedAt, null, 0, null],
  );
  // 委托 runtime 异步执行
  runTaskSync(taskId);
}

/** 注册采集任务路由 */
export const registerCollectionTasks: FastifyPluginAsync = async (app, _opts) => {
  // 所有接口需登录
  app.addHook("preHandler", app.authenticate);

  // GET /collection/tasks - 采集任务全表
  app.get("/collection/tasks", async (_request, reply) => {
    const rows = queryAll<Record<string, unknown>>(
      "SELECT * FROM collection_tasks ORDER BY id",
    );
    reply.send(rows.map((r) => taskRowToApi(r)));
  });

  // GET /collection/tasks/:id - 单条
  app.get("/collection/tasks/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const row = queryOne<Record<string, unknown>>(
      "SELECT * FROM collection_tasks WHERE id = ?",
      [id],
    );
    if (!row) {
      reply.code(404).send({ error: "not_found", message: "采集任务不存在", statusCode: 404 });
      return;
    }
    reply.send(taskRowToApi(row));
  });

  // POST /collection/tasks - 新建（需 admin）
  app.post(
    "/collection/tasks",
    { preHandler: [requireRole("admin")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as CollectionTaskBody;
      if (!body || !body.name) {
        reply.code(400).send({ error: "bad_request", message: "name 必填", statusCode: 400 });
        return;
      }
      const id = body.id || `T-${Date.now()}`;
      transaction(() => {
        execute(
          "INSERT INTO collection_tasks (id, name, source, mode, schedule, last_status, throughput, last_run, source_id, sink_type, sink_target, write_mode, transform_pipeline, concurrency, retry_max, retry_interval_sec, timeout_sec, priority, depends_on, enabled, scene_id, model_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            id,
            body.name,
            body.source || "其他",
            body.mode || "增量",
            body.schedule || "*/30 * * * *",
            "成功",
            "—",
            nowFormatted(),
            body.sourceId || null,
            body.sinkType || null,
            body.sinkTarget || null,
            body.writeMode || null,
            body.transformPipeline ? JSON.stringify(body.transformPipeline) : null,
            body.concurrency || 1,
            body.retryMax || 3,
            body.retryIntervalSec || 60,
            body.timeoutSec || null,
            body.priority || 5,
            body.dependsOn ? JSON.stringify(body.dependsOn) : null,
            body.enabled ?? 1,
            body.sceneId || null,
            body.modelId || null,
          ],
        );
      });
      recordAudit({
        userId: userIdOf(request),
        action: "create",
        target: `/collection/tasks/${id}`,
        ip: request.ip || null,
        detail: { id, name: body.name },
      });
      const row = queryOne<Record<string, unknown>>(
        "SELECT * FROM collection_tasks WHERE id = ?",
        [id],
      );
      reply.code(201).send(taskRowToApi(row));
    },
  );

  // PUT /collection/tasks/:id - 更新（需 admin）
  app.put(
    "/collection/tasks/:id",
    { preHandler: [requireRole("admin")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = request.body as Partial<CollectionTaskBody>;
      const existing = queryOne<Record<string, unknown>>(
        "SELECT * FROM collection_tasks WHERE id = ?",
        [id],
      );
      if (!existing) {
        reply.code(404).send({ error: "not_found", message: "采集任务不存在", statusCode: 404 });
        return;
      }
      const merged = { ...camelize<Record<string, unknown>>(existing), ...body };
      transaction(() => {
        execute(
          `UPDATE collection_tasks SET
            name = ?, source = ?, mode = ?, schedule = ?,
            source_id = ?, sink_type = ?, sink_target = ?, write_mode = ?,
            transform_pipeline = ?, concurrency = ?, retry_max = ?, retry_interval_sec = ?,
            timeout_sec = ?, priority = ?, depends_on = ?, enabled = ?, scene_id = ?, model_id = ?
           WHERE id = ?`,
          [
            merged.name,
            merged.source || null,
            merged.mode || null,
            merged.schedule || null,
            merged.sourceId || null,
            merged.sinkType || null,
            merged.sinkTarget || null,
            merged.writeMode || null,
            merged.transformPipeline ? JSON.stringify(merged.transformPipeline) : null,
            merged.concurrency || 1,
            merged.retryMax || 3,
            merged.retryIntervalSec || 60,
            merged.timeoutSec || null,
            merged.priority || 5,
            merged.dependsOn ? JSON.stringify(merged.dependsOn) : null,
            merged.enabled ?? 1,
            merged.sceneId || null,
            merged.modelId || null,
            id,
          ],
        );
      });
      recordAudit({
        userId: userIdOf(request),
        action: "update",
        target: `/collection/tasks/${id}`,
        ip: request.ip || null,
        detail: body,
      });
      const row = queryOne<Record<string, unknown>>(
        "SELECT * FROM collection_tasks WHERE id = ?",
        [id],
      );
      reply.send(taskRowToApi(row));
    },
  );

  // POST /collection/tasks/:id/trigger - 手动触发执行（异步）
  app.post(
    "/collection/tasks/:id/trigger",
    { preHandler: [requireRole("admin", "group_admin")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = (request.body as { dryRun?: boolean }) || {};
      const task = queryOne<{ id: string }>(
        "SELECT id FROM collection_tasks WHERE id = ?",
        [id],
      );
      if (!task) {
        reply.code(404).send({ error: "not_found", message: "采集任务不存在", statusCode: 404 });
        return;
      }
      recordAudit({
        userId: userIdOf(request),
        action: "trigger",
        target: `/collection/tasks/${id}/trigger`,
        ip: request.ip || null,
        detail: { id, dryRun: !!body.dryRun },
      });
      // 异步触发，立即返回 runId 占位
      const runId = `run-${id}-${Date.now()}`;
      reply.code(202).send({ runId, taskId: id, status: "accepted", dryRun: !!body.dryRun });
      // 后台执行
      runTask(id, { dryRun: !!body.dryRun }).catch((err) => {
        logger.error({ taskId: id, err: (err as Error).message }, "trigger 异步执行失败");
      });
    },
  );

  // GET /collection/tasks/:id/runs - 任务运行历史
  app.get(
    "/collection/tasks/:id/runs",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const rows = queryAll<Record<string, unknown>>(
        "SELECT * FROM collection_task_runs WHERE task_id = ? ORDER BY started_at DESC LIMIT 100",
        [id],
      );
      reply.send(rows.map((r) => camelize(r)));
    },
  );

  // GET /collection/tasks/:id/checkpoints - 断点状态
  app.get(
    "/collection/tasks/:id/checkpoints",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const rows = queryAll<{ task_id: string; shard_id: string; state: string; updated_at: string }>(
        "SELECT task_id, shard_id, state, updated_at FROM collection_checkpoints WHERE task_id = ?",
        [id],
      );
      reply.send(rows.map((r) => ({
        taskId: r.task_id,
        shardId: r.shard_id,
        state: safeJsonParse(r.state),
        updatedAt: r.updated_at,
      })));
    },
  );

  // GET /collection/tasks/:id/dirty - 脏数据列表
  app.get(
    "/collection/tasks/:id/dirty",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const rows = queryAll<{ id: number; run_id: string; step_id: string; raw_json: string; error: string; created_at: string }>(
        "SELECT id, run_id, step_id, raw_json, error, created_at FROM dirty_records WHERE task_id = ? ORDER BY created_at DESC LIMIT 100",
        [id],
      );
      reply.send(rows.map((r) => ({
        id: r.id,
        runId: r.run_id,
        stepId: r.step_id,
        raw: safeJsonParse(r.raw_json),
        error: r.error,
        createdAt: r.created_at,
      })));
    },
  );

  // GET /collection/tasks/:id/audit - 4 审计点
  app.get(
    "/collection/tasks/:id/audit",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const rows = queryAll<Record<string, unknown>>(
        "SELECT * FROM collection_audit WHERE task_id = ? ORDER BY log_ts DESC LIMIT 200",
        [id],
      );
      reply.send(rows.map((r) => camelize(r)));
    },
  );

  // GET /collection/tasks/:id/lineage - 数据血缘
  app.get(
    "/collection/tasks/:id/lineage",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const rows = queryAll<Record<string, unknown>>(
        "SELECT * FROM data_lineage WHERE task_id = ? ORDER BY created_at DESC",
        [id],
      );
      reply.send(rows.map((r) => camelize(r)));
    },
  );

  // GET /collection/tasks/:id/quality - 数据质量问题列表
  app.get(
    "/collection/tasks/:id/quality",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const rows = listQualityIssues(id, 100);
      reply.send(rows.map((r) => camelize(r)));
    },
  );

  // DELETE /collection/tasks/:id - 删除（需 admin）
  // collection_logs / data_quality_issues / collection_task_runs / dirty_records 等对 task_id 有 FK，
  // 这里在事务中先清理依赖行，再删任务，保证可删除且不留孤儿。
  app.delete(
    "/collection/tasks/:id",
    { preHandler: [requireRole("admin")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      let changes = 0;
      try {
        transaction(() => {
          execute("DELETE FROM data_quality_issues WHERE task_id = ?", [id]);
          execute("DELETE FROM collection_logs WHERE task_id = ?", [id]);
          execute("DELETE FROM collection_task_runs WHERE task_id = ?", [id]);
          execute("DELETE FROM collection_checkpoints WHERE task_id = ?", [id]);
          execute("DELETE FROM dirty_records WHERE task_id = ?", [id]);
          execute("DELETE FROM collection_audit WHERE task_id = ?", [id]);
          execute("DELETE FROM data_lineage WHERE task_id = ?", [id]);
          execute("DELETE FROM ods_generic WHERE task_id = ?", [id]);
          const r = execute("DELETE FROM collection_tasks WHERE id = ?", [id]);
          changes = r.changes;
        });
      } catch (err) {
        logger.warn({ err: (err as Error).message, taskId: id }, "删除采集任务失败");
        reply.code(500).send({ error: "internal_error", message: "删除采集任务失败", statusCode: 500 });
        return;
      }
      if (changes === 0) {
        reply.code(404).send({ error: "not_found", message: "采集任务不存在", statusCode: 404 });
        return;
      }
      recordAudit({
        userId: userIdOf(request),
        action: "delete",
        target: `/collection/tasks/${id}`,
        ip: request.ip || null,
        detail: { id },
      });
      reply.send({ success: true });
    },
  );
};
