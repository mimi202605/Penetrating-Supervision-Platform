import { useEffect, useMemo, useState } from "react";
import { Database, Activity, AlertCircle, CheckCircle2, Cable, ShieldCheck } from "lucide-react";
import PageContainer from "@/components/layout/PageContainer";
import Stat from "@/components/ui/Stat";
import StatusTag from "@/components/ui/StatusTag";
import DataTable, { type Column } from "@/components/ui/DataTable";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { api } from "@/api";
import * as mock from "@/mock";
import type {
  CollectionTask,
  TrendPoint,
  Connector,
  ConnectorCategory,
  RegulatoryScene,
} from "@/api/types";

// 连接器分类标签文案
const CATEGORY_LABELS: Record<ConnectorCategory, string> = {
  erp: "ERP",
  db: "数据库",
  file: "文件",
  mq: "消息队列",
  saas: "SaaS",
};

export default function CollectionOverviewPage() {
  const [tasks, setTasks] = useState<CollectionTask[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>(mock.collectionTrend);
  const [loading, setLoading] = useState(true);

  // 连接器统计
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [connectorsLoading, setConnectorsLoading] = useState(true);

  // 监管场景
  const [scenes, setScenes] = useState<RegulatoryScene[]>([]);
  const [scenesLoading, setScenesLoading] = useState(true);

  useEffect(() => {
    api.getCollectionTasks().then((t) => {
      setTasks(t);
      setLoading(false);
    });
    api.getCollectionTrend().then(setTrend);
    // 拉取连接器目录
    api
      .listConnectors()
      .then((c) => {
        setConnectors(c);
        setConnectorsLoading(false);
      })
      .catch((e) => {
        console.error("listConnectors failed", e);
        setConnectorsLoading(false);
      });
    // 拉取监管场景
    api
      .listRegulatoryScenes()
      .then((s) => {
        setScenes(s);
        setScenesLoading(false);
      })
      .catch((e) => {
        console.error("listRegulatoryScenes failed", e);
        setScenesLoading(false);
      });
  }, []);

  // 连接器按 category 分组计数
  const connectorsByCategory = useMemo(() => {
    const map: Record<ConnectorCategory, number> = { erp: 0, db: 0, file: 0, mq: 0, saas: 0 };
    for (const c of connectors) {
      if (map[c.category] !== undefined) map[c.category] += 1;
    }
    return map;
  }, [connectors]);

  // 监管场景按 domain 分组计数
  const scenesByDomain = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of scenes) {
      const d = s.domain || "未分类";
      map.set(d, (map.get(d) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [scenes]);

  const successCount = tasks.filter((t) => t.lastStatus === "成功").length;
  const runningCount = tasks.filter((t) => t.lastStatus === "运行中").length;
  const failedCount = tasks.filter((t) => t.lastStatus === "失败").length;

  const columns: Column<CollectionTask>[] = [
    {
      key: "id",
      title: "任务编号",
      sticky: true,
      render: (r) => <span className="td-mono">{r.id}</span>,
    },
    { key: "name", title: "任务名称", render: (r) => <span style={{ color: "var(--color-foreground)" }} className="font-medium">{r.name}</span> },
    { key: "source", title: "来源系统", render: (r) => r.source },
    {
      key: "mode",
      title: "模式",
      render: (r) => <StatusTag tone={r.mode === "CDC" ? "info" : r.mode === "增量" ? "warning" : "stop"}>{r.mode}</StatusTag>,
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
  ];

  return (
    <PageContainer
      title="数据采集概览"
      subtitle="数据采集中心 · 实时监控采集源 / 任务 / 趋势"
      breadcrumb="数据采集中心 / 数据采集概览"
    >
      <div className="flex flex-col gap-5">
        {/* KPI */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat
            icon={<Database size={16} strokeWidth={1.5} />}
            label="采集源数"
            value={246}
            countUp
            decimals={0}
            trend={{ text: "全部在线", tone: "success" }}
          />
          <Stat
            icon={<Activity size={16} strokeWidth={1.5} />}
            label="今日采集量"
            value={1.28}
            unit="亿条"
            countUp
            decimals={2}
            trend={{ text: "↑ 8.2%", tone: "success" }}
          />
          <Stat
            icon={<CheckCircle2 size={16} strokeWidth={1.5} />}
            label="成功任务"
            value={successCount || 6}
            countUp
            decimals={0}
            trend={{ text: `${runningCount} 运行中`, tone: "info" }}
          />
          <Stat
            icon={<AlertCircle size={16} strokeWidth={1.5} />}
            label="异常任务"
            value={failedCount}
            countUp
            decimals={0}
            trend={{ text: failedCount > 0 ? "需关注" : "正常", tone: failedCount > 0 ? "error" : "success" }}
          />
        </div>

        {/* 趋势图 */}
        <section className="ds-card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="ds-section-title">采集趋势（近30天）</h2>
            <span className="ds-section-sub">按业务域分类的日采集量（万条）</span>
          </div>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
                <CartesianGrid stroke="var(--color-border-light)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--color-on-surface-variant)" }} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis tick={{ fontSize: 10, fill: "var(--color-on-surface-variant)" }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 4, fontSize: 12 }}
                  labelStyle={{ color: "var(--color-foreground)" }}
                  itemStyle={{ color: "var(--color-foreground)" }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="finance" name="财务" stroke="#387bff" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="investment" name="投资" stroke="#7ccd94" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="financial" name="金融" stroke="#f0a50f" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="compliance" name="合规" stroke="#86909c" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* 任务列表 */}
        <section className="ds-card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="ds-section-title">采集任务列表</h2>
            <span className="ds-section-sub">{loading ? "加载中…" : `共 ${tasks.length} 个任务`}</span>
          </div>
          <DataTable
            columns={columns}
            data={tasks}
            rowKey={(r) => r.id}
            empty="暂无采集任务"
          />
        </section>

        {/* 连接器统计卡片 */}
        <section className="ds-card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="ds-section-title">连接器统计</h2>
            <span className="ds-section-sub">
              {connectorsLoading ? "加载中…" : `共 ${connectors.length} 个连接器 · 按 category 分组`}
            </span>
          </div>
          {!connectorsLoading && connectors.length === 0 ? (
            <div
              className="p-3 rounded-sm text-caption"
              style={{
                background: "var(--color-surface-container)",
                color: "var(--color-on-surface-variant)",
              }}
            >
              暂无连接器数据
            </div>
          ) : (
            <>
              {/* 分类计数 Stat 卡片 */}
              <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-3">
                <Stat
                  icon={<Cable size={16} strokeWidth={1.5} />}
                  label="连接器总数"
                  value={connectors.length}
                  countUp
                  decimals={0}
                />
                {(Object.keys(CATEGORY_LABELS) as ConnectorCategory[]).map((cat) => (
                  <Stat
                    key={cat}
                    label={CATEGORY_LABELS[cat]}
                    value={connectorsByCategory[cat]}
                    countUp
                    decimals={0}
                    trend={{ text: cat, tone: "info" }}
                  />
                ))}
              </div>
              {/* 明细小表格 */}
              <div className="flex flex-col gap-1.5">
                {connectors.length === 0 ? null : (
                  <DataTable
                    columns={
                      [
                        {
                          key: "name",
                          title: "连接器",
                          sticky: true,
                          render: (c: Connector) => (
                            <span style={{ color: "var(--color-foreground)" }} className="font-medium">
                              {c.name}
                            </span>
                          ),
                        },
                        {
                          key: "type",
                          title: "类型",
                          render: (c: Connector) => <span className="td-mono">{c.type}</span>,
                        },
                        {
                          key: "category",
                          title: "分类",
                          render: (c: Connector) => (
                            <StatusTag tone="info">{CATEGORY_LABELS[c.category]}</StatusTag>
                          ),
                        },
                        {
                          key: "capabilities",
                          title: "能力",
                          render: (c: Connector) => (
                            <span className="text-caption" style={{ color: "var(--color-on-surface-variant)" }}>
                              {c.capabilities.length > 0 ? c.capabilities.join("、") : "—"}
                            </span>
                          ),
                        },
                        {
                          key: "implemented",
                          title: "实现状态",
                          render: (c: Connector) =>
                            c.implemented ? (
                              <StatusTag tone="success" dot>已实现</StatusTag>
                            ) : (
                              <StatusTag tone="stop" dot>规划中</StatusTag>
                            ),
                        },
                      ] as Column<Connector>[]
                    }
                    data={connectors}
                    rowKey={(c) => c.type}
                    empty="暂无连接器"
                  />
                )}
              </div>
            </>
          )}
        </section>

        {/* 监管场景覆盖卡片 */}
        <section className="ds-card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="ds-section-title">监管场景覆盖</h2>
            <span className="ds-section-sub">
              {scenesLoading
                ? "加载中…"
                : `共 ${scenes.length} 个场景 · 按 domain 分组（已上线模型数后端已就绪，本期不展开 N+1 查询）`}
            </span>
          </div>
          {scenesLoading ? (
            <div className="text-lead" style={{ color: "var(--color-on-surface-variant)" }}>
              加载中…
            </div>
          ) : scenes.length === 0 ? (
            <div
              className="p-3 rounded-sm text-caption"
              style={{
                background: "var(--color-surface-container)",
                color: "var(--color-on-surface-variant)",
              }}
            >
              暂无监管场景数据
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <Stat
                icon={<ShieldCheck size={16} strokeWidth={1.5} />}
                label="场景总数"
                value={scenes.length}
                countUp
                decimals={0}
                trend={{ text: `${scenesByDomain.length} 个 domain`, tone: "info" }}
              />
              {scenesByDomain.map(([domain, count]) => (
                <Stat
                  key={domain}
                  label={domain}
                  value={count}
                  countUp
                  decimals={0}
                  trend={{ text: "场景", tone: "success" }}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </PageContainer>
  );
}
