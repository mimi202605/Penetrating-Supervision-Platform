import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, Construction } from "lucide-react";
import { Link } from "react-router-dom";
import PageContainer from "@/components/layout/PageContainer";
import StatusTag from "@/components/ui/StatusTag";

export interface SkeletonCard {
  title: string;
  value: string | number;
  desc?: string;
  tone?: "info" | "success" | "warning" | "error";
}

export interface SkeletonLink {
  to: string;
  label: string;
}

interface SkeletonPageProps {
  title: string;
  subtitle: string;
  breadcrumb: string;
  icon: LucideIcon;
  /** 概览卡片 */
  cards?: SkeletonCard[];
  /** 即将上线的能力点 */
  features?: string[];
  /** 相关跳转 */
  relatedLinks?: SkeletonLink[];
  /** 右上角操作 */
  actions?: ReactNode;
}

export default function SkeletonPage({
  title,
  subtitle,
  breadcrumb,
  icon: Icon,
  cards = [],
  features = [],
  relatedLinks = [],
  actions,
}: SkeletonPageProps) {
  return (
    <PageContainer
      title={title}
      subtitle={subtitle}
      breadcrumb={breadcrumb}
      actions={
        actions ?? (
          <StatusTag tone="warning" dot>
            建设中 · 阶段规划
          </StatusTag>
        )
      }
    >
      <div className="flex flex-col gap-5">
        {/* 概览卡 */}
        {cards.length > 0 ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {cards.map((c) => {
              const toneColor =
                c.tone === "success"
                  ? "var(--color-success)"
                  : c.tone === "warning"
                    ? "var(--color-warning)"
                    : c.tone === "error"
                      ? "var(--color-danger)"
                      : "var(--color-primary)";
              return (
                <div key={c.title} className="ds-card flex flex-col gap-2">
                  <span className="text-body" style={{ color: "var(--color-on-surface-variant)" }}>
                    {c.title}
                  </span>
                  <span
                    className="text-[26px] font-semibold leading-none"
                    style={{ color: toneColor }}
                  >
                    {c.value}
                  </span>
                  {c.desc ? (
                    <span className="text-caption" style={{ color: "var(--color-on-surface-variant)" }}>
                      {c.desc}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {/* 占位说明 */}
        <section className="ds-card flex flex-col items-center justify-center text-center py-12">
          <div
            className="w-14 h-14 rounded-md flex items-center justify-center mb-4"
            style={{
              background: "var(--color-primary-container)",
              color: "var(--color-primary)",
            }}
          >
            <Icon size={28} strokeWidth={1.5} />
          </div>
          <h2
            className="text-h2 font-medium mb-2"
            style={{ color: "var(--color-foreground)" }}
          >
            {title} · 建设中
          </h2>
          <p
            className="text-lead max-w-[640px]"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
            {subtitle}。本页能力将在 5 年落地实操方案对应阶段交付，敬请期待。
          </p>
          <div
            className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-body"
            style={{
              background: "var(--color-warning-bg)",
              color: "var(--color-warning)",
              border: "1px solid var(--color-warning-line)",
            }}
          >
            <Construction size={14} />
            按 5 年规划阶段交付
          </div>
        </section>

        {/* 即将上线 */}
        {features.length > 0 ? (
          <section className="ds-card">
            <h2 className="ds-section-title mb-3">规划能力</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {features.map((f, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 p-3 rounded-sm"
                  style={{ background: "var(--color-surface-container)" }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                    style={{ background: "var(--color-primary)" }}
                  />
                  <span className="text-lead" style={{ color: "var(--color-foreground)" }}>
                    {f}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* 相关跳转 */}
        {relatedLinks.length > 0 ? (
          <section className="ds-card">
            <h2 className="ds-section-title mb-3">相关页面</h2>
            <div className="flex flex-wrap gap-2">
              {relatedLinks.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-sm text-lead transition-colors hover:bg-[var(--state-hover)]"
                  style={{
                    background: "var(--color-surface-container)",
                    color: "var(--color-foreground)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  {l.label}
                  <ArrowRight size={12} style={{ color: "var(--color-primary)" }} />
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </PageContainer>
  );
}
