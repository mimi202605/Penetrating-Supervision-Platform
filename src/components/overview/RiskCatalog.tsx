import { cn } from "@/lib/utils";
import type { RiskPill } from "@/api/types";

interface RiskCatalogProps {
  data: RiskPill[];
}

const toneStyles = {
  high: {
    bg: "var(--color-danger-bg)",
    color: "var(--color-danger)",
    borderColor: "var(--color-danger-line)",
    tagBg: "var(--color-danger)",
  },
  medium: {
    bg: "var(--color-warning-bg)",
    color: "var(--color-warning)",
    borderColor: "var(--color-warning-line)",
    tagBg: "var(--color-warning)",
  },
  low: {
    bg: "var(--color-primary-soft)",
    color: "var(--color-primary)",
    borderColor: "var(--color-primary-line)",
    tagBg: "var(--color-primary)",
  },
  more: {
    bg: "var(--color-surface-container)",
    color: "var(--color-on-surface-variant)",
    borderColor: "var(--color-border)",
    tagBg: "var(--color-surface-container-high)",
  },
} as const;

export default function RiskCatalog({ data }: RiskCatalogProps) {
  return (
    <section className="ds-card flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h2 className="ds-section-title">11+N项重大风险问题</h2>
        <span
          className="text-body"
          style={{ color: "var(--color-on-surface-variant)" }}
        >
          全覆盖风险清单 · 分级管控
        </span>
      </div>
      <div className="flex flex-wrap gap-2 gap-x-3">
        {data.map((p) => {
          const t = toneStyles[p.level];
          const isMore = p.level === "more";
          return (
            <span
              key={p.name}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-body font-medium whitespace-nowrap border",
                isMore && "border-dashed",
              )}
              style={{
                background: t.bg,
                color: t.color,
                borderColor: t.borderColor,
              }}
            >
              {p.name}
              <span
                className="text-caption px-1.5 py-px rounded-sm font-normal opacity-90"
                style={{ background: t.tagBg, color: isMore ? "var(--color-on-surface-variant)" : "#fff" }}
              >
                {p.tag}
              </span>
            </span>
          );
        })}
      </div>
    </section>
  );
}
