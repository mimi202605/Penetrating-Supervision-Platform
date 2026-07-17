// 网关中台：统一限流、CORS、请求 ID 注入、请求计数、统一错误处理（APISIX 等价）
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import corsPlugin from "@fastify/cors";
import rateLimitPlugin from "@fastify/rate-limit";
import { config } from "../../config.js";
import { logger } from "../../utils/logger.js";
import { incHttp } from "../../health.js";

/** 解析 CORS 来源配置：* 或逗号分隔列表 */
function parseOrigins(origin: string): string | string[] {
  if (origin === "*" || origin === "") return "*";
  const list = origin.split(",").map((s) => s.trim()).filter(Boolean);
  return list.length ? list : "*";
}

/**
 * 注册网关能力：CORS、限流、请求 ID、请求计数、统一错误处理
 * 须在业务路由注册前调用
 */
export async function setupGateway(app: FastifyInstance): Promise<void> {
  // CORS
  await app.register(corsPlugin, {
    origin: parseOrigins(config.corsOrigin),
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });

  // 限流：单 IP 每分钟 120 次
  await app.register(rateLimitPlugin, {
    max: config.rateLimitMax,
    timeWindow: config.rateLimitWindow,
    errorResponseBuilder: (_req, context) => ({
      error: "too_many_requests",
      message: `请求过于频繁，每 ${context.after} 限 ${context.max} 次`,
      statusCode: 429,
    }),
  });

  // 请求 ID 与计数：每个响应注入 x-request-id 并累加 http_requests_total
  app.addHook("onResponse", async (request: FastifyRequest, reply: FastifyReply) => {
    incHttp();
    reply.header("x-request-id", request.id);
  });

  // 请求日志
  app.addHook("onResponse", async (request: FastifyRequest, reply: FastifyReply) => {
    logger.info(
      {
        reqId: request.id,
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
      },
      "请求完成",
    );
  });

  // 统一错误处理
  app.setErrorHandler((err: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    const statusCode = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    // 限流错误
    if (statusCode === 429) {
      reply.code(429).send({
        error: "too_many_requests",
        message: err.message,
        statusCode: 429,
      });
      return;
    }
    if (statusCode >= 500) {
      logger.error({ err, reqId: request.id }, "服务端异常");
    }
    reply.code(statusCode).send({
      error: err.code || "error",
      message: statusCode >= 500 ? "服务端内部错误" : err.message,
      statusCode,
    });
  });

  // 404 处理
  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({
      error: "not_found",
      message: `路径不存在: ${request.method} ${request.url}`,
      statusCode: 404,
    });
  });
}
