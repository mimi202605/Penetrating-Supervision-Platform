import { useEffect, useMemo, useState } from "react";
import { Search as SearchIcon, Download } from "lucide-react";
import AdminPageContainer from "@/components/layout/AdminPageContainer";
import DataTable, { type Column } from "@/components/ui/DataTable";
import StatusTag from "@/components/ui/StatusTag";
import { api } from "@/api";
import type { AuditLog } from "@/api/types";

const ACTION_TONE: Record<string, "info" | "success" | "warning" | "error"> = {
  登录: "info", 查询: "info", 新增: "success", 编辑: "warning",
  处置: "warning", 导出: "info", 停用: "error", 删除: "error",
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [action, setAction] = useState("all");

  useEffect(() => {
    setLoading(true);
    api.listAuditLogs({ page: 1, pageSize: 100 })
      .then((res) => { setLogs(res.list); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const actions = useMemo(() => {
    const set = new Set(logs.map((l) => l.action));
    return ["all", ...Array.from(set)];
  }, [logs]);

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (action !== "all" && l.action !== action) return false;
      if (userId && !l.userId.includes(userId) && !l.detail.includes(userId)) return false;
      return true;
    });
  }, [logs, action, userId]);

  const columns: Column<AuditLog>[] = [
    { key: "createdAt", title: "时间", render: (r) => <span className="td-mono text-caption">{r.createdAt}</span> },
    { key: "userId", title: "用户ID", render: (r) => <span className="td-mono">{r.userId}</span> },
    { key: "action", title: "动作", render: (r) => <StatusTag tone={ACTION_TONE[r.action] ?? "info"}>{r.action}</StatusTag> },
    { key: "target", title: "对象", render: (r) => <span style={{ color: "var(--color-foreground)" }}>{r.target}</span> },
    { key: "ip", title: "IP", render: (r) => <span className="td-mono text-caption">{r.ip}</span> },
    { key: "detail", title: "详情", render: (r) => <span className="text-body" style={{ color: "var(--color-on-surface-variant)" }}>{r.detail}</span> },
  ];

  const onExport = () => {
    const header = "时间,用户ID,动作,对象,IP,详情\n";
    const rows = filtered.map((l) => `${l.createdAt},${l.userId},${l.action},${l.target},${l.ip},${l.detail}`).join("\n");
    const blob = new Blob(["\ufeff" + header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "audit-logs.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminPageContainer
      title="操作审计"
      subtitle="系统管理 · 全平台操作日志查询与导出"
      breadcrumb="系统管理 / 操作审计"
      actions={<button type="button" className="ds-btn ds-btn-secondary" onClick={onExport}><Download size={12} />导出 CSV</button>}
    >
      <section className="ds-card">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            {actions.map((a) => (
              <button key={a} type="button" onClick={() => setAction(a)}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-sm text-body"
                style={{
                  background: action === a ? "var(--color-primary)" : "var(--color-surface-container)",
                  color: action === a ? "#fff" : "var(--color-foreground)",
                  border: "1px solid var(--color-border)", fontWeight: action === a ? 500 : 400,
                }}>{a === "all" ? "全部动作" : a}</button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="ds-section-sub">{loading ? "加载中…" : `共 ${filtered.length} 条`}</span>
            <div className="ds-input min-w-[220px]">
              <SearchIcon size={14} style={{ color: "var(--color-on-surface-variant)" }} />
              <input type="text" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="搜索用户ID/详情" />
            </div>
          </div>
        </div>
        <DataTable columns={columns} data={filtered} rowKey={(r) => r.id} empty="暂无审计日志" />
      </section>
    </AdminPageContainer>
  );
}
