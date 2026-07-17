import { NavLink } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { navGroups } from "./navConfig";
import { useLayoutStore } from "@/store/layoutStore";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";

export default function SideNav() {
  const { collapsed, toggleCollapsed, drawerOpen, closeDrawer } = useLayoutStore();
  const isMobile = useIsMobile();

  // 移动端抽屉
  if (isMobile) {
    return (
      <>
        {/* 遮罩 */}
        <div
          onClick={closeDrawer}
          className={cn(
            "fixed inset-0 bg-black/60 z-[200] transition-opacity duration-200",
            drawerOpen ? "opacity-100" : "opacity-0 pointer-events-none",
          )}
          aria-hidden={!drawerOpen}
        />
        {/* 抽屉 */}
        <aside
          className={cn(
            "fixed top-0 left-0 bottom-0 w-[240px] z-[201] flex flex-col transition-transform duration-240",
            drawerOpen ? "translate-x-0" : "-translate-x-full",
          )}
          style={{
            background: "var(--color-sidebar)",
            borderRight: "1px solid var(--color-border)",
            transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0, 1)",
          }}
        >
          <SideNavContent onClose={closeDrawer} />
        </aside>
      </>
    );
  }

  // 桌面端固定侧栏
  return (
    <aside
      className="flex flex-col h-full flex-shrink-0 transition-all duration-200"
      style={{
        width: collapsed ? 64 : 200,
        background: "var(--color-sidebar)",
        borderRight: "1px solid var(--color-border)",
      }}
    >
      <SideNavContent collapsed={collapsed} onToggle={toggleCollapsed} />
    </aside>
  );
}

function SideNavContent({
  collapsed = false,
  onClose,
  onToggle,
}: {
  collapsed?: boolean;
  onClose?: () => void;
  onToggle?: () => void;
}) {
  return (
    <>
      {/* 头部 */}
      <div className="flex items-center gap-1.5 px-5 h-[60px] flex-shrink-0">
        {!collapsed ? (
          <>
            <div
              className="w-6 h-6 flex items-center justify-center flex-shrink-0"
              style={{ color: "var(--color-primary)" }}
            >
              <svg viewBox="0 0 24 24" fill="none" width={24} height={24}>
                <path
                  d="M12 2L4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3z"
                  fill="var(--color-primary)"
                  opacity="0.18"
                />
                <path
                  d="M12 2L4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3z"
                  stroke="var(--color-primary)"
                  strokeWidth="1.6"
                />
                <path
                  d="M8.5 12l2.5 2.5 4.5-4.5"
                  stroke="var(--color-primary)"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <span className="text-h3 font-medium truncate" style={{ color: "var(--color-foreground)" }}>
              穿透式监管
            </span>
          </>
        ) : (
          <div
            className="w-6 h-6 mx-auto flex items-center justify-center"
            style={{ color: "var(--color-primary)" }}
          >
            <svg viewBox="0 0 24 24" fill="none" width={24} height={24}>
              <path d="M12 2L4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3z" stroke="var(--color-primary)" strokeWidth="1.6" />
              <path d="M8.5 12l2.5 2.5 4.5-4.5" stroke="var(--color-primary)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}
      </div>

      {/* 菜单 */}
      <nav className="flex-1 overflow-y-auto py-2 pb-3">
        {navGroups.map((group, idx) => (
          <div key={idx} className={cn("px-3", idx > 0 && "mt-3")}>
            {group.title && !collapsed ? (
              <div
                className="text-caption uppercase px-3 pt-1.5 pb-1"
                style={{
                  color: "var(--color-muted-foreground)",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                {group.title}
              </div>
            ) : null}
            <div className="flex flex-col gap-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === "/"}
                    onClick={onClose}
                    className={({ isActive }) =>
                      cn("ds-menu-item", isActive && "active", collapsed && "justify-center px-0")
                    }
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon size={16} className="flex-shrink-0" />
                    {!collapsed ? <span className="truncate">{item.label}</span> : null}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* 折叠按钮 */}
      {onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center justify-center gap-2.5 h-11 border-t cursor-pointer transition-colors"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-on-surface-variant)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--state-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          {collapsed ? <ChevronRight size={16} /> : (
            <>
              <ChevronLeft size={16} />
              <span className="text-body">收起菜单</span>
            </>
          )}
        </button>
      ) : null}
    </>
  );
}
