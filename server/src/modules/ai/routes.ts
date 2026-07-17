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
import { sanitizeForAI } from "./sanitizer.js";
import { getEnabledPolicies } from "./sanitizer-policies.js";
import { listAgents, getAgent } from "./agents/registry.js";
import { infoExtract, type InfoExtractInput } from "./agents/info-extract.js";
import { textCompare, type TextCompareInput } from "./agents/text-compare.js";
import { reportGenerate, type ReportGenerateInput } from "./agents/report-generate.js";
import { orchestrate, getWorkflow } from "./agents/orchestrator.js";
import { logger } from "../../utils/logger.js";

const querySchema = z.object({ query: z.string().min(1) });
const contractSchema = z.object({ contractText: z.string().min(1) });
const reportSchema = z.object({ riskWarningId: z.string().min(1) });

// 智能体调用入参校验 schema（按 agent id 区分）
const infoExtractSchema = z.object({
  text: z.string().min(1),
  fields: z.array(z.string()).optional(),
  sceneId: z.string().optional(),
});
const textCompareSchema = z.object({
  textA: z.string().min(1),
  textB: z.string().min(1),
  mode: z.enum(["cosine", "diff", "both"]).optional(),
});
const reportGenerateSchema = z.object({
  clueIds: z.array(z.string().min(1)).min(1),
  template: z.string().optional(),
  sceneId: z.string().optional(),
});
const orchestrateSchema = z.object({
  workflow: z.string().min(1),
  input: z.record(z.unknown()),
});

/** 取指定 agent id 的入参校验 schema（仅 implemented 的 3 个有 schema） */
function invokeSchemaFor(id: string): z.ZodTypeAny {
  switch (id) {
    case "info-extract":
      return infoExtractSchema;
    case "text-compare":
      return textCompareSchema;
    case "report-generate":
      return reportGenerateSchema;
    default:
      return z.never();
  }
}

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

  // ===================== AI 智能体编排（Task 19.6 + 19.7） =====================

  // GET /ai/agents：列出全部智能体 spec
  app.get(
    "/ai/agents",
    { preHandler: [app.authenticate, requirePermission("ai:invoke")] },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      reply.send({ list: listAgents() });
    },
  );

  // GET /ai/agents/:id：取单个智能体 spec，未找到 404
  app.get(
    "/ai/agents/:id",
    { preHandler: [app.authenticate, requirePermission("ai:invoke")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const agent = getAgent(id);
      if (!agent) {
        reply
          .code(404)
          .send({ error: "not_found", message: `智能体不存在: ${id}`, statusCode: 404 });
        return;
      }
      reply.send(agent);
    },
  );

  // POST /ai/agents/orchestrate：工作流编排（注册在 :id/invoke 之前，避免被参数路由吞掉）
  app.post(
    "/ai/agents/orchestrate",
    { preHandler: [app.authenticate, requirePermission("ai:invoke")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = orchestrateSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({
          error: "bad_request",
          message: parsed.error.issues[0]?.message ?? "入参校验失败",
          statusCode: 400,
        });
        return;
      }
      // 工作流不存在 404
      if (!getWorkflow(parsed.data.workflow)) {
        reply.code(404).send({
          error: "not_found",
          message: `工作流不存在: ${parsed.data.workflow}`,
          statusCode: 404,
        });
        return;
      }
      const user = request.user as JwtUser | undefined;
      const result = await orchestrate(
        { workflow: parsed.data.workflow, input: parsed.data.input },
        { id: user?.id, role: user?.role },
      );
      reply.send(result);
    },
  );

  // POST /ai/agents/:id/invoke：调用智能体（强制 sanitizeForAI 预处理入参后再传入 agent）
  app.post(
    "/ai/agents/:id/invoke",
    { preHandler: [app.authenticate, requirePermission("ai:invoke")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const agent = getAgent(id);
      if (!agent) {
        reply
          .code(404)
          .send({ error: "not_found", message: `智能体不存在: ${id}`, statusCode: 404 });
        return;
      }
      // 未实现 agent 返回 501
      if (!agent.implemented) {
        reply.code(501).send({
          error: "not_implemented",
          message: `智能体尚未实现: ${id}`,
          statusCode: 501,
        });
        return;
      }
      const user = request.user as JwtUser | undefined;
      // 按 agent id 校验入参，失败 400
      const parsed = invokeSchemaFor(id).safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({
          error: "bad_request",
          message: parsed.error.issues[0]?.message ?? "入参校验失败",
          statusCode: 400,
        });
        return;
      }
      // 强制对 body 整体脱敏后再传入 agent（spec 要求的"强制 sanitizeForAI 预处理入参"）
      // agent 内部也会脱敏 payload，此处为路由层强制预脱敏
      const sanitizedBody = sanitizeForAI(parsed.data, getEnabledPolicies(), {
        operator: user?.id ?? null,
        role: user?.role ?? null,
      });
      const agentUser = { id: user?.id, role: user?.role };
      try {
        if (id === "info-extract") {
          const result = await infoExtract(sanitizedBody as InfoExtractInput, agentUser);
          reply.send(result);
          return;
        }
        if (id === "text-compare") {
          const result = await textCompare(sanitizedBody as TextCompareInput, agentUser);
          reply.send(result);
          return;
        }
        if (id === "report-generate") {
          const result = await reportGenerate(sanitizedBody as ReportGenerateInput, agentUser);
          // clueIds 全部查不到 → 404（路由层处理）
          if (result.clueCount === 0) {
            reply.code(404).send({
              error: "not_found",
              message: result.message ?? "未查询到任何风险线索",
              statusCode: 404,
            });
            return;
          }
          reply.send(result);
          return;
        }
        // 兜底：已 implemented 但未在路由分发（理论上不会到这）
        reply
          .code(501)
          .send({ error: "not_implemented", message: `智能体尚未实现: ${id}`, statusCode: 501 });
      } catch (err) {
        reply
          .code(500)
          .send({ error: "internal", message: (err as Error).message, statusCode: 500 });
      }
    },
  );

  // 脱敏策略 CRUD
  app.register(registerSanitizerPolicies);
  // AI 调用日志查询
  app.register(registerAILogs);

  done();
};
