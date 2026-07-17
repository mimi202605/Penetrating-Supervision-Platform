import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { findGroupTitle, findNavItem } from "./navConfig";
import { cn } from "@/lib/utils";

interface PageContainerProps {
  title: string;
  subtitle?: string;
  /** 面包屑覆盖（默认根据路由自动生成） */
  breadcrumb?: string;
  /** 右上角操作区 */
  actions?: ReactNode;
  /** 内容内边距，默认 24px */
  padding?: "sm" | "md" | "none";
  /** 内容最大宽度，默认 1440 */
  maxWidth?: number;
  children: ReactNode;
}

const padMap = {
  sm: "p-4 sm:p-5",
  md: "p-4 sm:p-6",
  none: "",
};

export default function PageContainer({
  title,
  subtitle,
  breadcrumb,
  actions,
  padding = "md",
  maxWidth = 1440,
  children,
}: PageContainerProps) {
  const location = useLocation();
  const path = location.pathname;
  const navItem = findNavItem(path);
  const groupTitle = findGroupTitle(path);

  const crumb =
    breadcrumb ?? ([groupTitle, navItem?.label].filter(Boolean).join(" / ") || "监管总览");

  return (
    <div
      className="mx-auto w-full animate-fade-in"
      style={{ maxWidth, padding: "0 24px" }}
    >
      <div className={cn(padMap[padding], "py-5 sm:py-6")}>
        {/* 页头 */}
        <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
          <div className="min-w-0">
            <div
              className="text-caption mb-1.5"
              style={{ color: "var(--color-on-surface-variant)" }}
            >
              首页 / {crumb}
            </div>
            <h1
              className="text-h1 font-medium leading-tight truncate"
              style={{ color: "var(--color-foreground)" }}
            >
              {title}
            </h1>
            {subtitle ? (
              <div
                className="text-body mt-1"
                style={{ color: "var(--color-on-surface-variant)" }}
              >
                {subtitle}
              </div>
            ) : null}
          </div>
          {actions ? (
            <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>
          ) : null}
        </div>

        {/* 内容 */}
        <div>{children}</div>
      </div>
    </div>
  );
}
