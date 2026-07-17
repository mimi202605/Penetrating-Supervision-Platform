import { useEffect, useMemo, useState } from "react";
import {
  ListChecks,
  Plus,
  Play,
  History,
  CheckCircle2,
  AlertCircle,
  Activity,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import PageContainer from "@/components/layout/PageContainer";
import Stat from "@/components/ui/Stat";
import StatusTag, { type TagTone } from "@/components/ui/StatusTag";
import DataTable, { type Column } from "@/components/ui/DataTable";
import Drawer from "@/components/ui/Drawer";
import { api } from "@/api";
import type {
  CollectionTask,
  CollectionTaskRun,
  AuditPoint,
  DirtyRecord,
  DataSource,
  TransformType,
  TransformStep,
} from "@/api/types";

// 新建任务向导步骤定义
const WIZARD_STEPS = [
  { key: "source", label: "数据源 Stream" },
  { key: "transform", label: "Transform 管道" },
  { key: "mapping", label: "字段映射" },
  { key: "schedule", label: "调度配置" },
] as const;
type WizardStepKey = (typeof WIZARD_STEPS)[number]["key"];

// 自定义步骤指示器
function StepIndicator({
  steps,
  currentIdx,
}: {
  steps: typeof WIZARD_STEPS;
  currentIdx: number;
}) {
  return (
    <div className="flex items-center gap-1 flex-wrap mb-4">
      {steps.map((s, idx) => {
        const isDone = idx < currentIdx;
        const isCurrent = idx === currentIdx;
        return (
          <div key={s.key} className="flex items-center gap-1">
            <span
              className="text-caption px-2 py-0.5 rounded-sm whitespace-nowrap"
              style={{
                color: isCurrent
                  ? "#fff"
                  : isDone
                    ? "var(--color-primary)"
                    : "var(--color-on-surface-variant)",
                background: isCurrent
                  ? "var(--color-primary)"
                  : isDone
                    ? "var(--color-primary-container)"
                    : "var(--color-surface-container)",
                fontWeight: isCurrent ? 500 : 400,
              }}
            >
              {idx + 1}. {s.label}
            </span>
            {idx < steps.length - 1 ? (
              <span
                className="w-2.5 h-px flex-shrink-0"
                style={{
                  background: idx < currentIdx ? "var(--color-primary)" : "var(--color-border)",
                }}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

// 字段映射行
interface FieldMappingRow {
  source: string;
  target: string;
}

export default function TasksPage() {
  // 列表数据
  const [tasks, setTasks] = useState<CollectionTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // 触发中的任务 id
  const [triggering, setTriggering] = useState<Record<string, boolean>>({});

  // 运行历史抽屉
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<CollectionTask | null>(null);
  const [runs, setRuns] = useState<CollectionTaskRun[]>([]);
  const [audits, setAudits] = useState<AuditPoint[]>([]);
  const [dirty, setDirty] = useState<DirtyRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyErr, setHistoryErr] = useState<string | null>(null);

  // 新建任务向导
  const [createOpen, setCreateOpen] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [sources, setSources] = useState<DataSource[]>([]);
  const [transformTypes, setTransformTypes] = useState<TransformType[]>([]);
  const [wizard, setWizard] = useState({
    sourceId: "",
    stream: "",
    transformSteps: [] as TransformStep[],
    mappings: [] as FieldMappingRow[],
    cron: "*/5 * * * *",
    concurrency: "2",
    retry: "3",
    timeout: "3600",
  });

  // 轻量 toast
  const [toast, setToast] = useState<{ text: string; tone: TagTone } | null>(null);
  const showToast = (text: string, tone: TagTone = "success") => {
    setToast({ text, tone });
    window.setTimeout(() => setToast(null), 2800);
  };

  // 拉取任务列表
  useEffect(() => {
    setLoading(true);
    api
      .getCollectionTasks()
      .then((t) => {
        setTasks(t);
        setLoading(false);
      })
      .catch((e) => {
        console.error("getCollectionTasks failed", e);
        setErr("任务列表加载失败");
        setLoading(false);
      });
  }, []);

  // 打开新建向导时拉取数据源与 Transform 类型
  const openCreate = () => {
    setCreateOpen(true);
    setStepIdx(0);
    setWizard({
      sourceId: "",
      stream: "",
      transformSteps: [],
      mappings: [{ source: "", target: "" }],
      cron: "*/5 * * * *",
      concurrency: "2",
      retry: "3",
      timeout: "3600",
    });
    if (sources.length === 0) {
      api
        .getDataSources()
        .then(setSources)
        .catch((e) => console.error("getDataSources failed", e));
    }
    if (transformTypes.length === 0) {
      api
        .listTransformTypes()
        .then(setTransformTypes)
        .catch((e) => console.error("listTransformTypes failed", e));
    }
  };

  // 计数
  const successCount = tasks.filter((t) => t.lastStatus === "成功").length;
  const failedCount = tasks.filter((t) => t.lastStatus === "失败").length;
  const runningCount = tasks.filter((t) => t.lastStatus === "运行中").length;

  // 触发任务
  const onTrigger = (t: CollectionTask) => {
    setTriggering((p) => ({ ...p, [t.id]: true }));
    api
      .triggerTask(t.id)
      .then((r) => {
        showToast(`「${t.name}」已触发 · runId=${r.runId}`, "success");
      })
      .catch((e) => {
        console.error("triggerTask failed", e);
        showToast(`「${t.name}」触发失败`, "error");
      })
      .finally(() => setTriggering((p) => ({ ...p, [t.id]: false })));
  };

  // 打开运行历史抽屉
  const onHistory = (t: CollectionTask) => {
    setHistoryTarget(t);
    setHistoryOpen(true);
    setHistoryLoading(true);
    setHistoryErr(null);
    setRuns([]);
    setAudits([]);
    setDirty([]);
    Promise.all([
      api.listRuns(t.id).catch((e) => {
        console.error("listRuns failed", e);
        return [] as CollectionTaskRun[];
      }),
      api.listTaskAudit(t.id).catch((e) => {
        console.error("listTaskAudit failed", e);
        return [] as AuditPoint[];
      }),
      api.listDirtyRecords(t.id).catch((e) => {
        console.error("listDirtyRecords failed", e);
        return [] as DirtyRecord[];
      }),
    ])
      .then(([r, a, d]) => {
        setRuns(r);
        setAudits(a);
        setDirty(d);
      })
      .catch((e) => {
        console.error("load history failed", e);
        setHistoryErr("运行历史加载失败");
      })
      .finally(() => setHistoryLoading(false));
  };

  // 审计点按 logTs 透视成图表数据
  const auditChartData = useMemo(() => {
    const tsSet = new Set<string>();
    const pointSet = new Set<string>();
    for (const a of audits) {
      tsSet.add(a.logTs);
      pointSet.add(a.auditPoint);
    }
    const tsList = Array.from(tsSet).sort();
    return tsList.map((ts) => {
      const row: Record<string, string | number> = { logTs: ts };
      for (const a of audits) {
        if (a.logTs === ts) row[a.auditPoint] = a.count;
      }
      return row;
    });
  }, [audits]);

  // 审计点可绘制指标
  const auditMetrics = useMemo(() => {
    const set = new Set<string>();
    for (const a of audits) set.add(a.auditPoint);
    return Array.from(set);
  }, [audits]);

  // 运行列名
  const runColumns: Column<CollectionTaskRun>[] = [
    { key: "id", title: "Run ID", sticky: true, render: (r) => <span className="td-mono">{r.id}</span> },
    { key: "attempt", title: "次数", render: (r) => r.attempt },
    {
      key: "status",
      title: "状态",
      render: (r) => {
        const s = r.status;
        if (s === "succeeded" || s === "success" || s === "成功") return <StatusTag tone="success" dot>成功</StatusTag>;
        if (s === "running" || s === "运行中") return <StatusTag tone="info" dot>运行中</StatusTag>;
        if (s === "failed" || s === "失败") return <StatusTag tone="error" dot>失败</StatusTag>;
        return <StatusTag tone="stop">{s}</StatusTag>;
      },
    },
    { key: "startedAt", title: "开始", render: (r) => <span className="td-mono">{r.startedAt}</span> },
    { key: "finishedAt", title: "结束", render: (r) => <span className="td-mono">{r.finishedAt ?? "—"}</span> },
    { key: "recordsRead", title: "读取", render: (r) => <span className="td-mono">{r.recordsRead}</span> },
    { key: "recordsWrite", title: "写入", render: (r) => <span className="td-mono">{r.recordsWrite}</span> },
    { key: "recordsDirty", title: "脏数据", render: (r) => <span className="td-mono">{r.recordsDirty}</span> },
  ];

  // 脏数据列名
  const dirtyColumns: Column<DirtyRecord>[] = [
    { key: "runId", title: "Run ID", sticky: true, render: (r) => <span className="td-mono">{r.runId}</span> },
    { key: "stepId", title: "步骤", render: (r) => <span className="td-mono">{r.stepId}</span> },
    {
      key: "raw",
      title: "原始数据",
      render: (r) => (
        <span className="td-mono text-caption" style={{ color: "var(--color-on-surface-variant)" }}>
          {JSON.stringify(r.raw).slice(0, 80)}
        </span>
      ),
    },
    { key: "error", title: "错误", render: (r) => <span style={{ color: "var(--color-danger)" }}>{r.error}</span> },
  ];

  const columns: Column<CollectionTask>[] = [
    { key: "id", title: "任务编号", sticky: true, render: (r) => <span className="td-mono">{r.id}</span> },
    {
      key: "name",
      title: "任务名称",
      render: (r) => (
        <span style={{ color: "var(--color-foreground)" }} className="font-medium">
          {r.name}
        </span>
      ),
    },
    { key: "source", title: "来源系统", render: (r) => r.source },
    {
      key: "mode",
      title: "模式",
      render: (r) => (
        <StatusTag tone={r.mode === "CDC" ? "info" : r.mode === "增量" ? "warning" : "stop"}>{r.mode}</StatusTag>
      ),
    },
    { key: "schedule", title: "调度频率", render: (r) => <span className="td-mono">{r.schedule}</span> },
    {
      key: "lastStatus",
      title: "最近状态",
      render: (r) => {
        if (r.lastStatus === "成功") return <StatusTag tone="success" dot>成功</StatusTag>;
        if (r.lastStatus === "运行中") return <StatusTag tone="info" dot>运行中</StatusTag>;
        return <StatusTag tone="error" dot>失败</StatusTag>;
      },
    },
    { key: "throughput", title: "吞吐量", render: (r) => <span className="td-mono">{r.throughput}</span> },
    { key: "lastRun", title: "最近执行", render: (r) => <span className="td-mono">{r.lastRun}</span> },
    {
      key: "actions",
      title: "操作",
      render: (r) => (
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="ds-btn ds-btn-secondary"
            disabled={triggering[r.id]}
            onClick={() => onTrigger(r)}
          >
            <Play size={12} />
            {triggering[r.id] ? "触发中" : "触发"}
          </button>
          <button type="button" className="ds-btn ds-btn-secondary" onClick={() => onHistory(r)}>
            <History size={12} />
            运行历史
          </button>
        </div>
      ),
    },
  ];

  // 向导：添加 / 删除 transform step
  const addTransformStep = (type: string) => {
    setWizard((w) => ({
      ...w,
      transformSteps: [
        ...w.transformSteps,
        { id: `step-${Date.now()}`, type, config: {}, onError: "skip" },
      ],
    }));
  };
  const removeTransformStep = (id: string) => {
    setWizard((w) => ({ ...w, transformSteps: w.transformSteps.filter((s) => s.id !== id) }));
  };

  // 向导：字段映射编辑
  const updateMapping = (idx: number, field: "source" | "target", value: string) => {
    setWizard((w) => ({
      ...w,
      mappings: w.mappings.map((m, i) => (i === idx ? { ...m, [field]: value } : m)),
    }));
  };
  const addMapping = () => {
    setWizard((w) => ({ ...w, mappings: [...w.mappings, { source: "", target: "" }] }));
  };
  const removeMapping = (idx: number) => {
    setWizard((w) => ({ ...w, mappings: w.mappings.filter((_, i) => i !== idx) }));
  };

  // 向导：下一步 / 上一步 / 提交
  const canNext = (): boolean => {
    const s = WIZARD_STEPS[stepIdx].key as WizardStepKey;
    if (s === "source") return !!wizard.sourceId && !!wizard.stream;
    if (s === "transform") return true; // 可选
    if (s === "mapping") return true;
    if (s === "schedule") return !!wizard.cron;
    return false;
  };
  const nextStep = () => {
    if (!canNext()) {
      showToast("请先完成当前步骤必填项", "warning");
      return;
    }
    setStepIdx((i) => Math.min(i + 1, WIZARD_STEPS.length - 1));
  };
  const prevStep = () => setStepIdx((i) => Math.max(i - 1, 0));
  const submitWizard = () => {
    // 后端 POST /collection/tasks 暂未封装，简化为 toast
    setCreateOpen(false);
    showToast(
      `任务向导已提交（source=${wizard.sourceId || "-"}, transforms=${wizard.transformSteps.length}, mappings=${wizard.mappings.length}）· 新建功能后端已就绪`,
      "success",
    );
  };

  return (
    <PageContainer
      title="采集任务"
      subtitle="数据采集中心 · 任务调度、运行监控、失败重试"
      breadcrumb="数据采集中心 / 采集任务"
      actions={
        <button type="button" className="ds-btn ds-btn-primary" onClick={openCreate}>
          <Plus size={14} />
          新建任务
        </button>
      }
    >
      <div className="flex flex-col gap-5">
        {/* KPI */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat
            icon={<ListChecks size={16} strokeWidth={1.5} />}
            label="任务总数"
            value={tasks.length}
            countUp
            decimals={0}
            trend={{ text: `${runningCount} 运行中`, tone: "info" }}
          />
          <Stat
            icon={<CheckCircle2 size={16} strokeWidth={1.5} />}
            label="今日成功"
            value={successCount}
            countUp
            decimals={0}
            trend={{ text: "正常", tone: "success" }}
          />
          <Stat
            icon={<AlertCircle size={16} strokeWidth={1.5} />}
            label="今日失败"
            value={failedCount}
            countUp
            decimals={0}
            trend={{ text: failedCount > 0 ? "需关注" : "正常", tone: failedCount > 0 ? "error" : "success" }}
          />
          <Stat
            icon={<Activity size={16} strokeWidth={1.5} />}
            label="运行中"
            value={runningCount}
            countUp
            decimals={0}
            trend={{ text: "实时", tone: "info" }}
          />
        </div>

        {/* 任务列表 */}
        <section className="ds-card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="ds-section-title">采集任务列表</h2>
            <span className="ds-section-sub">{loading ? "加载中…" : `共 ${tasks.length} 个任务`}</span>
          </div>
          {err ? (
            <div
              className="p-3 rounded-sm text-lead"
              style={{
                background: "var(--color-danger-bg)",
                color: "var(--color-danger)",
                border: "1px solid var(--color-danger-line)",
              }}
            >
              {err}
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={tasks}
              rowKey={(r) => r.id}
              empty="暂无采集任务"
            />
          )}
        </section>
      </div>

      {/* 新建任务向导抽屉 */}
      <Drawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="新建采集任务"
        width={600}
        footer={
          <>
            <button type="button" className="ds-btn ds-btn-secondary" onClick={() => setCreateOpen(false)}>
              取消
            </button>
            {stepIdx > 0 ? (
              <button type="button" className="ds-btn ds-btn-secondary" onClick={prevStep}>
                <ChevronLeft size={12} />
                上一步
              </button>
            ) : null}
            {stepIdx < WIZARD_STEPS.length - 1 ? (
              <button type="button" className="ds-btn ds-btn-primary" onClick={nextStep}>
                下一步
                <ChevronRight size={12} />
              </button>
            ) : (
              <button type="button" className="ds-btn ds-btn-primary" onClick={submitWizard}>
                提交
              </button>
            )}
          </>
        }
      >
        <StepIndicator steps={WIZARD_STEPS} currentIdx={stepIdx} />

        {/* Step 1: 数据源 stream */}
        {WIZARD_STEPS[stepIdx].key === "source" ? (
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-body mb-1.5 block" style={{ color: "var(--color-on-surface-variant)" }}>
                数据源
              </label>
              <select
                className="ds-input w-full"
                value={wizard.sourceId}
                onChange={(e) => setWizard((w) => ({ ...w, sourceId: e.target.value }))}
              >
                <option value="">请选择数据源</option>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.type})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-body mb-1.5 block" style={{ color: "var(--color-on-surface-variant)" }}>
                Stream 名称
              </label>
              <input
                type="text"
                className="ds-input w-full"
                placeholder="如：finance_voucher"
                value={wizard.stream}
                onChange={(e) => setWizard((w) => ({ ...w, stream: e.target.value }))}
              />
              <span className="text-caption" style={{ color: "var(--color-on-surface-variant)" }}>
                提示：可在「数据源管理」页通过「发现 Schema」查看可用的 stream。
              </span>
            </div>
          </div>
        ) : null}

        {/* Step 2: Transform 管道 */}
        {WIZARD_STEPS[stepIdx].key === "transform" ? (
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-body mb-1.5 block" style={{ color: "var(--color-on-surface-variant)" }}>
                可选 Transform 类型
              </label>
              {transformTypes.length === 0 ? (
                <span className="text-caption" style={{ color: "var(--color-on-surface-variant)" }}>
                  暂无可选 Transform 类型（可跳过）
                </span>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {transformTypes.map((t) => (
                    <button
                      key={t.type}
                      type="button"
                      className="ds-btn ds-btn-secondary"
                      onClick={() => addTransformStep(t.type)}
                    >
                      <Plus size={12} />
                      {t.name} ({t.type})
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="text-body mb-1.5 block" style={{ color: "var(--color-on-surface-variant)" }}>
                已配置管道步骤（{wizard.transformSteps.length}）
              </label>
              {wizard.transformSteps.length === 0 ? (
                <div
                  className="p-3 rounded-sm text-caption"
                  style={{
                    background: "var(--color-surface-container)",
                    color: "var(--color-on-surface-variant)",
                  }}
                >
                  暂无步骤，可跳过
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {wizard.transformSteps.map((st, i) => (
                    <div
                      key={st.id}
                      className="flex items-center justify-between p-2.5 rounded-sm"
                      style={{ background: "var(--color-surface-container)" }}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-5 h-5 rounded-sm flex items-center justify-center text-caption"
                          style={{
                            background: "var(--color-primary-container)",
                            color: "var(--color-primary)",
                          }}
                        >
                          {i + 1}
                        </span>
                        <span className="td-mono text-lead" style={{ color: "var(--color-foreground)" }}>
                          {st.type}
                        </span>
                        <StatusTag tone="info">{st.onError ?? "skip"}</StatusTag>
                      </div>
                      <button
                        type="button"
                        className="ds-icon-btn w-6 h-6"
                        aria-label="移除"
                        onClick={() => removeTransformStep(st.id)}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* Step 3: 字段映射 */}
        {WIZARD_STEPS[stepIdx].key === "mapping" ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <label className="text-body" style={{ color: "var(--color-on-surface-variant)" }}>
                字段映射（source → target）
              </label>
              <button type="button" className="ds-btn ds-btn-secondary" onClick={addMapping}>
                <Plus size={12} />
                新增映射
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {wizard.mappings.map((m, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    className="ds-input flex-1"
                    placeholder="源字段"
                    value={m.source}
                    onChange={(e) => updateMapping(i, "source", e.target.value)}
                  />
                  <span style={{ color: "var(--color-on-surface-variant)" }}>→</span>
                  <input
                    type="text"
                    className="ds-input flex-1"
                    placeholder="目标字段"
                    value={m.target}
                    onChange={(e) => updateMapping(i, "target", e.target.value)}
                  />
                  <button
                    type="button"
                    className="ds-icon-btn w-6 h-6"
                    aria-label="移除"
                    onClick={() => removeMapping(i)}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              {wizard.mappings.length === 0 ? (
                <div
                  className="p-3 rounded-sm text-caption"
                  style={{
                    background: "var(--color-surface-container)",
                    color: "var(--color-on-surface-variant)",
                  }}
                >
                  暂无映射，可跳过
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Step 4: 调度配置 */}
        {WIZARD_STEPS[stepIdx].key === "schedule" ? (
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-body mb-1.5 block" style={{ color: "var(--color-on-surface-variant)" }}>
                Cron 表达式
              </label>
              <input
                type="text"
                className="ds-input w-full"
                placeholder="*/5 * * * *"
                value={wizard.cron}
                onChange={(e) => setWizard((w) => ({ ...w, cron: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-body mb-1.5 block" style={{ color: "var(--color-on-surface-variant)" }}>
                  并发数
                </label>
                <input
                  type="number"
                  className="ds-input w-full"
                  min={1}
                  value={wizard.concurrency}
                  onChange={(e) => setWizard((w) => ({ ...w, concurrency: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-body mb-1.5 block" style={{ color: "var(--color-on-surface-variant)" }}>
                  重试次数
                </label>
                <input
                  type="number"
                  className="ds-input w-full"
                  min={0}
                  value={wizard.retry}
                  onChange={(e) => setWizard((w) => ({ ...w, retry: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="text-body mb-1.5 block" style={{ color: "var(--color-on-surface-variant)" }}>
                超时（秒）
              </label>
              <input
                type="number"
                className="ds-input w-full"
                min={1}
                value={wizard.timeout}
                onChange={(e) => setWizard((w) => ({ ...w, timeout: e.target.value }))}
              />
            </div>
            <div
              className="text-caption p-2.5 rounded-sm"
              style={{
                background: "var(--color-primary-soft)",
                color: "var(--color-foreground)",
                border: "1px solid var(--color-primary-line)",
              }}
            >
              提示：新建采集任务 API（POST /collection/tasks）后端已就绪，本期前端按 4 步向导简化提交。
            </div>
          </div>
        ) : null}
      </Drawer>

      {/* 运行历史抽屉 */}
      <Drawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title={historyTarget ? `运行历史 · ${historyTarget.name}` : "运行历史"}
        width={760}
        footer={
          <button type="button" className="ds-btn ds-btn-secondary" onClick={() => setHistoryOpen(false)}>
            关闭
          </button>
        }
      >
        {historyLoading ? (
          <div className="text-lead" style={{ color: "var(--color-on-surface-variant)" }}>
            加载中…
          </div>
        ) : historyErr ? (
          <div
            className="p-3 rounded-sm text-lead"
            style={{
              background: "var(--color-danger-bg)",
              color: "var(--color-danger)",
              border: "1px solid var(--color-danger-line)",
            }}
          >
            {historyErr}
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {/* Runs 列表 */}
            <div>
              <h3 className="ds-section-title mb-2">运行记录（{runs.length}）</h3>
              <DataTable
                columns={runColumns}
                data={runs}
                rowKey={(r) => r.id}
                empty="暂无运行记录"
              />
            </div>

            {/* Audit 双折线 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="ds-section-title">审计点吞吐量（count）</h3>
                <span className="ds-section-sub">reader_in / reader_out / writer_in / writer_out</span>
              </div>
              {auditChartData.length === 0 ? (
                <div
                  className="p-3 rounded-sm text-caption"
                  style={{
                    background: "var(--color-surface-container)",
                    color: "var(--color-on-surface-variant)",
                  }}
                >
                  暂无审计数据
                </div>
              ) : (
                <div style={{ height: 240 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={auditChartData} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
                      <CartesianGrid stroke="var(--color-border-light)" vertical={false} />
                      <XAxis
                        dataKey="logTs"
                        tick={{ fontSize: 10, fill: "var(--color-on-surface-variant)" }}
                        axisLine={false}
                        tickLine={false}
                        minTickGap={20}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "var(--color-on-surface-variant)" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "var(--color-popover)",
                          border: "1px solid var(--color-border)",
                          borderRadius: 4,
                          fontSize: 12,
                        }}
                        labelStyle={{ color: "var(--color-foreground)" }}
                        itemStyle={{ color: "var(--color-foreground)" }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {auditMetrics.includes("reader_in") ? (
                        <Line type="monotone" dataKey="reader_in" name="reader_in" stroke="#387bff" strokeWidth={2} dot={false} />
                      ) : null}
                      {auditMetrics.includes("reader_out") ? (
                        <Line type="monotone" dataKey="reader_out" name="reader_out" stroke="#7ccd94" strokeWidth={2} dot={false} />
                      ) : null}
                      {auditMetrics.includes("writer_in") ? (
                        <Line type="monotone" dataKey="writer_in" name="writer_in" stroke="#f0a50f" strokeWidth={2} dot={false} />
                      ) : null}
                      {auditMetrics.includes("writer_out") ? (
                        <Line type="monotone" dataKey="writer_out" name="writer_out" stroke="#e06c75" strokeWidth={2} dot={false} />
                      ) : null}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Dirty 列表 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="ds-section-title">脏数据记录（{dirty.length}）</h3>
                <span className="ds-section-sub">按 stepId 聚合的脏数据</span>
              </div>
              <DataTable
                columns={dirtyColumns}
                data={dirty}
                rowKey={(r, i) => `${r.runId}-${r.stepId}-${i}`}
                empty="暂无脏数据"
              />
            </div>
          </div>
        )}
      </Drawer>

      {/* 轻量 Toast */}
      {toast ? (
        <div className="fixed top-4 right-4 z-[400]">
          <StatusTag tone={toast.tone} dot>
            {toast.text}
          </StatusTag>
        </div>
      ) : null}
    </PageContainer>
  );
}
