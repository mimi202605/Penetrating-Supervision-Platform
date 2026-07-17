// 数据采集中心 - 采集 KPI 概览
// 返回 {sources, todayVolume, exceptions, health, healthTone, bySource:[{source,count}]}
import type { FastifyPluginAsync } from "fastify";
import { queryAll, queryOne } from "../../db/index.js";

/** 模拟今日采集量（基准 1.28 亿，随天数小幅波动，保持视觉一致） */
function simulateTodayVolume(): string {
  const day = new Date().getDate();
  const volume = (1.2 + (day % 10) * 0.02).toFixed(2);
  return `${volume}亿`;
}

/** 注册采集概览路由 */
export const registerCollectionOverview: FastifyPluginAsync = async (app, _opts) => {
  app.addHook("preHandler", app.authenticate);

  // GET /collection/overview - 采集 KPI 概览
  app.get("/collection/overview", async (_request, reply) => {
    const sources = queryOne<{ total: number }>(
      "SELECT COUNT(*) AS total FROM data_sources",
    )?.total ?? 0;
    const errorSources = queryOne<{ total: number }>(
      "SELECT COUNT(*) AS total FROM data_sources WHERE status != 'online'",
    )?.total ?? 0;
    const exceptions = queryOne<{ total: number }>(
      "SELECT COUNT(*) AS total FROM data_quality_issues WHERE DATE(created_at) = DATE('now')",
    )?.total ?? 0;
    const todayVolume = simulateTodayVolume();
    // 健康度：满分 100，每个异常源 -3，每个质量问题 -2
    const health = Math.max(0, 100 - errorSources * 3 - exceptions * 2);
    const healthTone: "success" | "warning" | "danger" =
      health >= 95 ? "success" : health >= 80 ? "warning" : "danger";
    const bySourceRows = queryAll<{ source: string; count: number }>(
      "SELECT source, COUNT(*) AS count FROM collection_tasks GROUP BY source",
    );
    reply.send({
      sources,
      todayVolume,
      exceptions,
      health,
      healthTone,
      bySource: bySourceRows.map((r) => ({ source: r.source, count: r.count })),
    });
  });
};
