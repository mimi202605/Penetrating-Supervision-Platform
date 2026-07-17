import { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  Banknote,
  Link as LinkIcon,
  FileWarning,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import PageContainer from "@/components/layout/PageContainer";
import StatusTag from "@/components/ui/StatusTag";
import { RiskLevelTag } from "@/components/ui/StatusTag";
import { api } from "@/api";
import * as mock from "@/mock";
import type { RiskLevel } from "@/api/types";

interface FinanceRiskCard {
  title: string;
  level: RiskLevel;
  count: number;
  desc: string;
  icon: string;
}

const iconMap: Record<string, LucideIcon> = {
  banknote: Banknote,
  link: LinkIcon,
  "file-warning": FileWarning,
  "shield-alert": ShieldAlert,
};

export default function FinancePage() {
  const [cards, setCards] = useState<FinanceRiskCard[]>(mock.financeRiskCards);
  const [trend, setTrend] = useState(mock.financeTrend);

  useEffect(() => {
    api.getFinanceRisks().then((c) => setCards(c as FinanceRiskCard[]));
    api.getFinanceTrend().then(setTrend);
  }, []);

  return (
    <PageContainer
      title="财务资金监管"
      subtitle="业务场景 · 资金异动 / 关联交易 / 虚假贸易 / 违规担保 全方位监控"
      breadcrumb="业务场景 / 财务资金监管"
    >
      <div className="flex flex-col gap-5">
        {/* 风险卡片 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((c) => {
            const Icon = iconMap[c.icon] ?? Banknote;
            return (
              <div key={c.title} className="ds-card flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div
                    className="w-8 h-8 rounded-sm flex items-center justify-center"
                    style={{
                      background:
                        c.level === "high"
                          ? "var(--color-danger-bg)"
                          : "var(--color-warning-bg)",
                      color:
                        c.level === "high"
                          ? "var(--color-danger)"
                          : "var(--color-warning)",
                    }}
                  >
                    <Icon size={16} strokeWidth={1.5} />
                  </div>
                  <RiskLevelTag level={c.level} />
                </div>
                <div
                  className="text-lead font-medium"
                  style={{ color: "var(--color-foreground)" }}
                >
                  {c.title}
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span
                    className="text-[26px] font-semibold leading-none"
                    style={{ color: "var(--color-foreground)" }}
                  >
                    {c.count}
                  </span>
                  <span className="text-body" style={{ color: "var(--color-on-surface-variant)" }}>
                    待处置
                  </span>
                </div>
                <div
                  className="text-body leading-snug"
                  style={{ color: "var(--color-on-surface-variant)" }}
                >
                  {c.desc}
                </div>
              </div>
            );
          })}
        </div>

        {/* 资金流向图谱缩略 */}
        <section className="ds-card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="ds-section-title">资金流向图谱</h2>
            <StatusTag tone="info">缩略视图 · 完整图谱见"关系图谱"页</StatusTag>
          </div>
          <div
            className="rounded-sm p-4 flex flex-col gap-3"
            style={{ background: "var(--color-surface-container)" }}
          >
            {[
              { from: "新兴铸管基本户", to: "Everwin Holdings", amount: "8,600 万元", risk: "high" as const },
              { from: "新兴铸管基本户", to: "鑫达贸易", amount: "3,200 万元", risk: "medium" as const },
              { from: "新兴铸管一般户", to: "华信物资", amount: "1,800 万元", risk: "medium" as const },
              { from: "际华投资结算户", to: "华信物资", amount: "5,000 万元", risk: "high" as const },
            ].map((f, i) => (
              <div key={i} className="flex items-center gap-3 flex-wrap">
                <span
                  className="px-2 py-1 rounded-sm text-body"
                  style={{ background: "var(--color-primary-container)", color: "var(--color-primary)" }}
                >
                  {f.from}
                </span>
                <span
                  className="text-body"
                  style={{
                    color: f.risk === "high" ? "var(--color-danger)" : "var(--color-warning)",
                  }}
                >
                  —— {f.amount} ——▶
                </span>
                <span
                  className="px-2 py-1 rounded-sm text-body"
                  style={{
                    background: f.risk === "high" ? "var(--color-danger-bg)" : "var(--color-warning-bg)",
                    color: f.risk === "high" ? "var(--color-danger)" : "var(--color-warning)",
                  }}
                >
                  {f.to}
                </span>
                {f.risk === "high" ? <StatusTag tone="error" dot>异动</StatusTag> : null}
              </div>
            ))}
          </div>
        </section>

        {/* 趋势图 */}
        <section className="ds-card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="ds-section-title">资金流入流出趋势（近30天）</h2>
            <span className="ds-section-sub">单位：万元</span>
          </div>
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
                <defs>
                  <linearGradient id="inflow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#387bff" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#387bff" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="outflow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ff706d" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ff706d" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--color-border-light)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--color-on-surface-variant)" }} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis tick={{ fontSize: 10, fill: "var(--color-on-surface-variant)" }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 4, fontSize: 12 }}
                  labelStyle={{ color: "var(--color-foreground)" }}
                  itemStyle={{ color: "var(--color-foreground)" }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="inflow" name="流入" stroke="#387bff" strokeWidth={2} fill="url(#inflow)" />
                <Area type="monotone" dataKey="outflow" name="流出" stroke="#ff706d" strokeWidth={2} fill="url(#outflow)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </PageContainer>
  );
}
