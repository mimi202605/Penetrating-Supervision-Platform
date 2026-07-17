import StatusTag from "@/components/ui/StatusTag";
import Progress from "@/components/ui/Progress";
import type { CenterStatus } from "@/api/types";

interface CenterGridProps {
  data: CenterStatus[];
}

const statusTextMap = {
  running: "运行中",
  warning: "运行中",
  error: "异常",
} as const;

const statusToneMap = {
  running: "success",
  warning: "warning",
  error: "error",
} as const;

export default function CenterGrid({ data }: CenterGridProps) {
  return (
    <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {data.map((c) => {
        const progressTone =
          c.healthTone === "success"
            ? "success"
            : c.healthTone === "warning"
              ? "warning"
              : "danger";
        return (
          <div key={c.name} className="ds-card flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span
                className="text-lead font-medium"
                style={{ color: "var(--color-foreground)" }}
              >
                {c.name}
              </span>
              <StatusTag tone={statusToneMap[c.status]} dot>
                {statusTextMap[c.status]}
              </StatusTag>
            </div>
            <div className="flex gap-2">
              {c.metrics.map((m) => (
                <div
                  key={m.label}
                  className="flex-1 rounded-sm p-2.5 flex flex-col gap-1"
                  style={{ background: "var(--color-surface-container)" }}
                >
                  <span
                    className="text-body"
                    style={{ color: "var(--color-on-surface-variant)" }}
                  >
                    {m.label}
                  </span>
                  <span
                    className="text-h3 font-semibold leading-none"
                    style={{ color: "var(--color-foreground)" }}
                  >
                    {m.value}
                  </span>
                </div>
              ))}
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span
                  className="text-body"
                  style={{ color: "var(--color-on-surface-variant)" }}
                >
                  健康度
                </span>
                <span
                  className="text-lead font-medium"
                  style={{ color: "var(--color-foreground)" }}
                >
                  {c.health}%
                </span>
              </div>
              <Progress value={c.health} tone={progressTone} size="sm" />
            </div>
          </div>
        );
      })}
    </section>
  );
}
