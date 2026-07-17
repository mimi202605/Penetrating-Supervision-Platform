import { Link } from "react-router-dom";
import DataTable, { type Column } from "@/components/ui/DataTable";
import StatusTag from "@/components/ui/StatusTag";
import MiniSteps, { WORK_ORDER_NODES } from "@/components/ui/MiniSteps";
import Progress from "@/components/ui/Progress";
import type { WorkOrder } from "@/api/types";

interface WorkOrderTableProps {
  data: WorkOrder[];
  showAll?: boolean;
}

export default function WorkOrderTable({ data, showAll = true }: WorkOrderTableProps) {
  const columns: Column<WorkOrder>[] = [
    {
      key: "id",
      title: "工单编号",
      sticky: true,
      render: (r) => <span className="td-mono">{r.id}</span>,
    },
    { key: "riskSource", title: "风险来源", render: (r) => r.riskSource },
    { key: "owner", title: "负责人", render: (r) => r.owner },
    {
      key: "currentNode",
      title: "当前节点",
      render: (r) => (
        <MiniSteps nodes={WORK_ORDER_NODES} current={r.currentNode} />
      ),
    },
    {
      key: "progress",
      title: "进度",
      render: (r) => (
        <Progress
          value={r.progress}
          tone={r.progress === 100 ? "success" : "primary"}
          size="sm"
          showText
          className="min-w-[130px]"
        />
      ),
    },
    {
      key: "status",
      title: "状态",
      render: (r) =>
        r.status === "processing" ? (
          <StatusTag tone="info">进行中</StatusTag>
        ) : (
          <StatusTag tone="stop">已归档</StatusTag>
        ),
    },
    {
      key: "action",
      title: "操作",
      render: () => (
        <Link to="/dispatch/work-orders" className="ds-action-link">
          查看
        </Link>
      ),
    },
  ];

  const inProgress = data.filter((d) => d.status === "processing").length;
  const archived = data.filter((d) => d.status === "archived").length;
  const onTimeRate = "96%";

  return (
    <section className="ds-card">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="ds-section-title">核查工单处置</h2>
        <div className="flex gap-3">
          <span
            className="text-body"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
            进行中
            <b
              className="ml-1 font-semibold"
              style={{ color: "var(--color-foreground)" }}
            >
              {inProgress}
            </b>
          </span>
          <span
            className="text-body"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
            已归档
            <b
              className="ml-1 font-semibold"
              style={{ color: "var(--color-foreground)" }}
            >
              {archived}
            </b>
          </span>
          <span
            className="text-body"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
            按时率
            <b
              className="ml-1 font-semibold"
              style={{ color: "var(--color-foreground)" }}
            >
              {onTimeRate}
            </b>
          </span>
          {showAll ? (
            <Link to="/dispatch/work-orders" className="ds-action-link">
              查看全部 →
            </Link>
          ) : null}
        </div>
      </div>
      <DataTable columns={columns} data={data} rowKey={(r) => r.id} />
    </section>
  );
}
