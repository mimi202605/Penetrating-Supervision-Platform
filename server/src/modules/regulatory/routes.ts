// 监管模块路由：注册全部 /regulatory/* 端点
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { requireRole } from "../platform/rbac.js";
import { recordAudit } from "../platform/audit.js";
import {
  listScenes,
  getScene,
  createScene,
  updateScene,
  deleteScene,
  getSceneWithModel,
  type SceneBody,
} from "./scenes.js";
import {
  listModels,
  getModel,
  createModel,
  updateModel,
  deleteModel,
  testModel,
  type ModelBody,
} from "./models.js";
import {
  listIndicators,
  getIndicator,
  createIndicator,
  updateIndicator,
  deleteIndicator,
  type IndicatorBody,
} from "./indicators.js";
import {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  instantiateTemplate,
  type TemplateBody,
} from "./templates.js";

/** 取当前用户 ID */
function userIdOf(request: FastifyRequest): string | null {
  return (request.user as { id?: string } | undefined)?.id ?? null;
}

/** 监管模块路由注册 */
export const registerRegulatoryRoutes: FastifyPluginAsync = async (app, _opts) => {
  app.addHook("preHandler", app.authenticate);

  // ---------------- 场景 ----------------

  // GET /regulatory/scenes?domain=
  app.get("/regulatory/scenes", async (request: FastifyRequest, reply: FastifyReply) => {
    const { domain } = request.query as { domain?: string };
    reply.send(listScenes(domain));
  });

  // GET /regulatory/scenes/:id
  app.get("/regulatory/scenes/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const scene = getScene(id);
    if (!scene) {
      reply.code(404).send({ error: "not_found", message: "场景不存在", statusCode: 404 });
      return;
    }
    reply.send(scene);
  });

  // GET /regulatory/scenes/:id/detail（场景含模型+指标联查）
  app.get("/regulatory/scenes/:id/detail", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const detail = getSceneWithModel(id);
    if (!detail) {
      reply.code(404).send({ error: "not_found", message: "场景不存在", statusCode: 404 });
      return;
    }
    reply.send(detail);
  });

  // POST /regulatory/scenes（需 admin）
  app.post(
    "/regulatory/scenes",
    { preHandler: [requireRole("admin")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as SceneBody;
      if (!body || !body.name || !body.domain) {
        reply.code(400).send({ error: "bad_request", message: "name/domain 必填", statusCode: 400 });
        return;
      }
      const scene = createScene(body);
      recordAudit({
        userId: userIdOf(request),
        action: "create",
        target: `/regulatory/scenes/${scene.id}`,
        ip: request.ip || null,
        detail: { id: scene.id, name: body.name },
      });
      reply.code(201).send(scene);
    },
  );

  // PUT /regulatory/scenes/:id
  app.put(
    "/regulatory/scenes/:id",
    { preHandler: [requireRole("admin")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = request.body as Partial<SceneBody>;
      const scene = updateScene(id, body);
      if (!scene) {
        reply.code(404).send({ error: "not_found", message: "场景不存在", statusCode: 404 });
        return;
      }
      recordAudit({ userId: userIdOf(request), action: "update", target: `/regulatory/scenes/${id}`, ip: request.ip || null, detail: body });
      reply.send(scene);
    },
  );

  // DELETE /regulatory/scenes/:id
  app.delete(
    "/regulatory/scenes/:id",
    { preHandler: [requireRole("admin")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const ok = deleteScene(id);
      if (!ok) {
        reply.code(404).send({ error: "not_found", message: "场景不存在", statusCode: 404 });
        return;
      }
      recordAudit({ userId: userIdOf(request), action: "delete", target: `/regulatory/scenes/${id}`, ip: request.ip || null, detail: { id } });
      reply.send({ success: true });
    },
  );

  // ---------------- 模型 ----------------

  // GET /regulatory/models?sceneId=
  app.get("/regulatory/models", async (request: FastifyRequest, reply: FastifyReply) => {
    const { sceneId } = request.query as { sceneId?: string };
    reply.send(listModels(sceneId));
  });

  // GET /regulatory/models/:id（含指标）
  app.get("/regulatory/models/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const model = getModel(id);
    if (!model) {
      reply.code(404).send({ error: "not_found", message: "模型不存在", statusCode: 404 });
      return;
    }
    reply.send(model);
  });

  // POST /regulatory/models
  app.post(
    "/regulatory/models",
    { preHandler: [requireRole("admin", "group_admin")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as ModelBody;
      if (!body || !body.name || !body.sceneId || !body.domain) {
        reply.code(400).send({ error: "bad_request", message: "name/sceneId/domain 必填", statusCode: 400 });
        return;
      }
      const model = createModel(body);
      recordAudit({ userId: userIdOf(request), action: "create", target: `/regulatory/models/${model.id}`, ip: request.ip || null, detail: { id: model.id, name: body.name } });
      reply.code(201).send(model);
    },
  );

  // PUT /regulatory/models/:id
  app.put(
    "/regulatory/models/:id",
    { preHandler: [requireRole("admin", "group_admin")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = request.body as Partial<ModelBody>;
      const model = updateModel(id, body);
      if (!model) {
        reply.code(404).send({ error: "not_found", message: "模型不存在", statusCode: 404 });
        return;
      }
      recordAudit({ userId: userIdOf(request), action: "update", target: `/regulatory/models/${id}`, ip: request.ip || null, detail: body });
      reply.send(model);
    },
  );

  // DELETE /regulatory/models/:id
  app.delete(
    "/regulatory/models/:id",
    { preHandler: [requireRole("admin")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const ok = deleteModel(id);
      if (!ok) {
        reply.code(404).send({ error: "not_found", message: "模型不存在", statusCode: 404 });
        return;
      }
      recordAudit({ userId: userIdOf(request), action: "delete", target: `/regulatory/models/${id}`, ip: request.ip || null, detail: { id } });
      reply.send({ success: true });
    },
  );

  // POST /regulatory/models/:id/test 试运行模型
  app.post(
    "/regulatory/models/:id/test",
    { preHandler: [requireRole("admin", "group_admin", "inspector")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = (request.body as { facts?: Array<Record<string, unknown>> }) || {};
      const factsList = Array.isArray(body.facts) ? body.facts : [];
      if (factsList.length === 0) {
        reply.code(400).send({ error: "bad_request", message: "facts 数组必填（至少 1 条）", statusCode: 400 });
        return;
      }
      try {
        const result = await testModel(id, factsList);
        recordAudit({ userId: userIdOf(request), action: "test", target: `/regulatory/models/${id}/test`, ip: request.ip || null, detail: { hitCount: result.hitCount, total: factsList.length } });
        reply.send(result);
      } catch (err) {
        reply.code(400).send({ error: "test_failed", message: (err as Error).message, statusCode: 400 });
      }
    },
  );

  // ---------------- 指标 ----------------

  // GET /regulatory/models/:modelId/indicators
  app.get("/regulatory/models/:modelId/indicators", async (request: FastifyRequest, reply: FastifyReply) => {
    const { modelId } = request.params as { modelId: string };
    reply.send(listIndicators(modelId));
  });

  // GET /regulatory/indicators/:id
  app.get("/regulatory/indicators/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const ind = getIndicator(id);
    if (!ind) {
      reply.code(404).send({ error: "not_found", message: "指标不存在", statusCode: 404 });
      return;
    }
    reply.send(ind);
  });

  // POST /regulatory/models/:modelId/indicators
  app.post(
    "/regulatory/models/:modelId/indicators",
    { preHandler: [requireRole("admin", "group_admin")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { modelId } = request.params as { modelId: string };
      const body = request.body as Omit<IndicatorBody, "modelId">;
      if (!body || !body.name) {
        reply.code(400).send({ error: "bad_request", message: "name 必填", statusCode: 400 });
        return;
      }
      const ind = createIndicator({ ...body, modelId });
      recordAudit({ userId: userIdOf(request), action: "create", target: `/regulatory/indicators/${ind.id}`, ip: request.ip || null, detail: { id: ind.id, modelId } });
      reply.code(201).send(ind);
    },
  );

  // PUT /regulatory/indicators/:id
  app.put(
    "/regulatory/indicators/:id",
    { preHandler: [requireRole("admin", "group_admin")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = request.body as Partial<IndicatorBody>;
      const ind = updateIndicator(id, body);
      if (!ind) {
        reply.code(404).send({ error: "not_found", message: "指标不存在", statusCode: 404 });
        return;
      }
      recordAudit({ userId: userIdOf(request), action: "update", target: `/regulatory/indicators/${id}`, ip: request.ip || null, detail: body });
      reply.send(ind);
    },
  );

  // DELETE /regulatory/indicators/:id
  app.delete(
    "/regulatory/indicators/:id",
    { preHandler: [requireRole("admin")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const ok = deleteIndicator(id);
      if (!ok) {
        reply.code(404).send({ error: "not_found", message: "指标不存在", statusCode: 404 });
        return;
      }
      recordAudit({ userId: userIdOf(request), action: "delete", target: `/regulatory/indicators/${id}`, ip: request.ip || null, detail: { id } });
      reply.send({ success: true });
    },
  );

  // ---------------- 模板 ----------------

  // GET /regulatory/templates?sceneId=
  app.get("/regulatory/templates", async (request: FastifyRequest, reply: FastifyReply) => {
    const { sceneId } = request.query as { sceneId?: string };
    reply.send(listTemplates(sceneId));
  });

  // GET /regulatory/templates/:id
  app.get("/regulatory/templates/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const tpl = getTemplate(id);
    if (!tpl) {
      reply.code(404).send({ error: "not_found", message: "模板不存在", statusCode: 404 });
      return;
    }
    reply.send(tpl);
  });

  // POST /regulatory/templates
  app.post(
    "/regulatory/templates",
    { preHandler: [requireRole("admin", "group_admin")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as TemplateBody;
      if (!body || !body.name || !body.sceneId || !body.connectorType) {
        reply.code(400).send({ error: "bad_request", message: "name/sceneId/connectorType 必填", statusCode: 400 });
        return;
      }
      const tpl = createTemplate(body);
      recordAudit({ userId: userIdOf(request), action: "create", target: `/regulatory/templates/${tpl.id}`, ip: request.ip || null, detail: { id: tpl.id, name: body.name } });
      reply.code(201).send(tpl);
    },
  );

  // PUT /regulatory/templates/:id
  app.put(
    "/regulatory/templates/:id",
    { preHandler: [requireRole("admin", "group_admin")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = request.body as Partial<TemplateBody>;
      const tpl = updateTemplate(id, body);
      if (!tpl) {
        reply.code(404).send({ error: "not_found", message: "模板不存在", statusCode: 404 });
        return;
      }
      recordAudit({ userId: userIdOf(request), action: "update", target: `/regulatory/templates/${id}`, ip: request.ip || null, detail: body });
      reply.send(tpl);
    },
  );

  // DELETE /regulatory/templates/:id
  app.delete(
    "/regulatory/templates/:id",
    { preHandler: [requireRole("admin")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const ok = deleteTemplate(id);
      if (!ok) {
        reply.code(404).send({ error: "not_found", message: "模板不存在", statusCode: 404 });
        return;
      }
      recordAudit({ userId: userIdOf(request), action: "delete", target: `/regulatory/templates/${id}`, ip: request.ip || null, detail: { id } });
      reply.send({ success: true });
    },
  );

  // POST /regulatory/templates/:id/instantiate
  app.post(
    "/regulatory/templates/:id/instantiate",
    { preHandler: [requireRole("admin", "group_admin")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = (request.body as { name?: string; sourceId?: string; enabled?: number }) || {};
      try {
        const result = instantiateTemplate(id, body);
        recordAudit({ userId: userIdOf(request), action: "instantiate", target: `/regulatory/templates/${id}/instantiate`, ip: request.ip || null, detail: { templateId: id, taskId: result.taskId } });
        reply.code(201).send({ taskId: result.taskId, templateId: id });
      } catch (err) {
        reply.code(404).send({ error: "not_found", message: (err as Error).message, statusCode: 404 });
      }
    },
  );
};
