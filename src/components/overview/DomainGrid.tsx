import StatusTag from "@/components/ui/StatusTag";
import type { DomainRisk } from "@/api/types";

interface DomainGridProps {
  data: DomainRisk[];
}

export default function DomainGrid({ data }: DomainGridProps) {
  return (
    <section className="flex flex-col">
      <div className="flex items-baseline gap-3 mb-3">
        <h2 className="ds-section-title">十大领域</h2>
        <span className="ds-section-sub">全覆盖风险矩阵</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {data.map((d) => (
          <div
            key={d.name}
            className="ds-card flex flex-col gap-2 p-3 transition-shadow hover:shadow-ds-2"
          >
            <div className="flex items-center justify-between gap-1">
              <span
                className="text-body font-medium truncate"
                style={{ color: "var(--color-foreground)" }}
              >
                {d.name}
              </span>
              {d.level === "high" ? (
                <StatusTag tone="error">高</StatusTag>
              ) : d.level === "medium" ? (
                <StatusTag tone="warning">中</StatusTag>
              ) : (
                <StatusTag tone="success">低</StatusTag>
              )}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span
                className="text-[22px] font-semibold leading-none"
                style={{ color: "var(--color-foreground)" }}
              >
                {d.riskCount}
              </span>
              <span
                className="text-body"
                style={{ color: "var(--color-on-surface-variant)" }}
              >
                风险数
              </span>
            </div>
            <div
              className="text-body leading-snug"
              style={{ color: "var(--color-on-surface-variant)" }}
            >
              {d.desc}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
