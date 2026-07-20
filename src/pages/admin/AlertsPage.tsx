import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Bell, Search, Filter, CheckCircle, BellOff, RefreshCw,
} from "lucide-react";
import AdminPageContainer from "@/components/layout/AdminPageContainer";
import Card from "@/components/ui/Card";
import StatusTag, { type TagTone } from "@/components/ui/StatusTag";
import Drawer from "@/components/ui/Drawer";
import { api } from "@/api";
import type { AdminAlert, AlertSeverity, AlertStatus } from "@/api/types";
import { useAdminStore } from "@/store/adminStore";
import { useAuthStore } from "@/store/authStore";

// 严重度映射
const severityMeta: Record<AlertSeverity, { label: string; tone: TagTone }> = {
  red: { label: "严重", tone: "error" },
  orange: { label: "高", tone: "warning" },
  yellow: { label: "中", tone: "info" },
};
// 状态映射
const statusMeta: Record<AlertStatus, { label: string; tone: TagTone }> = {
  active: { label: "待处理", tone: "error" },
  confirmed: { label: "已确认", tone: "info" },
  silenced: { label: "已静默", tone: "stop" },
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AdminAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [sevFilter, setSevFilter] = useState<string>("all");
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [detail, setDetail] = useState<AdminAlert | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: TagTone } | null>(null);
  // 本地已读 / 已静默集合（来自 adminStore）
  const readAlertIds = useAdminStore((s) => s.readAlertIds);
  const silencedAlertIds = useAdminStore((s) => s.silencedAlertIds);
  const markAlertRead = useAdminStore((s) => s.markAlertRead);
  const silenceAlertLocal = useAdminStore((s) => s.silenceAlert);
  // 当前操作人（用于 confirmAlert 的 confirmBy 参数）
  const userName = useAuthStore((s) => s.user?.name ?? "系统管理员");

  const showToast = (text: string, tone: TagTone = "success") => {
    setToast({ text, tone });
    window.setTimeout(() => setToast(null), 2600);
  };

  useEffect(() => { void load(); }, []);
  async function load() {
    setLoading(true);
    try {
      setAlerts(await api.listAdminAlerts());
    } catch {
      showToast("加载失败", "error");
    } finally {
      setLoading(false);
    }
  }

  // 关键逻辑：多维筛选（关键字 + 严重度 + 状态）
  const filtered = useMemo(() => {
    return alerts.filter((a) => {
      if (sevFilter !== "all" && a.severity !== sevFilter) return false;
      if (stateFilter !== "all" && a.status !== stateFilter) return false;
      if (!keyword) return true;
      return a.title.includes(keyword) || a.module.includes(keyword) || a.detail.includes(keyword);
    });
  }, [alerts, keyword, sevFilter, stateFilter]);

  // KPI：按状态汇总
  const kpi = useMemo(() => ({
    active: alerts.filter((a) => a.status === "active").length,
    confirmed: alerts.filter((a) => a.status === "confirmed").length,
    silenced: alerts.filter((a) => a.status === "silenced").length,
    unread: alerts.filter((a) => a.status === "active" && !readAlertIds.has(a.id)).length,
  }), [alerts, readAlertIds]);

  function openDetail(a: AdminAlert) {
    setDetail(a);
    markAlertRead(a.id);
  }

  async function onConfirm(id: string) {
    try {
      const updated = await api.confirmAlert(id, userName);
      markAlertRead(id);
      setAlerts((prev) => prev.map((a) => (a.id === id ? updated : a)));
      showToast("告警已确认", "success");
    } catch {
      showToast("确认失败", "error");
    }
  }
  async function onSilence(id: string) {
    try {
      const updated = await api.silenceAlert(id);
      silenceAlertLocal(id);
      setAlerts((prev) => prev.map((a) => (a.id === id ? updated : a)));
      showToast("告警已静默", "success");
      setDetail(null);
    } catch {
      showToast("静默失败", "error");
    }
  }

  return (
    <AdminPageContainer
      title="告警中心"
      subtitle="运维监控 · 全平台告警汇总 / 确认 / 静默"
      breadcrumb="运维监控 / 告警中心"
      actions={
        <button type="button" className="ds-btn ds-btn-secondary" onClick={() => void load()}><RefreshCw size={14} />刷新</button>
      }
    >
      <div className="flex flex-col gap-4">
        {/* KPI 行：4 张状态卡 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "待处理", value: kpi.active, tone: "error" as const, icon: AlertTriangle },
            { label: "未读", value: kpi.unread, tone: "warning" as const, icon: Bell },
            { label: "已确认", value: kpi.confirmed, tone: "info" as const, icon: CheckCircle },
            { label: "已静默", value: kpi.silenced, tone: "stop" as const, icon: BellOff },
          ].map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="ds-card">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-body" style={{ color: "var(--color-on-surface-variant)" }}>{s.label}</span>
                  <Icon size={16} style={{ color: "var(--color-primary)" }} />
                </div>
                <div className="text-h1 font-semibold" style={{ color: "var(--color-foreground)" }}>{s.value}</div>
              </div>
            );
          })}
        </div>

        {/* 筛选条 */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="ds-input flex-1 max-w-[280px]">
            <Search size={14} style={{ color: "var(--color-on-surface-variant)" }} />
            <input type="text" placeholder="搜索标题 / 模块 / 详情" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
          </div>
          <div className="ds-input">
            <Filter size={14} style={{ color: "var(--color-on-surface-variant)" }} />
            <select value={sevFilter} onChange={(e) => setSevFilter(e.target.value)}>
              <option value="all">全部严重度</option>
              {(Object.keys(severityMeta) as AlertSeverity[]).map((k) => <option key={k} value={k}>{severityMeta[k].label}</option>)}
            </select>
          </div>
          <div className="ds-input">
            <Filter size={14} style={{ color: "var(--color-on-surface-variant)" }} />
            <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
              <option value="all">全部状态</option>
              {(Object.keys(statusMeta) as AlertStatus[]).map((k) => <option key={k} value={k}>{statusMeta[k].label}</option>)}
            </select>
          </div>
          <span className="ds-section-sub ml-auto">{loading ? "加载中…" : `共 ${filtered.length} 条`}</span>
        </div>

        {/* 告警表 */}
        <Card title={`告警列表（${filtered.length}）`} padding="none">
          <div className="ds-table-wrap">
            <table className="ds-table">
              <thead>
                <tr>
                  <th>触发时间</th><th>严重度</th><th>标题</th><th>模块</th><th>状态</th><th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} className="text-center" style={{ color: "var(--color-on-surface-variant)", padding: "32px" }}>暂无告警</td></tr>
                ) : null}
                {filtered.map((a) => {
                  const sm = severityMeta[a.severity];
                  const stm = statusMeta[a.status];
                  const unread = a.status === "active" && !readAlertIds.has(a.id);
                  return (
                    <tr key={a.id}>
                      <td className="td-mono text-caption">{a.triggeredAt}</td>
                      <td><StatusTag tone={sm.tone} dot>{sm.label}</StatusTag></td>
                      <td>
                        <button type="button" className="inline-flex items-center gap-1.5 text-body" style={{ color: "var(--color-foreground)" }} onClick={() => openDetail(a)}>
                          {unread ? <span className="ds-dot" style={{ background: "var(--color-danger)" }} /> : null}
                          <span style={{ textDecoration: "underline", textDecorationColor: "var(--color-border)", textUnderlineOffset: 3 }}>{a.title}</span>
                        </button>
                      </td>
                      <td>{a.module}</td>
                      <td><StatusTag tone={stm.tone}>{stm.label}</StatusTag></td>
                      <td>
                        <div className="flex items-center gap-1">
                          {a.status === "active" ? (
                            <>
                              <button type="button" className="ds-btn ds-btn-secondary" style={{ height: 28 }} onClick={() => onConfirm(a.id)}><CheckCircle size={12} />确认</button>
                              <button type="button" className="ds-btn ds-btn-secondary" style={{ height: 28 }} onClick={() => onSilence(a.id)}><BellOff size={12} />静默</button>
                            </>
                          ) : (
                            <span className="text-caption" style={{ color: "var(--color-on-surface-variant)" }}>—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* 告警详情抽屉 */}
      <Drawer
        open={!!detail} onClose={() => setDetail(null)}
        title={detail ? `告警详情 · ${detail.title}` : "告警详情"} width={560}
        footer={
          detail && detail.status === "active" ? (
            <>
              <button type="button" className="ds-btn ds-btn-secondary" onClick={() => onSilence(detail.id)}><BellOff size={14} />静默</button>
              <button type="button" className="ds-btn ds-btn-primary" onClick={() => { void onConfirm(detail.id); setDetail(null); }}><CheckCircle size={14} />确认告警</button>
            </>
          ) : null
        }
      >
        {detail ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <StatusTag tone={severityMeta[detail.severity].tone} dot>{severityMeta[detail.severity].label}</StatusTag>
              <StatusTag tone={statusMeta[detail.status].tone}>{statusMeta[detail.status].label}</StatusTag>
            </div>
            <div className="grid grid-cols-2 gap-3 text-caption" style={{ color: "var(--color-on-surface-variant)" }}>
              <div>触发时间：<span className="td-mono">{detail.triggeredAt}</span></div>
              <div>模块：<span className="td-mono">{detail.module}</span></div>
              <div>确认人：<span className="td-mono">{detail.confirmedBy ?? "—"}</span></div>
              <div>告警 ID：<span className="td-mono">{detail.id}</span></div>
            </div>
            <div>
              <div className="text-body mb-2" style={{ color: "var(--color-foreground)" }}>告警详情：</div>
              <div className="p-3 rounded-sm text-body" style={{ background: "var(--color-surface-container)", color: "var(--color-foreground)" }}>{detail.detail}</div>
            </div>
          </div>
        ) : null}
      </Drawer>

      {toast ? <div className="fixed top-4 right-4 z-[400]"><StatusTag tone={toast.tone} dot>{toast.text}</StatusTag></div> : null}
    </AdminPageContainer>
  );
}
