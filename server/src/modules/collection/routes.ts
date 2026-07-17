// 数据采集中心 - 路由汇总注册
// 由 Task 8 在 /api/v1 前缀下挂载 registerCollectionRoutes
import type { FastifyPluginAsync } from "fastify";
import { registerCollectionSources } from "./sources.js";
import { registerCollectionTasks } from "./tasks.js";
import { registerCollectionOverview } from "./overview.js";
import { registerCollectionTrend } from "./trend.js";

/** 汇总注册数据采集中心所有路由 */
export const registerCollectionRoutes: FastifyPluginAsync = async (app, _opts) => {
  await app.register(registerCollectionSources);
  await app.register(registerCollectionTasks);
  await app.register(registerCollectionOverview);
  await app.register(registerCollectionTrend);
};
