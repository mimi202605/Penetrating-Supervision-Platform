// 调度指挥中心 - 核查工单 CRUD + 流转
// 对应 work_orders 表，API 返回驼峰（WorkOrder 契约）
// 节点：verify → rectify → review → archive（状态机在 workflow.ts）
import type { FastifyPluginCallback, FastifyReply, FastifyRequest } from "fastify";
import { execute, queryAll, queryOne } from "../../db/index.js";
import { camelize } from "../../utils/case.js";
import { requireRole } from "../platform/rbac.js";
import { recordAudit } from "../platform/audit.js";
import { advanceWorkOrder, type WorkOrderRow } from "./workflow.js";

/** 新建工单请求体 */
interface CreateWorkOrderBody {
  id?: string;
  riskSource?: string;
  owner?: string;
  riskWarningId?: string;
}

/** 更新工单请求体（如改 owner / 节点） */
interface UpdateWorkOrderBody {
  riskSource?: string;
  owner?: string;
  currentNode?: string;
  progress?: number;
  status?: string;
  riskWarningId?: string | null;
}

/** 推进请求体 */
interface AdvanceBody {
  result?: unknown;
}

/** 工单列表/详情查询用列 */
const WORK_ORDER_COLUMNS =
  "id, risk_source, owner, current_node, progress, status, risk_warning_id, created_at, updated_at";

/** 从请求中提取当前用户ID */
function userIdOf(request: FastifyRequest): string | null {
  return (request.user as { id?: string } | undefined)?.id ?? null;
}

