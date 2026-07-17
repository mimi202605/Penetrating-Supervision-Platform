import { useEffect, useState } from "react";
import { Database, Activity, AlertCircle, CheckCircle2 } from "lucide-react";
import PageContainer from "@/components/layout/PageContainer";
import Stat from "@/components/ui/Stat";
import StatusTag from "@/components/ui/StatusTag";
import DataTable, { type Column } from "@/components/ui/DataTable";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { api } from "@/api";
import * as mock from "@/mock";
import type { CollectionTask, TrendPoint } from "@/api/types";

export default function CollectionOverviewPage() {
  const [tasks, setTasks] = useState<CollectionTask[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>(mock.collectionTrend);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getCollectionTasks().then((t) => {
      setTasks(t);
      setLoading(false);
    });
    api.getCollectionTrend().then(setTrend);
  }, []);

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
      </div>
    </PageContainer>
  );
}
