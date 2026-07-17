import { Link } from "react-router-dom";
import DataTable, { type Column } from "@/components/ui/DataTable";
import { RiskLevelTag, RiskStatusTag } from "@/components/ui/StatusTag";
import type { RiskWarning } from "@/api/types";

interface RiskWarningTableProps {
  data: RiskWarning[];
  /** 是否显示"查看全部"链接 */
  showAll?: boolean;
  onRowClick?: (row: RiskWarning) => void;
}

export default function RiskWarningTable({
  data,
  showAll = true,
  onRowClick,
}: RiskWarningTableProps) {
  const columns: Column<RiskWarning>[] = [
    {
      key: "title",
      title: "风险标题",
      sticky: true,
      render: (r) => (
        <span style={{ color: "var(--color-foreground)" }} className="font-medium">
          {r.title}
        </span>
      ),
    },
    { key: "domain", title: "业务领域", render: (r) => r.domain },
    {
      key: "level",
      title: "风险级别",
      render: (r) => <RiskLevelTag level={r.level} />,
    },
    { key: "subject", title: "监管主体", render: (r) => r.subject },
    { key: "rule", title: "命中规则", render: (r) => r.rule },
    {
      key: "triggeredAt",
      title: "触发时间",
      render: (r) => <span className="td-mono">{r.triggeredAt}</span>,
    },
    {
      key: "status",
      title: "状态",
      render: (r) => <RiskStatusTag status={r.status} />,
    },
    {
      key: "action",
      title: "操作",
      render: () => (
        <a className="ds-action-link" onClick={(e) => e.stopPropagation()}>
          查看
        </a>
      ),
    },
  ];

  return (
    <section className="ds-card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="ds-section-title">实时风险预警</h2>
        {showAll ? (
          <Link to="/monitoring/risk-warnings" className="ds-action-link">
            查看全部 →
          </Link>
        ) : null}
      </div>
      <DataTable
        columns={columns}
        data={data}
        rowKey={(r) => r.id}
        onRowClick={onRowClick ? (r) => onRowClick(r) : undefined}
      />
    </section>
  );
}
