import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { TrendPoint } from "@/api/types";

interface RiskTrendChartProps {
  data: TrendPoint[];
  height?: number;
}

const series = [
  { key: "investment", name: "投资领域", color: "#387bff" },
  { key: "finance", name: "财务领域", color: "#f0a50f" },
  { key: "financial", name: "金融风险", color: "#ff706d" },
  { key: "compliance", name: "合规领域", color: "#86909c" },
] as const;

export default function RiskTrendChart({ data, height = 220 }: RiskTrendChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
        <CartesianGrid stroke="var(--color-border-light)" strokeDasharray="0" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: "var(--color-on-surface-variant)" }}
          axisLine={false}
          tickLine={false}
          minTickGap={24}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "var(--color-on-surface-variant)" }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip
          cursor={{ stroke: "var(--color-border)", strokeWidth: 1 }}
          contentStyle={{
            background: "var(--color-popover)",
            border: "1px solid var(--color-border)",
            borderRadius: 4,
            fontSize: 12,
          }}
          labelStyle={{ color: "var(--color-foreground)" }}
          itemStyle={{ color: "var(--color-foreground)" }}
        />
        {series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.name}
            stroke={s.color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0 }}
            fill={s.color}
            fillOpacity={s.key === "investment" ? 0.08 : 0}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function RiskTrendLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {series.map((s) => (
        <span
          key={s.key}
          className="flex items-center gap-1.5 text-body"
          style={{ color: "var(--color-on-surface-variant)" }}
        >
          <span
            className="w-2 h-2 rounded-sm"
            style={{ background: s.color }}
          />
          {s.name}
        </span>
      ))}
    </div>
  );
}
