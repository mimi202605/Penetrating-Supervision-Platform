import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { findAdminGroupTitle, findAdminNavItem } from "./adminNavConfig";
import { cn } from "@/lib/utils";

interface AdminPageContainerProps {
  title: string;
  subtitle?: string;
  /** 面包屑覆盖（默认根据路由自动生成） */
  breadcrumb?: string;
  actions?: ReactNode;
  padding?: "sm" | "md" | "none";
  maxWidth?: number;
  children: ReactNode;
}

const padMap = {
  sm: "p-4 sm:p-5",
  md: "p-4 sm:p-6",
  none: "",
};

export default function AdminPageContainer({
  title,
  subtitle,
  breadcrumb,
  actions,
  padding = "md",
  maxWidth = 1440,
  children,
}: AdminPageContainerProps) {
  const location = useLocation();
  const path = location.pathname;
  const navItem = findAdminNavItem(path);
  const groupTitle = findAdminGroupTitle(path);
  const crumb =
    breadcrumb ??
    ([groupTitle, navItem?.label].filter(Boolean).join(" / ") || "后台管理");

  return (
    <div
      className="mx-auto w-full animate-fade-in"
      style={{ maxWidth, padding: "0 24px" }}
    >
      <div className={cn(padMap[padding], "py-5 sm:py-6")}>
        <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
          <div className="min-w-0">
            <div
              className="text-caption mb-1.5"
              style={{ color: "var(--color-on-surface-variant)" }}
            >
              后台 / {crumb}
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
        <div>{children}</div>
      </div>
    </div>
  );
}
