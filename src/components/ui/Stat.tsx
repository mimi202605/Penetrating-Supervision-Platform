import type { ReactNode } from "react";
import { useCountUp } from "@/hooks/useCountUp";
import { cn } from "@/lib/utils";
import StatusTag, { type TagTone } from "./StatusTag";

export interface StatProps {
  /** 图标 */
  icon?: ReactNode;
  /** 标签 */
  label: string;
  /** 主数值 */
  value: number | string;
  /** 单位 */
  unit?: string;
  /** 趋势标签 */
  trend?: { text: string; tone: TagTone };
  /** count-up 动画（仅当 value 为数字时生效） */
  countUp?: boolean;
  /** 小数位（countUp 时生效） */
  decimals?: number;
  className?: string;
}

export default function Stat({
  icon,
  label,
  value,
  unit,
  trend,
  countUp = false,
  decimals = 1,
  className,
}: StatProps) {
  const isNumber = typeof value === "number";
  const animated = useCountUp(isNumber && countUp ? value : 0, 600);
  const display = isNumber && countUp ? animated.toFixed(decimals) : value;

  return (
    <div
      className={cn(
        "ds-card flex flex-col gap-3",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        {icon ? (
          <div
            className="w-8 h-8 rounded-sm flex items-center justify-center flex-shrink-0"
            style={{
              background: "var(--color-primary-container)",
              color: "var(--color-primary)",
            }}
          >
            {icon}
          </div>
        ) : null}
        <span
          className="text-body"
          style={{ color: "var(--color-on-surface-variant)" }}
        >
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-1">
        <span
          className="text-[26px] font-semibold leading-none"
          style={{ color: "var(--color-foreground)" }}
        >
          {display}
        </span>
        {unit ? (
          <span
            className="text-lead"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
            {unit}
          </span>
        ) : null}
      </div>
      {trend ? <StatusTag tone={trend.tone}>{trend.text}</StatusTag> : null}
    </div>
  );
}
