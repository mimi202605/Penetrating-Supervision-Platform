import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import PageContainer from "@/components/layout/PageContainer";
import { api } from "@/api";
import * as mock from "@/mock";

export default function BigScreenPage() {
  const [kpis, setKpis] = useState(mock.bigScreenKpis);
  const [heatmap, setHeatmap] = useState(mock.riskHeatmap);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [countdown, setCountdown] = useState(30);

  useEffect(() => {
    api.getBigScreenKpis().then(setKpis);
    api.getRiskHeatmap().then(setHeatmap);
  }, []);

  // 30s 自动刷新
  useEffect(() => {
    const tick = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          setLastUpdate(new Date());
          api.getBigScreenKpis().then(setKpis);
          api.getRiskHeatmap().then(setHeatmap);
          return 30;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  // 热力图最大值用于色阶
  const maxRisk = Math.max(...heatmap.map((h) => h.high + h.medium + h.low));

  const heatColor = (total: number) => {
    const ratio = total / maxRisk;
    if (ratio > 0.8) return "rgba(255,112,109,0.85)";
    if (ratio > 0.6) return "rgba(255,112,109,0.55)";
    if (ratio > 0.4) return "rgba(240,165,15,0.6)";
    if (ratio > 0.2) return "rgba(240,165,15,0.35)";
    return "rgba(56,123,255,0.3)";
  };

  return (
    <PageContainer
      title="指挥大屏"
      subtitle="调度指挥中心 · 集团监管态势总览"
      breadcrumb="调度指挥中心 / 指挥大屏"
      maxWidth={1920}
      actions={
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-caption" style={{ color: "var(--color-on-surface-variant)" }}>
            <span
              className="w-1.5 h-1.5 rounded-full animate-breathe"
              style={{ background: "var(--color-success)" }}
            />
            实时刷新 · {countdown}s
          </span>
          <span className="text-caption" style={{ color: "var(--color-on-surface-variant)" }}>
            最近更新：{lastUpdate.toLocaleTimeString("zh-CN")}
          </span>
        </div>
      }
    >
      <div
        className="rounded-md p-5 flex flex-col gap-5"
        style={{
          background:
            "radial-gradient(ellipse at top, rgba(56,123,255,0.08) 0%, var(--color-bg) 60%)",
          border: "1px solid var(--color-border)",
          minHeight: 600,
        }}
      >
        {/* KPI 行 */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {kpis.map((k) => (
            <div
              key={k.label}
              className="rounded-md p-4 flex flex-col gap-2"
              style={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                boxShadow: "0 0 0 1px var(--color-primary-line) inset",
              }}
            >
              <span
                className="text-body"
                style={{ color: "var(--color-on-surface-variant)" }}
              >
                {k.label}
              </span>
              <span
                className="text-display font-semibold leading-none"
                style={{
                  color: k.tone === "up" ? "var(--color-danger)" : k.tone === "down" ? "var(--color-success)" : "var(--color-foreground)",
                }}
              >
                {k.value}
              </span>
              {k.trend ? (
                <span
                  className="text-caption"
                  style={{
                    color: k.tone === "up" ? "var(--color-danger)" : "var(--color-success)",
                  }}
                >
                  {k.trend}
                </span>
              ) : null}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-5">
          {/* 风险分布热力图 */}
          <section
            className="rounded-md p-4"
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
            }}
          >
            <h2 className="ds-section-title mb-3">风险分布热力图</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {heatmap.map((h) => {
                const total = h.high + h.medium + h.low;
                return (
                  <div
                    key={h.area}
                    className="rounded-sm p-3 flex flex-col gap-2"
                    style={{
                      background: heatColor(total),
                      border: "1px solid var(--color-border)",
                    }}
                  >
                    <span
                      className="text-lead font-medium"
                      style={{ color: "var(--color-foreground)" }}
                    >
                      {h.area}
                    </span>
                    <div className="flex items-baseline gap-1.5">
                      <span
                        className="text-h2 font-semibold leading-none"
                        style={{ color: "var(--color-foreground)" }}
                      >
                        {total}
                      </span>
                      <span className="text-caption" style={{ color: "var(--color-on-surface-variant)" }}>
                        风险总数
                      </span>
                    </div>
                    <div className="flex gap-2 text-caption" style={{ color: "var(--color-on-surface-variant)" }}>
                      <span>高 <b style={{ color: "var(--color-danger)" }}>{h.high}</b></span>
                      <span>中 <b style={{ color: "var(--color-warning)" }}>{h.medium}</b></span>
                      <span>低 <b style={{ color: "var(--color-success)" }}>{h.low}</b></span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 处置进度看板 */}
          <section
            className="rounded-md p-4"
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
            }}
          >
            <h2 className="ds-section-title mb-3">处置进度看板</h2>
            <div style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[
                    { name: "核查", value: 18 },
                    { name: "整改", value: 12 },
                    { name: "复核", value: 9 },
                    { name: "归档", value: 8 },
                  ]}
                  margin={{ top: 8, right: 12, bottom: 0, left: -16 }}
                >
                  <CartesianGrid stroke="var(--color-border-light)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--color-on-surface-variant)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--color-on-surface-variant)" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    cursor={{ fill: "var(--state-hover)" }}
                    contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 4, fontSize: 12 }}
                    labelStyle={{ color: "var(--color-foreground)" }}
                    itemStyle={{ color: "var(--color-foreground)" }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={32}>
                    <Cell fill="#1664ff" />
                    <Cell fill="#f0a50f" />
                    <Cell fill="#7ccd94" />
                    <Cell fill="#86909c" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>

        {/* 待办统计 + 资金流向 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <section
            className="rounded-md p-4"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
          >
            <h2 className="ds-section-title mb-3">资金流向态势</h2>
            <div className="flex flex-col gap-2">
              {[
                { from: "新兴铸管基本户", to: "Everwin Holdings", amount: "8,600 万元", tone: "danger" as const },
                { from: "新兴铸管基本户", to: "鑫达贸易", amount: "3,200 万元", tone: "warning" as const },
                { from: "际华投资结算户", to: "华信物资", amount: "5,000 万元", tone: "warning" as const },
                { from: "新兴铸管一般户", to: "华信物资", amount: "1,800 万元", tone: "info" as const },
              ].map((f, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 py-2 px-3 rounded-sm"
                  style={{ background: "var(--color-surface-container)" }}
                >
                  <span className="text-body" style={{ color: "var(--color-foreground)" }}>{f.from}</span>
                  <span style={{ color: f.tone === "danger" ? "var(--color-danger)" : f.tone === "warning" ? "var(--color-warning)" : "var(--color-primary)" }}>→</span>
                  <span className="text-body" style={{ color: "var(--color-foreground)" }}>{f.to}</span>
                  <span className="text-lead td-mono ml-auto font-medium" style={{ color: "var(--color-foreground)" }}>{f.amount}</span>
                </div>
              ))}
            </div>
          </section>

          <section
            className="rounded-md p-4"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
          >
            <h2 className="ds-section-title mb-3">投资概览</h2>
            <div className="flex flex-col gap-3">
              {[
                { name: "本年投资额", value: "186 亿", trend: "↑ 12%" },
                { name: "在投项目", value: "42", trend: "↑ 3" },
                { name: "退出项目", value: "8", trend: "↓ 1" },
                { name: "投资收益率", value: "8.6%", trend: "↑ 0.4pt" },
              ].map((s) => (
                <div
                  key={s.name}
                  className="flex items-center justify-between py-2 px-3 rounded-sm"
                  style={{ background: "var(--color-surface-container)" }}
                >
                  <span className="text-body" style={{ color: "var(--color-on-surface-variant)" }}>{s.name}</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-h3 font-semibold" style={{ color: "var(--color-foreground)" }}>{s.value}</span>
                    <span className="text-caption" style={{ color: "var(--color-success)" }}>{s.trend}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section
            className="rounded-md p-4"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
          >
            <h2 className="ds-section-title mb-3">待办统计</h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { name: "待处置风险", value: "18", tone: "var(--color-danger)" },
                { name: "在办工单", value: "47", tone: "var(--color-warning)" },
                { name: "复核待办", value: "9", tone: "var(--color-primary)" },
                { name: "归档待办", value: "8", tone: "var(--color-success)" },
              ].map((s) => (
                <div
                  key={s.name}
                  className="rounded-sm p-3 flex flex-col gap-1"
                  style={{ background: "var(--color-surface-container)" }}
                >
                  <span className="text-body" style={{ color: "var(--color-on-surface-variant)" }}>{s.name}</span>
                  <span className="text-display font-semibold leading-none" style={{ color: s.tone }}>{s.value}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </PageContainer>
  );
}
