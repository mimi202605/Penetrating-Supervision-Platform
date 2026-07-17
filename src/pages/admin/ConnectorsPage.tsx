import { useEffect, useMemo, useState } from "react";
import { Cable, Zap, CheckCircle2, CircleDashed } from "lucide-react";
import AdminPageContainer from "@/components/layout/AdminPageContainer";
import Stat from "@/components/ui/Stat";
import StatusTag, { type TagTone } from "@/components/ui/StatusTag";
import { api } from "@/api";
import type { Connector, ConnectorCategory } from "@/api/types";

const CATEGORY_LABELS: Record<ConnectorCategory | "all", string> = {
  all: "全部", erp: "ERP", db: "数据库", file: "文件", mq: "消息队列", saas: "SaaS",
};
const CATEGORY_ORDER: (ConnectorCategory | "all")[] = ["all", "erp", "db", "file", "mq", "saas"];

export default function ConnectorsPage() {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<ConnectorCategory | "all">("all");
  const [testing, setTesting] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: TagTone } | null>(null);
  const showToast = (text: string, tone: TagTone = "success") => {
    setToast({ text, tone });
    window.setTimeout(() => setToast(null), 2600);
  };

  useEffect(() => {
    api.listConnectors().then((c) => { setConnectors(c); setLoading(false); });
  }, []);

  const implementedCount = connectors.filter((c) => c.implemented).length;
  const placeholderCount = connectors.length - implementedCount;

  const filtered = useMemo(() => category === "all" ? connectors : connectors.filter((c) => c.category === category), [connectors, category]);

  const onTest = (c: Connector) => {
    setTesting(c.type);
    api.testSource({ connectorType: c.type })
      .then((r) => showToast(`「${c.name}」连接测试 · ${r.latencyMs}ms`, r.status === "online" ? "success" : "warning"))
      .catch(() => showToast(`「${c.name}」测试失败`, "error"))
      .finally(() => setTesting(null));
  };

  return (
    <AdminPageContainer
      title="连接器目录"
      subtitle="数据采集运维 · 20 类连接器元数据、能力、实现状态"
      breadcrumb="数据采集运维 / 连接器目录"
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat icon={<Cable size={16} strokeWidth={1.5} />} label="连接器总数" value={connectors.length} countUp decimals={0} trend={{ text: "20 类规划", tone: "info" }} />
          <Stat icon={<CheckCircle2 size={16} strokeWidth={1.5} />} label="已实现" value={implementedCount} countUp decimals={0} trend={{ text: "可用", tone: "success" }} />
          <Stat icon={<CircleDashed size={16} strokeWidth={1.5} />} label="规划中" value={placeholderCount} countUp decimals={0} trend={{ text: "占位", tone: "stop" }} />
          <Stat icon={<Zap size={16} strokeWidth={1.5} />} label="可测试" value={implementedCount} countUp decimals={0} trend={{ text: "Mock 联调", tone: "info" }} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {CATEGORY_ORDER.map((cat) => {
            const count = cat === "all" ? connectors.length : connectors.filter((c) => c.category === cat).length;
            const active = category === cat;
            return (
              <button key={cat} type="button" onClick={() => setCategory(cat)}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-sm text-body"
                style={{
                  background: active ? "var(--color-primary)" : "var(--color-surface-container)",
                  color: active ? "#fff" : "var(--color-foreground)",
                  border: "1px solid var(--color-border)", fontWeight: active ? 500 : 400,
                }}>
                {CATEGORY_LABELS[cat]}
                <span className="text-caption px-1 rounded-sm" style={{ background: active ? "rgba(255,255,255,0.2)" : "var(--color-surface-container-high)" }}>{count}</span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {loading ? <div className="text-body" style={{ color: "var(--color-on-surface-variant)" }}>加载中…</div> : null}
          {filtered.map((c) => (
            <div key={c.type} className="ds-card p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-lead font-medium truncate" style={{ color: "var(--color-foreground)" }}>{c.name}</span>
                    {c.implemented
                      ? <StatusTag tone="success">已实现</StatusTag>
                      : <StatusTag tone="stop">规划中</StatusTag>}
                  </div>
                  <div className="td-mono text-caption mt-1" style={{ color: "var(--color-on-surface-variant)" }}>{c.type} · {CATEGORY_LABELS[c.category]}</div>
                </div>
              </div>
              {c.description ? <div className="text-body" style={{ color: "var(--color-on-surface-variant)" }}>{c.description}</div> : null}
              <div className="flex flex-wrap gap-1.5">
                {c.capabilities.map((cap) => <StatusTag key={cap} tone="info">{cap}</StatusTag>)}
              </div>
              <div className="mt-auto pt-1">
                <button type="button" className="ds-btn ds-btn-secondary w-full" disabled={!c.implemented || testing === c.type} onClick={() => onTest(c)}>
                  <Zap size={12} />{testing === c.type ? "测试中…" : c.implemented ? "测试连接" : "未实现"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {toast ? <div className="fixed top-4 right-4 z-[400]"><StatusTag tone={toast.tone} dot>{toast.text}</StatusTag></div> : null}
    </AdminPageContainer>
  );
}
