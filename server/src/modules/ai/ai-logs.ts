// 人工智能与数据脱敏 - AI 调用全链路日志查询 + 记录
// ai_call_logs：调用者 / 端点 / 脱敏后入参摘要 / 出参摘要 / 耗时ms / token / 时间
import type { FastifyInstance, FastifyPluginCallback, FastifyReply, FastifyRequest } from "fastify";
import { queryAll, queryOne, execute } from "../../db/index.js";
import { camelize } from "../../utils/case.js";
import { incAiCall } from "../../health.js";

/** AI 调用日志行（数据库列） */
interface AICallLogRow {
  id: number;
  user_id: string | null;
  endpoint: string;
  input_summary: string | null;
  output_summary: string | null;
  latency_ms: number;
  token: number;
  created_at: string;
}

/** 记录 AI 调用日志 */
export interface LogAICallPayload {
  userId: string | null;
  endpoint: string;
  inputSummary: string;
  outputSummary: string;
  latencyMs: number;
  token: number;
}

/** 内部函数：记录 AI 调用到 ai_call_logs */
export function logAICall(p: LogAICallPayload): void {
  incAiCall();
  execute(
    "INSERT INTO ai_call_logs (user_id, endpoint, input_summary, output_summary, latency_ms, token) VALUES (?, ?, ?, ?, ?, ?)",
    [p.userId, p.endpoint, p.inputSummary, p.outputSummary, p.latencyMs, p.token],
  );
}

/** 截断摘要到指定长度 */
function truncate(s: string, max = 500): string {
  return s.length > max ? s.slice(0, max) + "..." : s;
}

/** AI 日志路由插件 */
export const registerAILogs: FastifyPluginCallback = (app: FastifyInstance, _opts, done) => {
  // GET /ai/logs：查询 ai_call_logs（分页，?userId=&endpoint=&startTime=&endTime=）
  app.get(
    "/ai/logs",
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const q = request.query as {
        userId?: string;
        endpoint?: string;
        startTime?: string;
        endTime?: string;
        page?: string;
        pageSize?: string;
      };
      const where: string[] = [];
      const params: unknown[] = [];
      if (q.userId) {
        where.push("user_id = ?");
        params.push(q.userId);
      }
      if (q.endpoint) {
        where.push("endpoint LIKE ?");
        params.push(`%${q.endpoint}%`);
      }
      if (q.startTime) {
        where.push("created_at >= ?");
        params.push(q.startTime);
      }
      if (q.endTime) {
        where.push("created_at <= ?");
        params.push(q.endTime);
      }
      const whereClause = where.length ? "WHERE " + where.join(" AND ") : "";
      const page = Math.max(1, Number(q.page ?? 1));
      const pageSize = Math.max(1, Math.min(200, Number(q.pageSize ?? 20)));
      const offset = (page - 1) * pageSize;

      const rows = queryAll<AICallLogRow>(
        `SELECT id, user_id, endpoint, input_summary, output_summary, latency_ms, token, created_at
         FROM ai_call_logs ${whereClause}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, pageSize, offset],
      );
      const totalRow = queryOne<{ total: number }>(
        `SELECT COUNT(*) AS total FROM ai_call_logs ${whereClause}`,
        params,
      );
      const total = totalRow?.total ?? 0;
      reply.send({
        list: rows.map((r) => camelize(r)),
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      });
    },
  );

  done();
};

export { truncate };
