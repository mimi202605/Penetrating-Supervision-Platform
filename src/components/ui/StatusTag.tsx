import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type TagTone =
  | "success"
  | "warning"
  | "error"
  | "info"
  | "stop"
  | "processing";

interface StatusTagProps {
  tone?: TagTone;
  children: ReactNode;
  /** 是否带前缀圆点 */
  dot?: boolean;
  className?: string;
}

const toneMap: Record<TagTone, string> = {
  success: "ds-tag-success",
  warning: "ds-tag-warning",
  error: "ds-tag-error",
  info: "ds-tag-info",
  stop: "ds-tag-stop",
  // processing 复用 info 风格，但加点动效
  processing: "ds-tag-info",
};

const dotColorMap: Record<TagTone, string> = {
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  error: "var(--color-danger)",
  info: "var(--color-primary)",
  stop: "var(--color-on-surface-variant)",
  processing: "var(--color-primary)",
};

export default function StatusTag({
  tone = "info",
  children,
  dot = false,
  className,
}: StatusTagProps) {
  return (
    <span className={cn("ds-tag", toneMap[tone], className)}>
      {dot ? (
        <span
          className={cn(
            "ds-dot",
            tone === "processing" && "animate-pulse",
          )}
          style={{ background: dotColorMap[tone] }}
        />
      ) : null}
      {children}
    </span>
  );
}

/** 根据风险级别映射 tag */
export function RiskLevelTag({
  level,
}: {
  level: "high" | "medium" | "low";
}) {
  if (level === "high") return <StatusTag tone="error">高</StatusTag>;
  if (level === "medium") return <StatusTag tone="warning">中</StatusTag>;
  return <StatusTag tone="success">低</StatusTag>;
}

/** 根据风险状态映射 tag */
export function RiskStatusTag({
  status,
}: {
  status: "pending" | "processing" | "resolved";
}) {
  if (status === "pending") return <StatusTag tone="warning">待处置</StatusTag>;
  if (status === "processing")
    return <StatusTag tone="processing" dot>处理中</StatusTag>;
  return <StatusTag tone="success">已处置</StatusTag>;
}
