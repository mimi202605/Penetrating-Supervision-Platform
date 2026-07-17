// 调度指挥中心 - 指挥大屏聚合
// GET /dispatch/dashboard → { kpis, heatmap, pendingStats }
// kpis: 对齐 mock bigScreenKpis；"今日新增风险"/"在办工单"从 DB 实时计算，其余 mock 常量保证视觉一致
// heatmap: 对齐 mock riskHeatmap（6 个区域，mock 常量）
// pendingStats: { byNode, byOwner } 从 work_orders 聚合
import type { FastifyPluginCallback, FastifyReply, FastifyRequest } from "fastify";
import { queryAll, queryOne } from "../../db/index.js";

/** KPI 项（对齐 mock bigScreenKpis） */
interface KpiItem {
  label: string;
  value: string;
  trend?: string;
  tone?: "up" | "down";
}

/** 热力图项（对齐 mock riskHeatmap） */
interface HeatmapItem {
  area: string;
  high: number;
  medium: number;
  low: number;
}

/** 待办统计 */
interface PendingStats {
  byNode: { verify: number; rectify: number; review: number; archive: number };
  byOwner: { owner: string; count: number }[];
}

/** 今日日期字符串（YYYY-MM-DD，本地时区，与种子 triggered_at 格式一致） */
function todayDateStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 大屏聚合路由插件 */
export const registerDashboard: FastifyPluginCallback = (app, _opts, done) => {
  // 所有接口需登录
  app.addHook("preHandler", app.authenticate);

  // GET /dispatch/dashboard - 指挥驾驶舱聚合
  app.get("/dispatch/dashboard", async (_req: FastifyRequest, reply: FastifyReply) => {
    // 今日新增风险：按 triggered_at 日期前缀匹配系统今日
    const today = todayDateStr();
    const todayRiskCount =
      queryOne<{ total: number }>(
        "SELECT COUNT(*) AS total FROM risk_warnings WHERE triggered_at LIKE ?",
        [`${today}%`],
      )?.total ?? 0;

    // 在办工单数
    const processingOrders =
      queryOne<{ total: number }>(
        "SELECT COUNT(*) AS total FROM work_orders WHERE status = 'processing'",
      )?.total ?? 0;

    const kpis: KpiItem[] = [
      { label: "在线监管对象", value: "1,286" },
      { label: "今日新增风险", value: String(todayRiskCount), trend: "↑ 8", tone: "up" },
      { label: "在办工单", value: String(processingOrders), trend: "↓ 3", tone: "down" },
      { label: "平均处置时长", value: "4.2h", trend: "↓ 0.3h", tone: "down" },
      { label: "数据采集量", value: "1.28亿" },
      { label: "系统可用性", value: "99.97%" },
    ];

    // 热力图：mock 常量（6 个区域），与前端 riskHeatmap 对齐
    const heatmap: HeatmapItem[] = [
      { area: "北京总部", high: 5, medium: 12, low: 8 },
      { area: "上海板块", high: 3, medium: 9, low: 6 },
      { area: "雄安板块", high: 7, medium: 14, low: 5 },
      { area: "华南区域", high: 2, medium: 6, low: 4 },
      { area: "西南区域", high: 4, medium: 8, low: 3 },
      { area: "境外单位", high: 6, medium: 11, low: 2 },
    ];

    // 按节点聚合工单数
    const nodeRows = queryAll<{ current_node: string; count: number }>(
      "SELECT current_node, COUNT(*) AS count FROM work_orders GROUP BY current_node",
    );
    const byNode = { verify: 0, rectify: 0, review: 0, archive: 0 };
    for (const r of nodeRows) {
      if (r.current_node === "verify") byNode.verify = r.count;
      else if (r.current_node === "rectify") byNode.rectify = r.count;
      else if (r.current_node === "review") byNode.review = r.count;
      else if (r.current_node === "archive") byNode.archive = r.count;
    }

    // 按责任人聚合在办工单数
    const ownerRows = queryAll<{ owner: string; count: number }>(
      "SELECT owner, COUNT(*) AS count FROM work_orders WHERE status = 'processing' GROUP BY owner ORDER BY count DESC, owner ASC",
    );
    const byOwner = ownerRows
      .filter((r) => r.owner !== null)
      .map((r) => ({ owner: r.owner as string, count: r.count }));

    const pendingStats: PendingStats = { byNode, byOwner };

    reply.send({ kpis, heatmap, pendingStats });
  });

  done();
};
