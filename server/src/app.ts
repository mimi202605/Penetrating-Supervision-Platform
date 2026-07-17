// Fastify 应用装配：网关、鉴权、健康检查、审计中间件、统一前缀 /api/v1
import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { config } from "./config.js";
import { setupGateway } from "./modules/platform/gateway.js";
import { setupAuth, registerAuthRoutes } from "./modules/platform/auth.js";
import { auditMiddleware } from "./modules/platform/audit.js";
import { registerHealthRoutes } from "./health.js";
import { registerMonitoringRoutes } from "./modules/monitoring/routes.js";
import { registerAIRoutes } from "./modules/ai/routes.js";
import { registerCollectionRoutes } from "./modules/collection/routes.js";
import { registerDispatchRoutes } from "./modules/dispatch/routes.js";
import { registerRegulatoryRoutes } from "./modules/regulatory/routes.js";
import { registerRiskRoutes } from "./modules/risk/routes.js";
import { registerSystemRoutes } from "./modules/system/routes.js";
import { loadEnabledPolicies } from "./modules/ai/sanitizer-policies.js";
import { logger } from "./utils/logger.js";

/**
 * 构建并返回 Fastify 实例（不启动监听）
 * 注册顺序：网关能力 → 鉴权装饰 → 健康检查 → 审计中间件 → /api/v1 业务路由
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false, // 使用自定义 pino 日志（utils/logger.ts）避免重复
    // 请求 ID：优先读取 x-request-id 头，否则生成 UUID
    genReqId: (req) => {
      const header = req.headers["x-request-id"];
      if (typeof header === "string" && header.length > 0) return header;
      return randomUUID();
    },
    trustProxy: true,
  });

  // 1. 网关：CORS、限流、请求 ID 响应头、请求计数、统一错误处理、404
  await setupGateway(app);

  // 2. 鉴权：注册 @fastify/jwt + authenticate 装饰器
  await setupAuth(app);

  // 3. 健康检查与指标（不在 /api/v1 前缀下，便于探活）
  app.register(registerHealthRoutes);

  // 4. 审计中间件：处置类请求自动落审计
  app.addHook("onResponse", auditMiddleware());

  // 5. 统一前缀 /api/v1 下的业务路由（一平台三中心 + AI 网关 + 系统模块）
  app.register(
    async (scope) => {
      // 鉴权路由（登录/登出）
      scope.register(registerAuthRoutes);
      // 数据采集中心（Task 4）
      scope.register(registerCollectionRoutes);
      // 智慧监督中心（Task 5）
      scope.register(registerMonitoringRoutes);
      // 调度指挥中心（Task 6）
      scope.register(registerDispatchRoutes);
      // 监管场景与模型 registry（V2 Task 12）
      scope.register(registerRegulatoryRoutes);
      // 风险闭环运营（V2 Task 14）
      scope.register(registerRiskRoutes);
      // 人工智能与数据脱敏（Task 10）
      scope.register(registerAIRoutes);
      // 系统模块：审计日志 + 系统设置（Task 8）
      scope.register(registerSystemRoutes);
    },
    { prefix: "/api/v1" },
  );

  // 6. 启动时加载脱敏策略到内存（供 sanitizeForAI 使用）
  // 注：main.ts 中亦按 spec 顺序在 initDb 后调用，此处保留以保障 buildApp 自包含
  try {
    loadEnabledPolicies();
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "启动加载脱敏策略失败（DB 可能未就绪，将在首次调用时懒加载）");
  }

  logger.info("Fastify 应用装配完成");
  return app;
}
