import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import PageContainer from "@/components/layout/PageContainer";
import StatusTag from "@/components/ui/StatusTag";
import MissionBanner from "@/components/overview/MissionBanner";
import PenetrationBar from "@/components/overview/PenetrationBar";
import KpiGrid from "@/components/overview/KpiGrid";
import CenterGrid from "@/components/overview/CenterGrid";
import DomainGrid from "@/components/overview/DomainGrid";
import FrameworkRow from "@/components/overview/FrameworkRow";
import RiskCatalog from "@/components/overview/RiskCatalog";
import GuaranteeSection from "@/components/overview/GuaranteeSection";
import TrendSection from "@/components/overview/TrendSection";
import RiskWarningTable from "@/components/overview/RiskWarningTable";
import WorkOrderTable from "@/components/overview/WorkOrderTable";
import { api } from "@/api";
import * as mock from "@/mock";
import type {
  KpiSnapshot,
  CenterStatus,
  DomainRisk,
  FrameworkItem,
  RiskPill,
  RiskWarning,
  WorkOrder,
  TrendPoint,
  DoughnutSlice,
  HealthBar,
} from "@/api/types";
import { cn } from "@/lib/utils";

export default function OverviewPage() {
  const navigate = useNavigate();
  const [refreshing, setRefreshing] = useState(false);

  const [kpi, setKpi] = useState<KpiSnapshot>(mock.kpiSnapshot);
  const [centers, setCenters] = useState<CenterStatus[]>(mock.centers);
  const [domains, setDomains] = useState<DomainRisk[]>(mock.domains);
  const [systems, setSystems] = useState<FrameworkItem[]>(mock.frameworkSystems);
  const [strengths, setStrengths] = useState<FrameworkItem[]>(mock.frameworkStrengths);
  const [riskCatalog, setRiskCatalog] = useState<RiskPill[]>(mock.riskCatalog);
  const [guarantees] = useState(mock.guarantees);
  const [trend, setTrend] = useState<TrendPoint[]>(mock.collectionTrend);
  const [doughnut, setDoughnut] = useState<DoughnutSlice[]>(mock.doughnutSlices);
  const [healthBars, setHealthBars] = useState<HealthBar[]>(mock.healthBars);
  const [risks, setRisks] = useState<RiskWarning[]>(mock.riskWarnings);
  const [orders, setOrders] = useState<WorkOrder[]>(mock.workOrders);

  const loadAll = async () => {
    const [
      k, c, d, sys, str, rc, tr, dn, hb, rs, wo,
    ] = await Promise.all([
      api.getKpiSnapshot(),
      api.getCenters(),
      api.getDomains(),
      Promise.resolve(mock.frameworkSystems),
      Promise.resolve(mock.frameworkStrengths),
      api.getRiskCatalog(),
      api.getCollectionTrend(),
      api.getDoughnut(),
      api.getHealthBars(),
      api.getRiskWarnings(),
      api.getWorkOrders(),
    ]);
    setKpi(k);
    setCenters(c);
    setDomains(d);
    setSystems(sys);
    setStrengths(str);
    setRiskCatalog(rc);
    setTrend(tr);
    setDoughnut(dn);
    setHealthBars(hb);
    setRisks(rs);
    setOrders(wo);
  };

  // 首次加载
  useEffect(() => {
    loadAll().catch((err) => {
      // 静默失败时保留 mock 兜底数据，避免首屏白屏
      // eslint-disable-next-line no-console
      console.error("[OverviewPage] 首次加载失败，使用兜底数据", err);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await loadAll();
    } catch (err) {
      // 刷新失败不影响已有数据展示，仅记录日志
      // eslint-disable-next-line no-console
      console.error("[OverviewPage] 刷新失败", err);
    } finally {
      // 无论成功失败都要恢复按钮状态，避免永久禁用
      setTimeout(() => setRefreshing(false), 500);
    }
  };

  const onRiskClick = (r: RiskWarning) => {
    navigate(`/monitoring/risk-warnings?id=${r.id}`);
  };

  return (
    <PageContainer
      title="监管总览"
      subtitle="智能化穿透式监管体系 · 一平台三中心"
      breadcrumb="监管总览"
      actions={
        <>
          <StatusTag tone="success" dot>
            系统运行正常
          </StatusTag>
          <button
            type="button"
            onClick={onRefresh}
            className="ds-btn ds-btn-secondary"
            aria-label="刷新"
          >
            <RefreshCw
              size={14}
              className={cn(refreshing && "animate-spin-once")}
            />
            刷新
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <MissionBanner />
        <PenetrationBar />
        <KpiGrid data={kpi} />
        <CenterGrid data={centers} />
        <DomainGrid data={domains} />
        <FrameworkRow systems={systems} strengths={strengths} />
        <RiskCatalog data={riskCatalog} />
        <GuaranteeSection data={guarantees} />
        <TrendSection
          trend={trend}
          doughnut={doughnut}
          healthBars={healthBars}
          totalRisk={kpi.riskCount}
        />
        <RiskWarningTable data={risks.slice(0, 6)} onRowClick={onRiskClick} />
        <WorkOrderTable data={orders} />
      </div>
    </PageContainer>
  );
}
