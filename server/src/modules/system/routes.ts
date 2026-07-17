// 系统模块 - 路由汇总注册
// 由 Task 8 在 /api/v1 前缀下挂载 registerSystemRoutes
import type { FastifyPluginAsync } from "fastify";
import { registerSystemAudit } from "./audit.js";
import { registerSystemSettings } from "./settings.js";

/** 汇总注册系统模块所有路由 */
export const registerSystemRoutes: FastifyPluginAsync = async (app, _opts) => {
  await app.register(registerSystemAudit);
  await app.register(registerSystemSettings);
};