/** 当前时间字符串（YYYY-MM-DD HH:mm） */
function nowFormatted(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 生成工单 ID：WO + YYYYMMDDHHmm + 3 位随机 */
function generateOrderId(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}`;
  const rand = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
  return `WO${stamp}${rand}`;
}

/** 工单路由插件 */
export const registerWorkOrders: FastifyPluginCallback = (app, _opts, done) => {
  // 所有接口需登录
  app.addHook("preHandler", app.authenticate);

  // GET /dispatch/work-orders - 全表，支持 ?status=&owner= 过滤
  app.get("/dispatch/work-orders", async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as { status?: string; owner?: string };
    const where: string[] = [];
    const params: unknown[] = [];
    if (q.status) {
      where.push("status = ?");
      params.push(q.status);
    }
    if (q.owner) {
      where.push("owner = ?");
      params.push(q.owner);
    }
    const whereClause = where.length ? "WHERE " + where.join(" AND ") : "";
    const rows = queryAll<WorkOrderRow>(
      `SELECT ${WORK_ORDER_COLUMNS} FROM work_orders ${whereClause} ORDER BY created_at DESC, id DESC`,
      params,
    );
    reply.send(rows.map((r) => camelize<Record<string, unknown>>(r)));
  });

  // GET /dispatch/work-orders/:id - 单条
  app.get("/dispatch/work-orders/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const row = queryOne<WorkOrderRow>(
      `SELECT ${WORK_ORDER_COLUMNS} FROM work_orders WHERE id = ?`,
      [id],
    );
    if (!row) {
      reply.code(404).send({ error: "not_found", message: "工单不存在", statusCode: 404 });
      return;
    }
    reply.send(camelize<Record<string, unknown>>(row));
  });

  // POST /dispatch/work-orders - 新建（需 admin/duty_officer/inspector）
  app.post(
    "/dispatch/work-orders",
    { preHandler: [requireRole("admin", "duty_officer", "inspector")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as CreateWorkOrderBody;
      if (!body || !body.riskSource) {
        reply.code(400).send({ error: "bad_request", message: "riskSource 必填", statusCode: 400 });
        return;
      }
      const id = body.id || generateOrderId();
      const now = nowFormatted();
      execute(
        "INSERT INTO work_orders (id, risk_source, owner, current_node, progress, status, risk_warning_id, created_at, updated_at) VALUES (?, ?, ?, 'verify', 20, 'processing', ?, ?, ?)",
        [id, body.riskSource, body.owner || null, body.riskWarningId || null, now, now],
      );
      recordAudit({
        userId: userIdOf(request),
        action: "create",
        target: `/dispatch/work-orders/${id}`,
        ip: request.ip || null,
        detail: {
          id,
          riskSource: body.riskSource,
          owner: body.owner ?? null,
          riskWarningId: body.riskWarningId ?? null,
        },
      });
      const row = queryOne<WorkOrderRow>(
        `SELECT ${WORK_ORDER_COLUMNS} FROM work_orders WHERE id = ?`,
        [id],
      );
      reply.code(201).send(camelize<Record<string, unknown>>(row));
    },
  );

  // POST /dispatch/work-orders/:id/advance - 推进工单
  app.post(
    "/dispatch/work-orders/:id/advance",
    { preHandler: [requireRole("admin", "duty_officer", "inspector")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = (request.body as AdvanceBody | null) ?? {};
      const result = advanceWorkOrder(id, body.result, {
        userId: userIdOf(request),
        ip: request.ip || null,
      });
      if (!result.ok) {
        reply.code(400).send({ error: "bad_request", message: result.message, statusCode: 400 });
        return;
      }
      reply.send(result);
    },
  );

  // PUT /dispatch/work-orders/:id - 更新（仅允许改 owner / riskSource 等元数据）
  // 注意：currentNode / progress / status 受状态机约束（见 workflow.ts advanceWorkOrder），
  // 之前 PUT 直接写这三列会绕过状态机：可把 verify 直接改成 archive（progress 仍为 20）、
  // 跳过 risk_warnings → resolved 联动、写入非法节点名。故此处禁止通过 PUT 修改这三列，
  // 流转一律走 POST /:id/advance。
  app.put(
    "/dispatch/work-orders/:id",
    { preHandler: [requireRole("admin", "duty_officer", "inspector")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = request.body as Partial<UpdateWorkOrderBody>;
      const existing = queryOne<WorkOrderRow>(
        `SELECT ${WORK_ORDER_COLUMNS} FROM work_orders WHERE id = ?`,
        [id],
      );
      if (!existing) {
        reply.code(404).send({ error: "not_found", message: "工单不存在", statusCode: 404 });
        return;
      }
      if (
        body.currentNode !== undefined ||
        body.progress !== undefined ||
        body.status !== undefined
      ) {
        reply.code(400).send({
          error: "bad_request",
          message: "currentNode/progress/status 不可通过 PUT 修改，请使用 POST /dispatch/work-orders/:id/advance 推进",
          statusCode: 400,
        });
        return;
      }
      const sets: string[] = [];
      const params: unknown[] = [];
      if (body.riskSource !== undefined) {
        sets.push("risk_source = ?");
        params.push(body.riskSource);
      }
      if (body.owner !== undefined) {
        sets.push("owner = ?");
        params.push(body.owner);
      }
      if (body.riskWarningId !== undefined) {
        sets.push("risk_warning_id = ?");
        params.push(body.riskWarningId);
      }
      if (sets.length === 0) {
        reply.code(400).send({ error: "bad_request", message: "无待更新字段", statusCode: 400 });
        return;
      }
      sets.push("updated_at = ?");
      params.push(nowFormatted());
      params.push(id);
      execute(`UPDATE work_orders SET ${sets.join(", ")} WHERE id = ?`, params);
      recordAudit({
        userId: userIdOf(request),
        action: "update",
        target: `/dispatch/work-orders/${id}`,
        ip: request.ip || null,
        detail: body,
      });
      const row = queryOne<WorkOrderRow>(
        `SELECT ${WORK_ORDER_COLUMNS} FROM work_orders WHERE id = ?`,
        [id],
      );
      reply.send(camelize<Record<string, unknown>>(row));
    },
  );

  done();
};
