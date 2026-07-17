import { useEffect, useState } from "react";
import { CalendarClock, Play, History, Bug, Gauge } from "lucide-react";
import AdminPageContainer from "@/components/layout/AdminPageContainer";
import DataTable, { type Column } from "@/components/ui/DataTable";
import Drawer from "@/components/ui/Drawer";
import StatusTag, { type TagTone } from "@/components/ui/StatusTag";
import { api } from "@/api";
import type { CollectionTask, CollectionTaskRun, Checkpoint, DirtyRecord, AuditPoint } from "@/api/types";

export default function TaskSchedulerPage() {
  const [tasks, setTasks] = useState<CollectionTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailTask, setDetailTask] = useState<CollectionTask | null>(null);
  const [runs, setRuns] = useState<CollectionTaskRun[]>([]);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [dirty, setDirty] = useState<DirtyRecord[]>([]);
  const [audit, setAudit] = useState<AuditPoint[]>([]);
  const [tab, setTab] = useState<"runs" | "checkpoint" | "dirty" | "audit">("runs");
  const [toast, setToast] = useState<{ text: string; tone: TagTone } | null>(null);
  const showToast = (text: string, tone: TagTone = "success") => {
    setToast({ text, tone });
    window.setTimeout(() => setToast(null), 2600);
  };

  useEffect(() => {
    api.getCollectionTasks().then((t) => { setTasks(t); setLoading(false); });
  }, []);

  const openDetail = (t: CollectionTask) => {
    setDetailTask(t);
    setTab("runs");
    setRuns([]); setCheckpoints([]); setDirty([]); setAudit([]);
    Promise.all([
      api.listRuns(t.id),
      api.listCheckpoints(t.id),
      api.listDirtyRecords(t.id),
      api.listTaskAudit(t.id),
    ]).then(([r, c, d, a]) => {
      setRuns(r); setCheckpoints(c); setDirty(d); setAudit(a);
    }).catch(() => showToast("详情加载失败", "error"));
  };

  const trigger = (t: CollectionTask) => {
    api.triggerTask(t.id).then(() => showToast(`「${t.name}」已触发`, "success")).catch(() => showToast("触发失败", "error"));
  };

  const taskCols: Column<CollectionTask>[] = [
    { key: "name", title: "任务", sticky: true, render: (r) => (
      <div>
        <div className="font-medium" style={{ color: "var(--color-foreground)" }}>{r.name}</div>
        <div className="td-mono text-caption" style={{ color: "var(--color-on-surface-variant)" }}>{r.id}</div>
      </div>
    ) },
    { key: "source", title: "数据源", render: (r) => r.source },
    { key: "mode", title: "模式", render: (r) => <StatusTag tone="info">{r.mode}</StatusTag> },
    { key: "schedule", title: "调度", render: (r) => <span className="td-mono text-caption">{r.schedule}</span> },
    { key: "lastStatus", title: "最近状态", render: (r) =>
      r.lastStatus === "成功" ? <StatusTag tone="success">成功</StatusTag>
      : r.lastStatus === "运行中" ? <StatusTag tone="processing" dot>运行中</StatusTag>
      : <StatusTag tone="error">失败</StatusTag>
    },
    { key: "throughput", title: "吞吐", render: (r) => <span className="td-mono">{r.throughput}</span> },
    { key: "lastRun", title: "最近运行", render: (r) => <span className="td-mono text-caption">{r.lastRun}</span> },
    { key: "actions", title: "操作", render: (r) => (
      <div className="flex items-center gap-1.5">
        <button type="button" className="ds-btn ds-btn-secondary" onClick={() => trigger(r)}><Play size={12} />触发</button>
        <button type="button" className="ds-btn ds-btn-secondary" onClick={() => openDetail(r)}><History size={12} />详情</button>
      </div>
    ) },
  ];

  const runCols: Column<CollectionTaskRun>[] = [
    { key: "startedAt", title: "开始", render: (r) => <span className="td-mono text-caption">{r.startedAt}</span> },
    { key: "status", title: "状态", render: (r) => r.status === "success" ? <StatusTag tone="success">成功</StatusTag> : r.status === "running" ? <StatusTag tone="processing" dot>运行中</StatusTag> : <StatusTag tone="error">失败</StatusTag> },
    { key: "recordsRead", title: "读取", render: (r) => <span className="td-mono">{r.recordsRead}</span> },
    { key: "recordsWrite", title: "写入", render: (r) => <span className="td-mono">{r.recordsWrite}</span> },
    { key: "recordsDirty", title: "脏数据", render: (r) => <span className="td-mono">{r.recordsDirty}</span> },
    { key: "error", title: "错误", render: (r) => r.error ? <span className="text-caption" style={{ color: "var(--color-danger)" }}>{r.error}</span> : "—" },
  ];

  return (
    <AdminPageContainer
      title="任务调度"
      subtitle="数据采集运维 · 采集任务、运行历史、checkpoint、脏数据回查、审计点吞吐"
      breadcrumb="数据采集运维 / 任务调度"
    >
      <section className="ds-card">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="ds-section-title">采集任务列表</h2>
          <span className="ds-section-sub">{loading ? "加载中…" : `共 ${tasks.length} 个任务`}</span>
        </div>
        <DataTable columns={taskCols} data={tasks} rowKey={(r) => r.id} onRowClick={(r) => openDetail(r)} empty="暂无任务" />
      </section>

      <Drawer
        open={!!detailTask} onClose={() => setDetailTask(null)}
        title={detailTask ? `任务详情 · ${detailTask.name}` : "任务详情"} width={680}
        footer={<button type="button" className="ds-btn ds-btn-secondary" onClick={() => setDetailTask(null)}>关闭</button>}
      >
        {detailTask ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {([["runs", "运行历史", History], ["checkpoint", "Checkpoint", Gauge], ["dirty", "脏数据", Bug], ["audit", "审计点", CalendarClock]] as const).map(([key, label, Icon]) => (
                <button key={key} type="button" onClick={() => setTab(key)}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-sm text-body"
                  style={{
                    background: tab === key ? "var(--color-primary)" : "var(--color-surface-container)",
                    color: tab === key ? "#fff" : "var(--color-foreground)",
                    border: "1px solid var(--color-border)", fontWeight: tab === key ? 500 : 400,
                  }}><Icon size={12} />{label}</button>
              ))}
            </div>

            {tab === "runs" ? <DataTable columns={runCols} data={runs} rowKey={(r) => r.id} empty="暂无运行记录" /> : null}
            {tab === "checkpoint" ? (
              <div className="flex flex-col gap-2">
                {checkpoints.length === 0 ? <div className="text-body" style={{ color: "var(--color-on-surface-variant)" }}>暂无 checkpoint</div> : null}
                {checkpoints.map((c, i) => (
                  <div key={i} className="p-3 rounded-sm" style={{ background: "var(--color-surface-container)" }}>
                    <div className="text-caption mb-1" style={{ color: "var(--color-on-surface-variant)" }}>shard: {c.shardId}</div>
                    <div className="td-mono text-caption break-all" style={{ color: "var(--color-foreground)" }}>{c.state}</div>
                  </div>
                ))}
              </div>
            ) : null}
            {tab === "dirty" ? (
              <div className="flex flex-col gap-2">
                {dirty.length === 0 ? <div className="text-body" style={{ color: "var(--color-on-surface-variant)" }}>暂无脏数据</div> : null}
                {dirty.map((d, i) => (
                  <div key={i} className="p-3 rounded-sm" style={{ background: "var(--color-danger-bg)", border: "1px solid var(--color-danger-line)" }}>
                    <div className="text-caption mb-1" style={{ color: "var(--color-on-surface-variant)" }}>step: {d.stepId} · run: {d.runId}</div>
                    <div className="text-body mb-1" style={{ color: "var(--color-danger)" }}>{d.error}</div>
                    <pre className="td-mono text-caption overflow-x-auto" style={{ color: "var(--color-foreground)" }}>{JSON.stringify(d.raw, null, 2)}</pre>
                  </div>
                ))}
              </div>
            ) : null}
            {tab === "audit" ? (
              <div className="ds-table-wrap">
                <table className="ds-table">
                  <thead><tr><th>审计点</th><th>时间</th><th>条数</th><th>字节</th><th>延迟</th></tr></thead>
                  <tbody>
                    {audit.map((a, i) => (
                      <tr key={i}>
                        <td className="td-mono">{a.auditPoint}</td>
                        <td className="td-mono text-caption">{a.logTs}</td>
                        <td className="td-mono">{a.count}</td>
                        <td className="td-mono">{a.bytes}</td>
                        <td className="td-mono">{a.delayMs}ms</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : null}
      </Drawer>

      {toast ? <div className="fixed top-4 right-4 z-[400]"><StatusTag tone={toast.tone} dot>{toast.text}</StatusTag></div> : null}
    </AdminPageContainer>
  );
}
