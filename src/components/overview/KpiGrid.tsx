import { ShieldCheck, Layers, AlertTriangle, ClipboardList, Database } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCountUp } from "@/hooks/useCountUp";
import StatusTag, { type TagTone } from "@/components/ui/StatusTag";
import type { KpiSnapshot } from "@/api/types";

interface KpiGridProps {
  data: KpiSnapshot;
}

interface KpiCardDef {
  icon: LucideIcon;
  label: string;
  value: number;
  unit?: string;
  decimals?: number;
  trend: { text: string; tone: TagTone };
}

function buildCards(data: KpiSnapshot): KpiCardDef[] {
  return [
    {
      icon: ShieldCheck,
      label: "监管覆盖率",
      value: data.coverageRate,
      unit: "%",
      decimals: 1,
      trend: { text: `↑ ${data.coverageDelta}pt`, tone: "success" },
    },
    {
      icon: Layers,
      label: "穿透层级",
      value: data.penetrationLevel,
      unit: "级",
      decimals: 0,
      trend: { text: data.penetrationTag, tone: "success" },
    },
    {
      icon: AlertTriangle,
      label: "风险预警（本月）",
      value: data.riskCount,
      decimals: 0,
      trend: { text: data.riskDelta, tone: "error" },
    },
    {
      icon: ClipboardList,
      label: "待处置工单",
      value: data.pendingOrders,
      decimals: 0,
      trend: { text: data.pendingDelta, tone: "warning" },
    },
    {
      icon: Database,
      label: "数据采集量",
      value: data.dataVolume,
      unit: "亿条",
      decimals: 2,
      trend: { text: data.dataVolumeDelta, tone: "success" },
    },
  ];
}

function KpiCard({ def }: { def: KpiCardDef }) {
  const Icon = def.icon;
  const animated = useCountUp(def.value, 700);
  const display = animated.toFixed(def.decimals ?? 0);

  return (
    <div className="ds-card flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div
          className="w-8 h-8 rounded-sm flex items-center justify-center flex-shrink-0"
          style={{
            background: "var(--color-primary-container)",
            color: "var(--color-primary)",
          }}
        >
          <Icon size={16} strokeWidth={1.5} />
        </div>
        <span
          className="text-body"
          style={{ color: "var(--color-on-surface-variant)" }}
        >
          {def.label}
        </span>
      </div>
      <div className="flex items-baseline gap-0.5">
        <span
          className="text-[26px] font-semibold leading-none"
          style={{ color: "var(--color-foreground)" }}
        >
          {display}
        </span>
        {def.unit ? (
          <span
            className="text-lead ml-0.5"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
            {def.unit}
          </span>
        ) : null}
      </div>
      <StatusTag tone={def.trend.tone}>{def.trend.text}</StatusTag>
    </div>
  );
}

export default function KpiGrid({ data }: KpiGridProps) {
  const cards = buildCards(data);
  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
      {cards.map((c) => (
        <KpiCard key={c.label} def={c} />
      ))}
    </section>
  );
}
