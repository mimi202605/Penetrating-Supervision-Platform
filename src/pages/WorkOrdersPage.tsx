import { useEffect, useState } from "react";
import { Plus, Filter } from "lucide-react";
import PageContainer from "@/components/layout/PageContainer";
import StatusTag from "@/components/ui/StatusTag";
import Segmented from "@/components/ui/Segmented";
import DataTable, { type Column } from "@/components/ui/DataTable";
import MiniSteps, { WORK_ORDER_NODES } from "@/components/ui/MiniSteps";
import Progress from "@/components/ui/Progress";
import { api } from "@/api";
import * as mock from "@/mock";
import type { WorkOrder, WorkOrderStatus } from "@/api/types";

export default function WorkOrdersPage() {
  const [list, setList] = useState<WorkOrder[]>(mock.workOrders);
  const [filter, setFilter] = useState<WorkOrderStatus | "all">("all");
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    api.getWorkOrders().then(setList);
  }, []);

  const filtered = filter === "all" ? list : list.filter((w) => w.status === filter);

  const columns: Column<WorkOrder>[] = [
    {
      key: "id",
      title: "工单编号",
      sticky: true,
      render: (r) => <span className="td-mono">{r.id}</span>,
    },
    { key: "riskSource", title: "风险来源", render: (r) => <span style={{ color: "var(--color-foreground)" }} className="font-medium">{r.riskSource}</span> },
    { key: "owner", title: "负责人", render: (r) => r.owner },
    {
      key: "currentNode",
      title: "当前节点",
      render: (r) => <MiniSteps nodes={WORK_ORDER_NODES} current={r.currentNode} />,
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
          <StatusTag tone="info" dot>进行中</StatusTag>
        ) : (
          <StatusTag tone="stop">已归档</StatusTag>
        ),
    },
    {
      key: "action",
      title: "操作",
      render: () => <a className="ds-action-link" onClick={(e) => e.stopPropagation()}>查看</a>,
    },
  ];

  const stats = {
    processing: list.filter((w) => w.status === "processing").length,
    archived: list.filter((w) => w.status === "archived").length,
    onTime: "96%",
    avgTime: "4.2h",
  };

  return (
    <PageContainer
      title="核查工单"
      subtitle="调度指挥中心 · 核查 → 整改 → 复核 → 归档 全闭环流转"
      breadcrumb="调度指挥中心 / 核查工单"
      actions={
        <>
          <Segmented<WorkOrderStatus | "all">
            value={filter}
            onChange={setFilter}
            size="sm"
            options={[
              { value: "all", label: "全部" },
              { value: "processing", label: "进行中" },
              { value: "archived", label: "已归档" },
            ]}
          />
          <button
            type="button"
            className="ds-btn ds-btn-secondary"
            aria-label="筛选"
          >
            <Filter size={14} />
            筛选
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="ds-btn ds-btn-primary"
          >
            <Plus size={14} />
            新建工单
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {/* 统计卡 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "进行中工单", value: stats.processing, tone: "info" as const },
            { label: "已归档工单", value: stats.archived, tone: "stop" as const },
            { label: "按时处置率", value: stats.onTime, tone: "success" as const },
            { label: "平均处置时长", value: stats.avgTime, tone: "warning" as const },
          ].map((s) => (
            <div key={s.label} className="ds-card flex flex-col gap-2">
              <span className="text-body" style={{ color: "var(--color-on-surface-variant)" }}>
                {s.label}
              </span>
              <span
                className="text-[26px] font-semibold leading-none"
                style={{ color: "var(--color-foreground)" }}
              >
                {s.value}
              </span>
              <StatusTag tone={s.tone}>实时</StatusTag>
            </div>
          ))}
        </div>

        {/* 列表 */}
        <section className="ds-card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="ds-section-title">工单列表</h2>
            <span className="ds-section-sub">共 {filtered.length} 条</span>
          </div>
          <DataTable
            columns={columns}
            data={filtered}
            rowKey={(r) => r.id}
          />
        </section>

        {/* 新建工单弹窗（简化版） */}
        {showCreate ? (
          <div
            className="fixed inset-0 z-[300] flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.55)" }}
            onClick={() => setShowCreate(false)}
          >
            <div
              className="w-full max-w-[480px] rounded-md"
              style={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                boxShadow: "var(--tw-shadow, 0 24px 48px rgba(0,0,0,0.4))",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="flex items-center justify-between h-14 px-5"
                style={{ borderBottom: "1px solid var(--color-border)" }}
              >
                <span
                  className="text-h3 font-medium"
                  style={{ color: "var(--color-foreground)" }}
                >
                  新建核查工单
                </span>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="ds-icon-btn"
                  aria-label="关闭"
                >
                  ✕
                </button>
              </div>
              <div className="p-5 flex flex-col gap-4">
                <div>
                  <label
                    className="text-body block mb-1.5"
                    style={{ color: "var(--color-on-surface-variant)" }}
                  >
                    关联风险源
                  </label>
                  <input
                    className="ds-input w-full"
                    placeholder="选择风险预警编号"
                  />
                </div>
                <div>
                  <label
                    className="text-body block mb-1.5"
                    style={{ color: "var(--color-on-surface-variant)" }}
                  >
                    负责人
                  </label>
                  <input
                    className="ds-input w-full"
                    placeholder="输入核查负责人"
                  />
                </div>
                <div>
                  <label
                    className="text-body block mb-1.5"
                    style={{ color: "var(--color-on-surface-variant)" }}
                  >
                    节点配置
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {WORK_ORDER_NODES.map((n, i) => (
                      <span key={n} className="flex items-center gap-1.5">
                        <MiniSteps nodes={[n]} current={n} />
                        {i < WORK_ORDER_NODES.length - 1 ? (
                          <span style={{ color: "var(--color-on-surface-variant)" }}>→</span>
                        ) : null}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div
                className="flex items-center justify-end gap-2 h-16 px-5"
                style={{ borderTop: "1px solid var(--color-border)" }}
              >
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="ds-btn ds-btn-secondary"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="ds-btn ds-btn-primary"
                >
                  创建
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </PageContainer>
  );
}
