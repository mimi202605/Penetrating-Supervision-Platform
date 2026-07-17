// API 调用层：本期直接返回 mock 数据，后续对接真实后端时仅替换实现
import * as mock from "@/mock";
import type { RiskWarning, WorkOrder, RiskStatus, RiskLevel } from "@/api/types";

export interface RiskFilter {
  level?: RiskLevel | "all";
  status?: RiskStatus | "all";
  domain?: string | "all";
  keyword?: string;
}

const delay = <T>(data: T, ms = 80): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(data), ms));

export const api = {
  getKpiSnapshot: () => delay(mock.kpiSnapshot),
  getCenters: () => delay(mock.centers),
  getDomains: () => delay(mock.domains),
  getRiskCatalog: () => delay(mock.riskCatalog),
  getRiskWarnings: (filter: RiskFilter = {}) =>
    delay(
      mock.riskWarnings.filter((r) => {
        if (filter.level && filter.level !== "all" && r.level !== filter.level) return false;
        if (filter.status && filter.status !== "all" && r.status !== filter.status) return false;
        if (filter.domain && filter.domain !== "all" && r.domain !== filter.domain) return false;
        if (filter.keyword) {
          const kw = filter.keyword.toLowerCase();
          const text = `${r.title} ${r.subject} ${r.rule}`.toLowerCase();
          if (!text.includes(kw)) return false;
        }
        return true;
      }) as RiskWarning[],
    ),
  getWorkOrders: () => delay(mock.workOrders as WorkOrder[]),
  getCollectionTasks: () => delay(mock.collectionTasks),
  getDataSources: () => delay(mock.dataSources),
  getCollectionTrend: () => delay(mock.collectionTrend),
  getGraph: () => delay({ nodes: mock.graphNodes, edges: mock.graphEdges }),
  getDoughnut: () => delay(mock.doughnutSlices),
  getHealthBars: () => delay(mock.healthBars),
  getFinanceRisks: () => delay(mock.financeRiskCards),
  getFinanceTrend: () => delay(mock.financeTrend),
  getBigScreenKpis: () => delay(mock.bigScreenKpis),
  getRiskHeatmap: () => delay(mock.riskHeatmap),
  getPenetrationTree: () => delay(mock.penetrationTree),
};
