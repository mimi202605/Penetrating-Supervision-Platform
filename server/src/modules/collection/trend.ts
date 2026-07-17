// 数据采集中心 - 近 30 天双折线趋势
// 与 src/mock/index.ts 的 collectionTrend 算法完全一致，保证视觉一致
// 锚点 2026-07-16，倒推 30 天，investment/finance/financial/compliance 四系列
import type { FastifyPluginAsync } from "fastify";

/** 趋势点（与前端 TrendPoint 契约一致） */
interface TrendPoint {
  date: string; // MM-DD
  investment: number;
  finance: number;
  financial: number;
  compliance: number;
}

/** 生成近 30 天采集趋势（锚点 2026-07-16，与 mock 算法一致） */
function generateCollectionTrend(): TrendPoint[] {
  const arr: TrendPoint[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(2026, 6, 16); // 2026-07-16（月份 0 索引）
    d.setDate(d.getDate() - i);
    const label = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    arr.push({
      date: label,
      investment: 8 + Math.round(Math.sin(i / 3) * 3) + (i % 5),
      finance: 12 + Math.round(Math.cos(i / 4) * 4) + (i % 4),
      financial: 6 + Math.round(Math.sin(i / 5) * 2) + (i % 3),
      compliance: 3 + (i % 3),
    });
  }
  return arr;
}

/** 注册采集趋势路由 */
export const registerCollectionTrend: FastifyPluginAsync = async (app, _opts) => {
  app.addHook("preHandler", app.authenticate);

  // GET /collection/trend - 近 30 天双折线趋势，返回 TrendPoint[]
  app.get("/collection/trend", async (_request, reply) => {
    reply.send(generateCollectionTrend());
  });
};
