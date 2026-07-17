import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, X } from "lucide-react";
import PageContainer from "@/components/layout/PageContainer";
import Segmented from "@/components/ui/Segmented";
import StatusTag from "@/components/ui/StatusTag";
import Drawer from "@/components/ui/Drawer";
import DataTable, { type Column } from "@/components/ui/DataTable";
import {
  RiskLevelTag,
  RiskStatusTag,
} from "@/components/ui/StatusTag";
import { api, type RiskFilter } from "@/api";
import * as mock from "@/mock";
import type { RiskWarning, RiskLevel, RiskStatus } from "@/api/types";

export default function RiskWarningsPage() {
  const [params] = useSearchParams();
  const initialId = params.get("id");

  const [level, setLevel] = useState<RiskLevel | "all">("all");
  const [status, setStatus] = useState<RiskStatus | "all">("all");
  const [keyword, setKeyword] = useState("");
  const [list, setList] = useState<RiskWarning[]>(mock.riskWarnings);
  const [selected, setSelected] = useState<RiskWarning | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const filter: RiskFilter = { level, status, keyword };

  useEffect(() => {
    api.getRiskWarnings(filter).then(setList);
  }, [level, status, keyword]);

  // 通过 URL 参数定位指定风险
  useEffect(() => {
    if (initialId) {
      const r = mock.riskWarnings.find((x) => x.id === initialId);
      if (r) {
        setSelected(r);
        setDrawerOpen(true);
      }
    }
  }, [initialId]);

  const relatedOrder = useMemo(() => {
    if (!selected?.relatedOrderId) return null;
    return mock.workOrders.find((w) => w.id === selected.relatedOrderId) ?? null;
  }, [selected]);

  const columns: Column<RiskWarning>[] = [
    {
      key: "id",
      title: "风险编号",
      sticky: true,
      render: (r) => <span className="td-mono">{r.id}</span>,
    },
    {
      key: "title",
      title: "风险标题",
      render: (r) => (
        <span style={{ color: "var(--color-foreground)" }} className="font-medium">
          {r.title}
        </span>
      ),
    },
    { key: "domain", title: "业务领域", render: (r) => r.domain },
    { key: "level", title: "风险级别", render: (r) => <RiskLevelTag level={r.level} /> },
    { key: "subject", title: "监管主体", render: (r) => r.subject },
    { key: "rule", title: "命中规则", render: (r) => r.rule },
    {
      key: "triggeredAt",
      title: "触发时间",
      render: (r) => <span className="td-mono">{r.triggeredAt}</span>,
    },
    { key: "status", title: "状态", render: (r) => <RiskStatusTag status={r.status} /> },
  ];

  const onRowClick = (r: RiskWarning) => {
    setSelected(r);
    setDrawerOpen(true);
  };

  return (
    <PageContainer
      title="风险预警"
      subtitle="智慧监督中心 · 实时风险识别与告警"
      breadcrumb="智慧监督中心 / 风险预警"
    >
      <div className="flex flex-col gap-5">
        {/* 筛选区 */}
        <section className="ds-card">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span
                className="text-body"
                style={{ color: "var(--color-on-surface-variant)" }}
              >
                风险级别
              </span>
              <Segmented<RiskLevel | "all">
                value={level}
                onChange={setLevel}
                size="sm"
                options={[
                  { value: "all", label: "全部" },
                  { value: "high", label: "高" },
                  { value: "medium", label: "中" },
                  { value: "low", label: "低" },
                ]}
              />
            </div>
            <div className="flex items-center gap-2">
              <span
                className="text-body"
                style={{ color: "var(--color-on-surface-variant)" }}
              >
                状态
              </span>
              <Segmented<RiskStatus | "all">
                value={status}
                onChange={setStatus}
                size="sm"
                options={[
                  { value: "all", label: "全部" },
                  { value: "pending", label: "待处置" },
                  { value: "processing", label: "处理中" },
                  { value: "resolved", label: "已处置" },
                ]}
              />
            </div>
            <div className="ds-input flex-1 min-w-[200px] max-w-[320px] ml-auto">
              <Search size={14} style={{ color: "var(--color-on-surface-variant)" }} />
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索风险标题 / 主体 / 规则"
              />
              {keyword ? (
                <button
                  type="button"
                  onClick={() => setKeyword("")}
                  className="ds-icon-btn w-5 h-5"
                  aria-label="清除"
                >
                  <X size={12} />
                </button>
              ) : null}
            </div>
          </div>
        </section>

        {/* 列表 */}
        <section className="ds-card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="ds-section-title">风险预警列表</h2>
            <span className="ds-section-sub">共 {list.length} 条</span>
          </div>
          <DataTable
            columns={columns}
            data={list}
            rowKey={(r) => r.id}
            onRowClick={onRowClick}
          />
        </section>
      </div>

      {/* 详情抽屉 */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected ? `风险详情 · ${selected.id}` : "风险详情"}
        width={520}
        footer={
          <>
            <button
              type="button"
              className="ds-btn ds-btn-secondary"
              onClick={() => setDrawerOpen(false)}
            >
              关闭
            </button>
            {selected?.status === "pending" ? (
              <button type="button" className="ds-btn ds-btn-primary">
                派发核查工单
              </button>
            ) : null}
          </>
        }
      >
        {selected ? (
          <div className="flex flex-col gap-5">
            {/* 基本信息 */}
            <div>
              <div
                className="text-h3 font-medium mb-2"
                style={{ color: "var(--color-foreground)" }}
              >
                {selected.title}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <RiskLevelTag level={selected.level} />
                <RiskStatusTag status={selected.status} />
                <StatusTag tone="info">{selected.domain}</StatusTag>
              </div>
            </div>

            {/* 字段 */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "监管主体", value: selected.subject },
                { label: "命中规则", value: selected.rule },
                { label: "触发时间", value: selected.triggeredAt },
                { label: "风险编号", value: selected.id },
              ].map((f) => (
                <div
                  key={f.label}
                  className="rounded-sm p-2.5 flex flex-col gap-1"
                  style={{ background: "var(--color-surface-container)" }}
                >
                  <span
                    className="text-body"
                    style={{ color: "var(--color-on-surface-variant)" }}
                  >
                    {f.label}
                  </span>
                  <span
                    className="text-lead"
                    style={{ color: "var(--color-foreground)" }}
                  >
                    {f.value}
                  </span>
                </div>
              ))}
            </div>

            {/* 风险线索 */}
            {selected.clue ? (
              <div>
                <div
                  className="text-caption mb-2"
                  style={{ color: "var(--color-on-surface-variant)" }}
                >
                  风险线索
                </div>
                <div
                  className="text-lead leading-relaxed p-3 rounded-sm"
                  style={{
                    background: "var(--color-warning-bg)",
                    color: "var(--color-foreground)",
                    borderLeft: "3px solid var(--color-warning)",
                  }}
                >
                  {selected.clue}
                </div>
              </div>
            ) : null}

            {/* 原始数据 */}
            {selected.raw && selected.raw.length > 0 ? (
              <div>
                <div
                  className="text-caption mb-2"
                  style={{ color: "var(--color-on-surface-variant)" }}
                >
                  原始数据
                </div>
                <div className="flex flex-col gap-2">
                  {selected.raw.map((r, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between py-2 px-3 rounded-sm"
                      style={{ background: "var(--color-surface-container)" }}
                    >
                      <span
                        className="text-body"
                        style={{ color: "var(--color-on-surface-variant)" }}
                      >
                        {r.label}
                      </span>
                      <span
                        className="text-body font-medium td-mono"
                        style={{ color: "var(--color-foreground)" }}
                      >
                        {r.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* 关联工单 */}
            {relatedOrder ? (
              <div>
                <div
                  className="text-caption mb-2"
                  style={{ color: "var(--color-on-surface-variant)" }}
                >
                  关联核查工单
                </div>
                <div
                  className="flex items-center justify-between p-3 rounded-sm"
                  style={{
                    background: "var(--color-primary-soft)",
                    border: "1px solid var(--color-primary-line)",
                  }}
                >
                  <div className="flex flex-col gap-1">
                    <span
                      className="td-mono text-lead font-medium"
                      style={{ color: "var(--color-foreground)" }}
                    >
                      {relatedOrder.id}
                    </span>
                    <span
                      className="text-body"
                      style={{ color: "var(--color-on-surface-variant)" }}
                    >
                      {relatedOrder.riskSource} · 负责人 {relatedOrder.owner}
                    </span>
                  </div>
                  <StatusTag tone={relatedOrder.status === "processing" ? "info" : "stop"}>
                    {relatedOrder.status === "processing" ? "进行中" : "已归档"}
                  </StatusTag>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Drawer>
    </PageContainer>
  );
}
