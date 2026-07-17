import { useEffect, useState } from "react";
import {
  Database, ShieldCheck, Clock, Cpu, Activity, Server, AlertTriangle,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area,
} from "recharts";
import AdminPageContainer from "@/components/layout/AdminPageContainer";
import Card from "@/components/ui/Card";
import Progress from "@/components/ui/Progress";
import StatusTag, { type TagTone } from "@/components/ui/StatusTag";
import { api } from "@/api";
import type { CockpitKpi, AlertSeverity } from "@/api/types";

// 严重度映射（用于告警摘要卡片）
const severityMeta: Record<AlertSeverity, { label: string; tone: TagTone }> = {
  red: { label: "严重", tone: "error" },
  orange: { label: "高", tone: "warning" },
  yellow: { label: "中", tone: "info" },
};
// 模块健康度 tone 映射
const healthToneMap: Record<"success" | "warning" | "danger", { tag: TagTone; label: string; progress: "success" | "warning" | "danger" }> = {
  success: { tag: "success", label: "健康", progress: "success" },
  warning: { tag: "warning", label: "告警", progress: "warning" },
  danger: { tag: "error", label: "异常", progress: "danger" },
};

export default function CockpitPage() {
  const [kpi, setKpi] = useState<CockpitKpi | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api.getCockpitKpi()
      .then((k) => { if (active) setKpi(k); })
      .catch(() => { /* 加载失败保持空态 */ })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  // KPI 4 卡
  const stats = kpi ? [
    { label: "数据吞吐", value: `${kpi.collectionThroughput.value} ${kpi.collectionThroughput.unit}`, icon: Database, delta: kpi.collectionThroughput.delta, trend: kpi.collectionThroughput.trend },
    { label: "规则触发", value: kpi.ruleHits.value, icon: ShieldCheck, delta: kpi.ruleHits.delta, trend: kpi.ruleHits.trend },
    { label: "工单 SLA", value: kpi.orderSla.value, icon: Clock, delta: kpi.orderSla.delta, trend: kpi.orderSla.trend },
    { label: "AI 调用", value: kpi.aiCalls.value, icon: Cpu, delta: kpi.aiCalls.delta, trend: kpi.aiCalls.trend },
  ] : [];

  return (
    <AdminPageContainer
      title="后台驾驶舱"
      subtitle="运维监控 · 全平台 KPI / 趋势 / 模块健康度"
      breadcrumb="运维监控 / 后台驾驶舱"
      actions={
        <div className="flex items-center gap-2 text-caption" style={{ color: "var(--color-on-surface-variant)" }}>
          <span className="ds-dot" style={{ background: "var(--color-success)" }} />
          <span>{loading ? "加载中…" : "实时刷新中"}</span>
          <Activity size={12} />
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {/* KPI 行 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {stats.map((s) => {
            const Icon = s.icon;
            const deltaColor = s.trend === "up" ? "var(--color-success)" : "var(--color-on-surface-variant)";
            return (
              <div key={s.label} className="ds-card">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-body" style={{ color: "var(--color-on-surface-variant)" }}>{s.label}</span>
                  <Icon size={16} style={{ color: "var(--color-primary)" }} />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-h1 font-semibold" style={{ color: "var(--color-foreground)" }}>{s.value}</span>
                  {s.delta ? <span className="text-caption" style={{ color: deltaColor }}>{s.delta}</span> : null}
                </div>
              </div>
            );
          })}
        </div>

        {/* 趋势图行：左数据吞吐趋势，右规则/工单/AI 趋势 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Card title="数据吞吐趋势（近 7 日）" padding="none">
            <div className="p-3" style={{ height: 240 }}>
              {kpi ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={kpi.trends}>
                    <defs>
                      <linearGradient id="tpGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="date" stroke="var(--color-on-surface-variant)" fontSize={11} />
                    <YAxis stroke="var(--color-on-surface-variant)" fontSize={11} />
                    <Tooltip contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 4, fontSize: 12 }} />
                    <Area type="monotone" dataKey="collection" name="采集量" stroke="var(--color-primary)" strokeWidth={2} fill="url(#tpGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : null}
            </div>
          </Card>
          <Card title="规则 / 工单 / AI 趋势（近 7 日）" padding="none">
            <div className="p-3" style={{ height: 240 }}>
              {kpi ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={kpi.trends}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="date" stroke="var(--color-on-surface-variant)" fontSize={11} />
                    <YAxis stroke="var(--color-on-surface-variant)" fontSize={11} />
                    <Tooltip contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 4, fontSize: 12 }} />
                    <Line type="monotone" dataKey="ruleHits" name="规则触发" stroke="var(--color-danger)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="orders" name="工单" stroke="var(--color-warning)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="ai" name="AI 调用" stroke="var(--color-primary)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : null}
            </div>
          </Card>
        </div>

        {/* 告警摘要行：按严重度计数 */}
        <div className="grid grid-cols-3 gap-3">
          {(Object.keys(severityMeta) as AlertSeverity[]).map((sev) => {
            const meta = severityMeta[sev];
            const item = kpi?.alertSummary.find((a) => a.severity === sev);
            const count = item?.count ?? 0;
            return (
              <div key={sev} className="ds-card">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-body" style={{ color: "var(--color-on-surface-variant)" }}>{meta.label}告警</span>
                  <AlertTriangle size={16} style={{ color: `var(--color-${meta.tone === "error" ? "danger" : meta.tone === "warning" ? "warning" : "primary"})` }} />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-h2 font-semibold" style={{ color: "var(--color-foreground)" }}>{count}</span>
                  <StatusTag tone={meta.tone}>{meta.label}</StatusTag>
                </div>
              </div>
            );
          })}
        </div>

        {/* 模块健康度表 */}
        <Card title="模块健康度" padding="none">
          <div className="ds-table-wrap">
            <table className="ds-table">
              <thead>
                <tr>
                  <th>模块</th><th>状态</th><th>健康度</th>
                </tr>
              </thead>
              <tbody>
                {kpi ? (
                  kpi.moduleHealth.map((m) => {
                    const tm = healthToneMap[m.tone];
                    return (
                      <tr key={m.name}>
                        <td className="flex items-center gap-2"><Server size={14} style={{ color: "var(--color-primary)" }} />{m.name}</td>
                        <td><StatusTag tone={tm.tag} dot>{tm.label}</StatusTag></td>
                        <td>
                          <div className="flex items-center gap-2 min-w-[180px]">
                            <Progress value={m.health} tone={tm.progress} size="sm" />
                            <span className="td-mono text-caption min-w-[44px] text-right" style={{ color: "var(--color-foreground)" }}>{m.health}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr><td colSpan={3} className="text-center" style={{ color: "var(--color-on-surface-variant)", padding: "32px" }}>加载中…</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AdminPageContainer>
  );
}
