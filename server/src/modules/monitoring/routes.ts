// 智慧监督中心路由汇总：注册 analytics / risk-warnings / rules / graph / penetration
import type { FastifyInstance, FastifyPluginCallback } from "fastify";
import { registerMonitoringOverview } from "./analytics.js";
import { registerRiskWarnings } from "./risk-warnings.js";
import { registerRules } from "./rules.js";
import { registerGraph } from "./graph.js";
import { registerPenetration } from "./penetration.js";

/** 智慧监督中心路由汇总插件 */
export const registerMonitoringRoutes: FastifyPluginCallback = (app: FastifyInstance, _opts, done) => {
  app.register(registerMonitoringOverview);
  app.register(registerRiskWarnings);
  app.register(registerRules);
  app.register(registerGraph);
  app.register(registerPenetration);
  done();
};
