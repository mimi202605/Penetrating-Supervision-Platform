import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Database, Activity, RefreshCw, Pause, Play } from "lucide-react";
import AdminPageContainer from "@/components/layout/AdminPageContainer";
import Stat from "@/components/ui/Stat";
import DataTable, { type Column } from "@/components/ui/DataTable";
import StatusTag, { type TagTone } from "@/components/ui/StatusTag";
import Drawer from "@/components/ui/Drawer";
import { api } from "@/api";
import type { DataSource } from "@/api/types";

interface HealthPoint { checkedAt: string; latencyMs: number; status: string; error?: string }

export default function SourcesOpsPage() {
  const [sources, setSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [healthOpen, setHealthOpen] = useState(false);
  const [healthTarget, setHealthTarget] = useState<DataSource | null>(null);
  const [health, setHealth] = useState<HealthPoint[]>([]);
  const [healthLoading, setHealthLoading] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: TagTone } | null>(null);
  const showToast = (text: string, tone: TagTone = "success") => {
    setToast({ text, tone });
    window.setTimeout(() => setToast(null), 2600);
  };

  useEffect(() => {
    api.getDataSources().then((s) => { setSources(s); setLoading(false); });
  }, []);

  const online = sources.filter((s) => s.status === "online").length;
  const error = sources.filter((s) => s.status === "error").length;

  const viewHealth = (s: DataSource) => {
    setHealthTarget(s);
    setHealthOpen(true);
    setHealthLoading(true);
    setHealth([]);
    api.getSourceHealthHistory(s.id)
      .then((h) => setHealth(h as HealthPoint[]))
      .catch(() => showToast("健康历史加载失败", "error"))
      .finally(() => setHealthLoading(false));
  };

  const restart = (s: DataSource) => {
    api.testSourceById(s.id).then(() => showToast(`「${s.name}」已重启探测`, "success")).catch(() => showToast("重启失败", "error"));
  };

  const columns: Column<DataSource>[] = [
    { key: "name", title: "数据源", sticky: true, render: (r) => (
      <span className="font-medium" style={{ color: "var(--color-foreground)" }}>{r.name}</span>
    ) },
    { key: "type", title: "类型", render: (r) => <span className="td-mono">{r.type}</span> },
    { key: "status", title: "状态", render: (r) =>
      r.status === "online" ? <StatusTag tone="success" dot>在线</StatusTag>
      : r.status === "error" ? <StatusTag tone="error" dot>异常</StatusTag>
      : <StatusTag tone="stop" dot>离线</StatusTag>
    },
    { key: "records", title: "记录数", render: (r) => <span className="td-mono">{r.records}</span> },
    { key: "updateFreq", title: "更新频率", render: (r) => <span className="td-mono">{r.updateFreq}</span> },
    { key: "owner", title: "负责人", render: (r) => r.owner },
    { key: "actions", title: "操作", render: (r) => (
      <div className="flex items-center gap-1.5">
        <button type="button" className="ds-btn ds-btn-secondary" onClick={() => viewHealth(r)}><Activity size={12} />健康历史</button>
        <button type="button" className="ds-icon-btn" title="重启探测" onClick={() => restart(r)}><RefreshCw size={14} /></button>
        <button type="button" className="ds-icon-btn" title="暂停" onClick={() => showToast(`「${r.name}」已暂停（Mock）`, "warning")}><Pause size={14} /></button>
      </div>
    ) },
  ];

  return (
    <AdminPageContainer
      title="数据源运维"
      subtitle="数据采集运维 · 在线率、延迟、健康历史曲线"
      breadcrumb="数据采集运维 / 数据源运维"
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat icon={<Database size={16} strokeWidth={1.5} />} label="数据源总数" value={sources.length} countUp decimals={0} trend={{ text: "已接入", tone: "info" }} />
          <Stat icon={<Activity size={16} strokeWidth={1.5} />} label="在线" value={online} countUp decimals={0} trend={{ text: "正常", tone: "success" }} />
          <Stat icon={<Activity size={16} strokeWidth={1.5} />} label="异常" value={error} countUp decimals={0} trend={{ text: error > 0 ? "需关注" : "正常", tone: error > 0 ? "error" : "success" }} />
          <Stat icon={<Play size={16} strokeWidth={1.5} />} label="在线率" value={sources.length ? Math.round((online / sources.length) * 100) : 0} unit="%" countUp decimals={0} trend={{ text: "可用性", tone: "success" }} />
        </div>

        <section className="ds-card">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="ds-section-title">数据源列表</h2>
            <span className="ds-section-sub">{loading ? "加载中…" : `共 ${sources.length} 个`}</span>
          </div>
          <DataTable columns={columns} data={sources} rowKey={(r) => r.id} empty="暂无数据源" />
        </section>
      </div>

      <Drawer
        open={healthOpen} onClose={() => setHealthOpen(false)}
        title={healthTarget ? `健康历史 · ${healthTarget.name}` : "健康历史"} width={560}
        footer={<button type="button" className="ds-btn ds-btn-secondary" onClick={() => setHealthOpen(false)}>关闭</button>}
      >
        {healthLoading ? <div className="text-body" style={{ color: "var(--color-on-surface-variant)" }}>加载中…</div> : null}
        {!healthLoading && health.length > 0 ? (
          <div className="flex flex-col gap-4">
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={health} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
                  <CartesianGrid stroke="var(--color-border-light)" vertical={false} />
                  <XAxis dataKey="checkedAt" tick={{ fontSize: 10, fill: "var(--color-on-surface-variant)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--color-on-surface-variant)" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 4, fontSize: 12 }} labelStyle={{ color: "var(--color-foreground)" }} itemStyle={{ color: "var(--color-foreground)" }} />
                  <Line type="monotone" dataKey="latencyMs" name="延迟(ms)" stroke="#387bff" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="ds-table-wrap">
              <table className="ds-table">
                <thead><tr><th>时间</th><th>延迟</th><th>状态</th></tr></thead>
                <tbody>
                  {health.map((h, i) => (
                    <tr key={i}>
                      <td className="td-mono text-caption">{h.checkedAt}</td>
                      <td className="td-mono">{h.latencyMs}ms</td>
                      <td>{h.status === "online" ? <StatusTag tone="success">在线</StatusTag> : h.status === "degraded" ? <StatusTag tone="warning" dot>降级</StatusTag> : <StatusTag tone="error" dot>异常</StatusTag>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </Drawer>

      {toast ? <div className="fixed top-4 right-4 z-[400]"><StatusTag tone={toast.tone} dot>{toast.text}</StatusTag></div> : null}
    </AdminPageContainer>
  );
}
