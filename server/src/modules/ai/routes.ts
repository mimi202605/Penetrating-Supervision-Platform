// 人工智能与数据脱敏路由汇总：
// POST /ai/query、POST /ai/contract-review、POST /ai/risk-report、GET /ai/health
// GET/POST/PUT/DELETE /ai/sanitizer/policies、GET /ai/logs
import type { FastifyInstance, FastifyPluginCallback, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requirePermission } from "../platform/rbac.js";
import type { JwtUser } from "../platform/auth.js";
import { callLLM, getAIHealth, isAIConfigured } from "./llm-adapter.js";
import { naturalLanguageQuery, contractReview, generateRiskReport } from "./ai-service.js";
import { registerSanitizerPolicies } from "./sanitizer-policies.js";
import { registerAILogs } from "./ai-logs.js";
import { logger } from "../../utils/logger.js";

const querySchema = z.object({ query: z.string().min(1) });
const contractSchema = z.object({ contractText: z.string().min(1) });
const reportSchema = z.object({ riskWarningId: z.string().min(1) });

/** AI 路由汇总插件 */
export const registerAIRoutes: FastifyPluginCallback = (app: FastifyInstance, _opts, done) => {
  // POST /ai/query：自然语言穿透查询
  app.post(
    "/ai/query",
    { preHandler: [app.authenticate, requirePermission("ai:invoke")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = querySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: "bad_request", message: "query 不能为空", statusCode: 400 });
        return;
      }
      const user = request.user as JwtUser | undefined;
      const result = await naturalLanguageQuery(parsed.data.query, user);
      reply.send(result);
    },
  );

  // POST /ai/contract-review：合同违规条款审查
  app.post(
    "/ai/contract-review",
    { preHandler: [app.authenticate, requirePermission("ai:invoke")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = contractSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: "bad_request", message: "contractText 不能为空", statusCode: 400 });
        return;
      }
      const user = request.user as JwtUser | undefined;
      const result = await contractReview(parsed.data.contractText, user);
      reply.send(result);
    },
  );

  // POST /ai/risk-report：风险处置报告自动生成
  app.post(
    "/ai/risk-report",
    { preHandler: [app.authenticate, requirePermission("ai:invoke")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = reportSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: "bad_request", message: "riskWarningId 不能为空", statusCode: 400 });
        return;
      }
      const user = request.user as JwtUser | undefined;
      const result = await generateRiskReport(parsed.data.riskWarningId, user);
      if (result.error === "not_found") {
        reply.code(404).send({ error: "not_found", message: result.message, statusCode: 404 });
        return;
      }
      reply.send(result);
    },
  );

  // GET /ai/health：AI 适配器健康检查（configured/provider/endpoint 脱敏/latency）
  // 探活会真实调用 LLM（计费 + 占连接），须受 ai:invoke 权限约束，避免任意登录用户刷量 DoS
  app.get(
    "/ai/health",
    { preHandler: [app.authenticate, requirePermission("ai:invoke")] },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const health = getAIHealth();
      let latency: number | null = null;
      if (isAIConfigured()) {
        // 探活：发起一次极简调用测延迟（带 5s 超时，避免上游卡死耗尽连接）
        const startedAt = Date.now();
        const probe = await callLLM("ping", 5000);
        latency = Date.now() - startedAt;
        if (!probe.ok && probe.reason === "error") {
          logger.debug({ latency, error: probe.error }, "AI 健康探活失败");
        }
      }
      reply.send({ ...health, latency });
    },
  );

  // 脱敏策略 CRUD
  app.register(registerSanitizerPolicies);
  // AI 调用日志查询
  app.register(registerAILogs);

  done();
};
