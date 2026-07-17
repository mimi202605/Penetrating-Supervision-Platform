// 已有 src/lib/utils.ts 提供 cn()，这里补充业务格式化函数

export const formatNumber = (n: number): string => n.toLocaleString("zh-CN");

/** 给数字加千分位 */
export const withComma = (n: number): string => n.toLocaleString("en-US");

/** 截断浮点数 */
export const round = (n: number, digits = 1): number => {
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
};

/** 风险级别中文 */
export const levelText = (lvl: "high" | "medium" | "low"): string =>
  lvl === "high" ? "高" : lvl === "medium" ? "中" : "低";

/** 状态中文 */
export const statusText = (s: "pending" | "processing" | "resolved"): string =>
  s === "pending" ? "待处置" : s === "processing" ? "处理中" : "已处置";

/** 工单节点中文 */
export const nodeText = (n: "verify" | "rectify" | "review" | "archive"): string =>
  ({ verify: "核查", rectify: "整改", review: "复核", archive: "归档" } as const)[n];
