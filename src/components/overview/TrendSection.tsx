import RiskTrendChart, { RiskTrendLegend } from "@/components/charts/RiskTrendChart";
import RiskDoughnutChart, { DoughnutLegend } from "@/components/charts/RiskDoughnutChart";
import HealthBarChart from "@/components/charts/HealthBarChart";
import type { TrendPoint, DoughnutSlice, HealthBar } from "@/api/types";

interface TrendSectionProps {
  trend: TrendPoint[];
  doughnut: DoughnutSlice[];
  healthBars: HealthBar[];
  totalRisk: number;
}

export default function TrendSection({
  trend,
  doughnut,
  healthBars,
  totalRisk,
}: TrendSectionProps) {
  return (
    <section className="flex flex-col">
      <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
        <h2 className="ds-section-title">监管态势分析</h2>
        <RiskTrendLegend />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 折线 */}
        <div className="ds-card flex flex-col">
          <div
            className="text-lead font-medium mb-3"
            style={{ color: "var(--color-foreground)" }}
          >
            风险趋势（近30天）
          </div>
          <RiskTrendChart data={trend} />
        </div>

        {/* 环形 */}
        <div className="ds-card flex flex-col">
          <div
            className="text-lead font-medium mb-3"
            style={{ color: "var(--color-foreground)" }}
          >
            风险类型分布
          </div>
          <RiskDoughnutChart
            data={doughnut}
            centerNum={totalRisk}
            centerLabel="风险总数"
          />
          <DoughnutLegend data={doughnut} />
        </div>

        {/* 横向柱状 */}
        <div className="ds-card flex flex-col">
          <div
            className="text-lead font-medium mb-3"
            style={{ color: "var(--color-foreground)" }}
          >
            全级次组织健康度
          </div>
          <HealthBarChart data={healthBars} />
        </div>
      </div>
    </section>
  );
}
