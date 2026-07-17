// 调度指挥中心 - 路由汇总注册
// 由 Task 8 在 /api/v1 前缀下挂载 registerDispatchRoutes
// listeners 不是路由，单独导出 registerDispatchListeners 供 main.ts 调用
import type { FastifyPluginCallback } from "fastify";
import { registerWorkOrders } from "./work-orders.js";
import { registerDashboard } from "./dashboard.js";

export { registerDispatchListeners } from "./listeners.js";
export { advanceWorkOrder, markOverdue, NODE_ORDER, PROGRESS_BY_NODE } from "./workflow.js";

/** 汇总注册调度指挥中心所有路由 */
export const registerDispatchRoutes: FastifyPluginCallback = (app, _opts, done) => {
  app.register(registerWorkOrders);
  app.register(registerDashboard);
  done();
};
