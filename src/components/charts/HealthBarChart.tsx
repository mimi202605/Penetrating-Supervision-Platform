import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { HealthBar } from "@/api/types";

interface HealthBarChartProps {
  data: HealthBar[];
  height?: number;
}

export default function HealthBarChart({ data, height = 220 }: HealthBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 28, bottom: 4, left: 8 }}
      >
        <CartesianGrid
          stroke="var(--color-border-light)"
          horizontal={false}
        />
        <XAxis
          type="number"
          domain={[0, 100]}
          tick={{ fontSize: 10, fill: "var(--color-on-surface-variant)" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 12, fill: "var(--color-foreground)" }}
          axisLine={false}
          tickLine={false}
          width={72}
        />
        <Tooltip
          cursor={{ fill: "var(--state-hover)" }}
          contentStyle={{
            background: "var(--color-popover)",
            border: "1px solid var(--color-border)",
            borderRadius: 4,
            fontSize: 12,
          }}
          labelStyle={{ color: "var(--color-foreground)" }}
          itemStyle={{ color: "var(--color-foreground)" }}
        />
        <Bar dataKey="value" radius={[4, 4, 4, 4]} barSize={18}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.color} />
          ))}
          <LabelList
            dataKey="value"
            position="right"
            style={{
              fontSize: 11,
              fontWeight: 600,
              fill: "var(--color-foreground)",
            }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
