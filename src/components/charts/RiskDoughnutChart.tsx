import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { DoughnutSlice } from "@/api/types";

interface RiskDoughnutChartProps {
  data: DoughnutSlice[];
  centerNum?: string | number;
  centerLabel?: string;
  height?: number;
}

export default function RiskDoughnutChart({
  data,
  centerNum,
  centerLabel,
  height = 168,
}: RiskDoughnutChartProps) {
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius="58%"
            outerRadius="86%"
            paddingAngle={2}
            stroke="none"
          >
            {data.map((s, i) => (
              <Cell key={i} fill={s.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: "var(--color-popover)",
              border: "1px solid var(--color-border)",
              borderRadius: 4,
              fontSize: 12,
            }}
            labelStyle={{ color: "var(--color-foreground)" }}
            itemStyle={{ color: "var(--color-foreground)" }}
          />
        </PieChart>
      </ResponsiveContainer>
      {centerNum !== undefined ? (
        <div
          className="absolute pointer-events-none text-center"
          style={{ top: "46%", left: "50%", transform: "translate(-50%, -50%)" }}
        >
          <span
            className="block text-[22px] font-semibold leading-none"
            style={{ color: "var(--color-foreground)" }}
          >
            {centerNum}
          </span>
          {centerLabel ? (
            <span
              className="block text-caption mt-1"
              style={{ color: "var(--color-on-surface-variant)" }}
            >
              {centerLabel}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function DoughnutLegend({
  data,
}: {
  data: DoughnutSlice[];
}) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
      {data.map((s) => (
        <span
          key={s.name}
          className="flex items-center gap-1.5 text-body"
          style={{ color: "var(--color-on-surface-variant)" }}
        >
          <span
            className="w-2 h-2 rounded-sm"
            style={{ background: s.color }}
          />
          {s.name}
          <span
            className="font-medium"
            style={{ color: "var(--color-foreground)" }}
          >
            {s.value}
          </span>
        </span>
      ))}
    </div>
  );
}
