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
import { runQualityCheck } from "./quality.js";

/** 采集任务新建/更新请求体 */
interface CollectionTaskBody {
  id?: string;
  name: string;
  source?: string;
  mode?: string;
  schedule?: string;
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
 * 模拟执行采集任务
 * - 根据 mode（全量/增量/CDC）生成随机吞吐量
 * - 写 collection_logs
 * - 更新 task 的 last_status（90% 成功 / 10% 失败）、throughput、last_run
 * - 失败则 eventBus.emit('collection.failed', {taskId, error})
 * - 成功则运行数据质量校验 runQualityCheck
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

  // 模拟执行：90% 成功 / 10% 失败
  const success = Math.random() >= 0.1;
  const { throughput, records } = generateThroughput(task.mode || "");

  if (success) {
    const finishedAt = nowFormatted();
    // 事务包裹 collection_logs INSERT + collection_tasks UPDATE，避免一半提交导致
    // logs 显示"成功"而 task.last_status 仍停留在旧值的不可恢复不一致
    transaction(() => {
      execute(
        "INSERT INTO collection_logs (task_id, status, started_at, finished_at, records_count, error) VALUES (?, ?, ?, ?, ?, ?)",
        [taskId, "成功", startedAt, finishedAt, records, null],
      );
      execute(
        "UPDATE collection_tasks SET last_status = ?, throughput = ?, last_run = ? WHERE id = ?",
        ["成功", throughput, finishedAt, taskId],
      );
    });
    logger.info({ taskId, throughput, records }, "采集任务执行成功");
    // 成功后运行数据质量校验
    runQualityCheck(taskId, records);
  } else {
    const finishedAt = nowFormatted();
    const error = "连接超时：源系统响应超时（模拟）";
    transaction(() => {
      execute(
        "INSERT INTO collection_logs (task_id, status, started_at, finished_at, records_count, error) VALUES (?, ?, ?, ?, ?, ?)",
        [taskId, "失败", startedAt, finishedAt, 0, error],
      );
      execute(
        "UPDATE collection_tasks SET last_status = ?, throughput = ?, last_run = ? WHERE id = ?",
        ["失败", "—", finishedAt, taskId],
      );
    });
    incCollectionFailure();
    eventBus.emit("collection.failed", { taskId, error });
    logger.warn({ taskId, error }, "采集任务执行失败");
  }
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
    reply.send(rows.map((r) => camelize(r)));
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
    reply.send(camelize(row));
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
      execute(
        "INSERT INTO collection_tasks (id, name, source, mode, schedule, last_status, throughput, last_run) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [
          id,
          body.name,
          body.source || "其他",
          body.mode || "增量",
          body.schedule || "*/30 * * * *",
          "成功",
          "—",
          nowFormatted(),
        ],
      );
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
      reply.code(201).send(camelize(row));
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
      execute(
        "UPDATE collection_tasks SET name = ?, source = ?, mode = ?, schedule = ? WHERE id = ?",
        [
          merged.name,
          merged.source || null,
          merged.mode || null,
          merged.schedule || null,
          id,
        ],
      );
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
      reply.send(camelize(row));
    },
  );

  // DELETE /collection/tasks/:id - 删除（需 admin）
  // collection_logs / data_quality_issues 对 task_id 有 FK RESTRICT（schema.sql 默认），
  // 一旦任务有执行历史，直接 DELETE 会触发 SQLITE_CONSTRAINT 抛 500。
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
