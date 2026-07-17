import { cn } from "@/lib/utils";
import type { WorkOrderNode } from "@/api/types";

interface MiniStepsProps {
  nodes: WorkOrderNode[];
  current: WorkOrderNode;
  labels?: Record<WorkOrderNode, string>;
  className?: string;
}

const defaultLabels: Record<WorkOrderNode, string> = {
  verify: "核查",
  rectify: "整改",
  review: "复核",
  archive: "归档",
};

export default function MiniSteps({
  nodes,
  current,
  labels = defaultLabels,
  className,
}: MiniStepsProps) {
  const currentIdx = nodes.indexOf(current);

  return (
    <div className={cn("flex items-center gap-1 flex-wrap", className)}>
      {nodes.map((node, idx) => {
        const isDone = idx < currentIdx;
        const isCurrent = idx === currentIdx;
        return (
          <div key={node} className="flex items-center gap-1">
            <span
              className="text-caption px-2 py-0.5 rounded-sm whitespace-nowrap"
              style={{
                color: isCurrent
                  ? "#fff"
                  : isDone
                    ? "var(--color-primary)"
                    : "var(--color-on-surface-variant)",
                background: isCurrent
                  ? "var(--color-primary)"
                  : isDone
                    ? "var(--color-primary-container)"
                    : "var(--color-surface-container)",
                fontWeight: isCurrent ? 500 : 400,
              }}
            >
              {labels[node]}
            </span>
            {idx < nodes.length - 1 ? (
              <span
                className="w-2.5 h-px flex-shrink-0"
                style={{
                  background: idx < currentIdx ? "var(--color-primary)" : "var(--color-border)",
                }}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export const WORK_ORDER_NODES: WorkOrderNode[] = ["verify", "rectify", "review", "archive"];
