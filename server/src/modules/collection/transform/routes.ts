// Transform 路由：GET /collection/transforms/types、POST /collection/transforms/preview
import type { FastifyPluginAsync } from "fastify";
import { requireRole } from "../../platform/rbac.js";
import { listTransformTypes } from "./registry.js";
import { runPreview } from "./preview.js";
import { ErrorLimitExceeded } from "./types.js";

export const registerTransformRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);

  // GET /collection/transforms/types - 13 类 Transform + 配置 schema
  app.get("/collection/transforms/types", async (_req, reply) => {
    reply.send({
      total: 13,
      types: listTransformTypes(),
    });
  });

  // POST /collection/transforms/preview - 试运行
  app.post(
    "/collection/transforms/preview",
    { preHandler: [requireRole("admin", "group_admin", "inspector")] },
    async (request, reply) => {
      const body = request.body as {
        sample: Record<string, unknown>[];
        pipeline: { steps: unknown[] };
      };
      if (!body || !Array.isArray(body.sample) || !body.pipeline || !Array.isArray(body.pipeline.steps)) {
        reply.code(400).send({
          error: "bad_request",
          message: "sample 数组与 pipeline.steps 数组必填",
          statusCode: 400,
        });
        return;
      }
      try {
        const result = await runPreview({
          sample: body.sample,
          pipeline: body.pipeline as never,
        });
        reply.send(result);
      } catch (err) {
        if (err instanceof ErrorLimitExceeded) {
          reply.code(422).send({
            error: "error_limit_exceeded",
            message: err.message,
            statusCode: 422,
          });
          return;
        }
        reply.code(400).send({
          error: "preview_failed",
          message: (err as Error).message,
          statusCode: 400,
        });
      }
    },
  );
};
