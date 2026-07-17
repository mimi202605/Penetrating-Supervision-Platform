import { cn } from "@/lib/utils";

export type ProgressTone = "primary" | "success" | "warning" | "danger";

interface ProgressProps {
  value: number; // 0-100
  tone?: ProgressTone;
  size?: "sm" | "md";
  /** 显示百分比文字 */
  showText?: boolean;
  className?: string;
}

const fillMap: Record<ProgressTone, string> = {
  primary: "",
  success: "ds-progress-fill-success",
  warning: "ds-progress-fill-warning",
  danger: "ds-progress-fill-danger",
};

export default function Progress({
  value,
  tone = "primary",
  size = "md",
  showText = false,
  className,
}: ProgressProps) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className={cn(
          "flex-1 rounded-full overflow-hidden",
          size === "sm" ? "h-1" : "h-1.5",
        )}
        style={{ background: "var(--color-surface-container-high)" }}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500 ease-out",
            fillMap[tone],
          )}
          style={
            tone === "primary"
              ? { width: `${pct}%`, background: "var(--color-primary)" }
              : { width: `${pct}%` }
          }
        />
      </div>
      {showText ? (
        <span
          className="text-caption min-w-[28px] text-right"
          style={{ color: "var(--color-foreground)" }}
        >
          {Math.round(pct)}%
        </span>
      ) : null}
    </div>
  );
}
