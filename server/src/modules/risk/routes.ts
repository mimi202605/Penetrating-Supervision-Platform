// 风险模块路由：注册全部 /risk/* 端点
// 端点：/risk/clues、/risk/clues/:id、/risk/clues/:id/dispatch、/risk/clues/:id/dispose、/risk/clues/:id/close
//       /risk/my-todos、/risk/todos/:id/claim、/risk/todos/:id/complete
//       /risk/clues/:id/disposals
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { requireRole } from "../platform/rbac.js";
import { recordAudit } from "../platform/audit.js";
import {
  listClues,
  getClue,
  dispatchClue,
  closeClue,
  type ClueListFilter,
} from "./clues.js";
import { recordDisposal, listDisposalsByClue, type DisposalStep } from "./disposals.js";
import { myTodos, claimTodo, completeTodo } from "./todos.js";

/** 取当前用户 ID */
function userIdOf(request: FastifyRequest): string | null {
  return (request.user as { id?: string } | undefined)?.id ?? null;
}

/** 取当前用户角色 */
function roleOf(request: FastifyRequest): string {
  return (request.user as { role?: string } | undefined)?.role ?? "inspector";
}

/** 风险模块路由注册 */
export const registerRiskRoutes: FastifyPluginAsync = async (app, _opts) => {
  app.addHook("preHandler", app.authenticate);

  // ---------------- 线索 ----------------

  // GET /risk/clues?status=&riskLevel=&sceneId=&orgCode=&assignedTo=
  app.get("/risk/clues", async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as {
      status?: string;
      riskLevel?: string;
      sceneId?: string;
      orgCode?: string;
      assignedTo?: string;
      limit?: string;
    };
    const filter: ClueListFilter = {
      status: q.status,
      riskLevel: q.riskLevel,
      sceneId: q.sceneId,
      orgCode: q.orgCode,
      assignedTo: q.assignedTo,
      limit: q.limit ? parseInt(q.limit, 10) : undefined,
    };
    reply.send(listClues(filter));
  });

  // GET /risk/clues/:id
  app.get("/risk/clues/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const clue = getClue(id);
    if (!clue) {
      reply.code(404).send({ error: "not_found", message: "线索不存在", statusCode: 404 });
      return;
    }
    reply.send(clue);
  });

  // GET /risk/clues/:id/disposals
  app.get("/risk/clues/:id/disposals", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    reply.send(listDisposalsByClue(id));
  });

  // POST /risk/clues/:id/dispatch 派单（创建 dispatch 工单）
  app.post(
    "/risk/clues/:id/dispatch",
    { preHandler: [requireRole("admin", "group_admin", "duty_officer")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = (request.body as { owner?: string } | null) ?? {};
      try {
        const result = dispatchClue(id, body.owner, {
          userId: userIdOf(request),
          ip: request.ip || null,
        });
        recordAudit({
          userId: userIdOf(request),
          action: "dispatch",
          target: `/risk/clues/${id}/dispatch`,
          ip: request.ip || null,
          detail: { clueId: id, orderId: result.orderId, owner: result.owner },
        });
        reply.code(201).send(result);
      } catch (err) {
        reply.code(400).send({ error: "dispatch_failed", message: (err as Error).message, statusCode: 400 });
      }
    },
  );

  // POST /risk/clues/:id/dispose 处置记录
  app.post(
    "/risk/clues/:id/dispose",
    { preHandler: [requireRole("admin", "group_admin", "inspector", "duty_officer")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = (request.body as {
        step?: DisposalStep;
        handler?: string;
        roleCode?: string;
        comment?: string;
        attachment?: string;
      } | null) ?? {};
      const handler = body.handler || userIdOf(request) || "unknown";
      const disp = recordDisposal({
        clueId: id,
        step: body.step || "dispose",
        handler,
        roleCode: body.roleCode,
        comment: body.comment,
        attachment: body.attachment,
      });
      recordAudit({
        userId: userIdOf(request),
        action: "dispose",
        target: `/risk/clues/${id}/dispose`,
        ip: request.ip || null,
        detail: { clueId: id, step: body.step || "dispose", handler },
      });
      reply.code(201).send(disp);
    },
  );

  // POST /risk/clues/:id/close 销警关闭
  app.post(
    "/risk/clues/:id/close",
    { preHandler: [requireRole("admin", "group_admin")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      try {
        const result = closeClue(id, {
          userId: userIdOf(request),
          ip: request.ip || null,
        });
        recordAudit({
          userId: userIdOf(request),
          action: "close",
          target: `/risk/clues/${id}/close`,
          ip: request.ip || null,
          detail: { clueId: id, orderId: result.orderId },
        });
        reply.send({ success: true, ...result });
      } catch (err) {
        reply.code(400).send({ error: "close_failed", message: (err as Error).message, statusCode: 400 });
      }
    },
  );

  // ---------------- 待办 ----------------

  // GET /risk/my-todos
  app.get("/risk/my-todos", async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as { status?: string };
    const userId = userIdOf(request) || "anonymous";
    const role = roleOf(request);
    const user = request.user as { org_id?: string | null } | undefined;
    reply.send(myTodos({ userId, role, orgId: user?.org_id ?? null, status: q.status }));
  });

  // POST /risk/todos/:id/claim
  app.post(
    "/risk/todos/:id/claim",
    { preHandler: [requireRole("admin", "group_admin", "inspector", "duty_officer")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const userId = userIdOf(request) || "unknown";
      const result = claimTodo(id, userId);
      if (!result.ok) {
        reply.code(400).send({ error: "claim_failed", message: result.message, statusCode: 400 });
        return;
      }
      recordAudit({
        userId: userIdOf(request),
        action: "claim",
        target: `/risk/todos/${id}/claim`,
        ip: request.ip || null,
        detail: { clueId: id, userId },
      });
      reply.send(result);
    },
  );

  // POST /risk/todos/:id/complete
  app.post(
    "/risk/todos/:id/complete",
    { preHandler: [requireRole("admin", "group_admin", "inspector", "duty_officer")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const userId = userIdOf(request) || "unknown";
      const body = (request.body as { comment?: string; attachment?: string; roleCode?: string } | null) ?? {};
      const result = completeTodo(id, userId, body);
      if (!result.ok) {
        reply.code(400).send({ error: "complete_failed", message: result.message, statusCode: 400 });
        return;
      }
      recordAudit({
        userId: userIdOf(request),
        action: "complete",
        target: `/risk/todos/${id}/complete`,
        ip: request.ip || null,
        detail: { clueId: id, userId },
      });
      reply.send(result);
    },
  );
};
