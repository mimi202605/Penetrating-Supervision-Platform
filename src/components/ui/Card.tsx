import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface CardProps {
  children: ReactNode;
  className?: string;
  /** 标题（顶部一行） */
  title?: ReactNode;
  /** 标题右侧操作 */
  extra?: ReactNode;
  /** 内边距 */
  padding?: "sm" | "md" | "lg" | "none";
  /** 悬浮抬升 */
  hover?: boolean;
  style?: React.CSSProperties;
  onClick?: () => void;
}

const padMap = {
  sm: "p-3",
  md: "p-4",
  lg: "p-5",
  none: "",
};

export default function Card({
  children,
  className,
  title,
  extra,
  padding = "md",
  hover = false,
  style,
  onClick,
}: CardProps) {
  return (
    <div
      className={cn(
        "ds-card",
        padMap[padding],
        hover && "transition-shadow hover:shadow-ds-3 cursor-pointer",
        onClick && "cursor-pointer",
        className,
      )}
      style={style}
      onClick={onClick}
    >
      {title || extra ? (
        <div className="flex items-center justify-between mb-3">
          {typeof title === "string" ? (
            <h3 className="ds-section-title">{title}</h3>
          ) : (
            title
          )}
          {extra}
        </div>
      ) : null}
      {children}
    </div>
  );
}

/** 卡片标题 + 副标题组合 */
export function CardHead({
  title,
  subtitle,
  extra,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  extra?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-end justify-between mb-3 gap-3", className)}>
      <div className="min-w-0">
        <h3 className="ds-section-title">{title}</h3>
        {subtitle ? (
          <div className="ds-section-sub mt-0.5">{subtitle}</div>
        ) : null}
      </div>
      {extra ? <div className="flex-shrink-0">{extra}</div> : null}
    </div>
  );
}
