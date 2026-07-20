import { cn } from "@/lib/utils";
import type { WorkOrderNode } from "@/api/types";

interface MiniStepsProps {
  nodes: WorkOrderNode[];
  current: WorkOrderNode;
  labels?: Partial<Record<WorkOrderNode, string>>;
  className?: string;
}

/** V1 节点 → V2 节点别名映射（与后端 NODE_ALIASES 对齐） */
const NODE_ALIASES: Record<WorkOrderNode, WorkOrderNode> = {
  // V1 别名 → V2
  verify: "receive",
  rectify: "dispose",
  review: "approve",
  // V2 自映射
  detect: "detect",
  dispatch: "dispatch",
  receive: "receive",
  dispose: "dispose",
  approve: "approve",
  close: "close",
  archive: "archive",
};

const defaultLabels: Record<WorkOrderNode, string> = {
  detect: "识别",
  dispatch: "派单",
  receive: "核查",
  dispose: "整改",
  approve: "复核",
  close: "闭环",
  archive: "归档",
  // V1 别名（向后兼容标签）
  verify: "核查",
  rectify: "整改",
  review: "复核",
};

/** 将任意节点归一为 V2 标准节点名 */
function normalizeNode(n: WorkOrderNode): WorkOrderNode {
  return NODE_ALIASES[n] ?? n;
}

export default function MiniSteps({
  nodes,
  current,
  labels = defaultLabels,
  className,
}: MiniStepsProps) {
  // 将 current 与 nodes 都归一为 V2 标准节点名后再比较，避免 V1/V2 混用时 currentIdx 永远为 -1
  const normalizedCurrent = normalizeNode(current);
  const normalizedNodes = nodes.map((n) => normalizeNode(n));
  let currentIdx = normalizedNodes.indexOf(normalizedCurrent);

  // 兜底：current 仍不在 nodes 中（例如后端返回了 nodes 之外的新节点），
  // 至少让 current 节点显示为"当前"状态，而不是整条进度条全失效。
  let displayNodes = nodes;
  if (currentIdx === -1) {
    displayNodes = [...nodes, current];
    currentIdx = displayNodes.length - 1;
  }

  return (
    <div className={cn("flex items-center gap-1 flex-wrap", className)}>
      {displayNodes.map((node, idx) => {
        const isDone = idx < currentIdx;
        const isCurrent = idx === currentIdx;
        return (
          <div key={`${node}-${idx}`} className="flex items-center gap-1">
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
              {labels[node] ?? defaultLabels[node] ?? node}
            </span>
            {idx < displayNodes.length - 1 ? (
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

/** 工单节点顺序：V2 七态（V1 节点通过 NODE_ALIASES 映射后也能正确显示） */
export const WORK_ORDER_NODES: WorkOrderNode[] = [
  "detect",
  "dispatch",
  "receive",
  "dispose",
  "approve",
  "close",
  "archive",
];
