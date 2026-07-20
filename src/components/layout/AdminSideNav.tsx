import { NavLink } from "react-router-dom";
import { ChevronLeft, ChevronRight, ArrowLeftToLine } from "lucide-react";
import { adminNavGroups } from "./adminNavConfig";
import { useAdminStore } from "@/store/adminStore";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";

/** 后台侧栏：跟随主题色变化（通过 CSS 变量 --color-sidebar 等） */
export default function AdminSideNav() {
  const { collapsed, toggleCollapsed, drawerOpen, closeDrawer } = useAdminStore();
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <>
        <div
          onClick={closeDrawer}
          className={cn(
            "fixed inset-0 bg-black/60 z-[200] transition-opacity duration-200",
            drawerOpen ? "opacity-100" : "opacity-0 pointer-events-none",
          )}
          aria-hidden={!drawerOpen}
        />
        <aside
          className={cn(
            "fixed top-0 left-0 bottom-0 w-[240px] z-[201] flex flex-col bg-[var(--color-sidebar)] transition-transform duration-240",
            drawerOpen ? "translate-x-0" : "-translate-x-full",
          )}
          style={{ transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0, 1)" }}
        >
          <AdminSideNavContent onClose={closeDrawer} />
        </aside>
      </>
    );
  }

  return (
    <aside
      className="flex flex-col h-full flex-shrink-0 bg-[var(--color-sidebar)] transition-all duration-200"
      style={{ width: collapsed ? 64 : 220 }}
    >
      <AdminSideNavContent collapsed={collapsed} onToggle={toggleCollapsed} />
    </aside>
  );
}

function AdminSideNavContent({
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
      <div className="flex items-center gap-2 px-4 h-[60px] flex-shrink-0 border-b border-[var(--color-border-light)]">
        {!collapsed ? (
          <>
            <div className="w-7 h-7 rounded-md flex items-center justify-center bg-[var(--color-primary)] text-white flex-shrink-0">
              <ShieldMark />
            </div>
            <div className="leading-none min-w-0">
              <div className="text-[13px] font-semibold text-[var(--color-foreground)] truncate">穿透式监管</div>
              <div className="text-[11px] text-[var(--color-on-surface-variant)] mt-0.5">后台管理中心</div>
            </div>
          </>
        ) : (
          <div className="w-7 h-7 mx-auto flex items-center justify-center bg-[var(--color-primary)] text-white rounded-md">
            <ShieldMark />
          </div>
        )}
      </div>

      {/* 菜单 */}
      <nav className="flex-1 overflow-y-auto py-3 pb-3">
        {adminNavGroups.map((group, idx) => (
          <div key={idx} className={cn("px-3", idx > 0 && "mt-4")}>
            {!collapsed ? (
              <div className="text-[11px] uppercase px-3 pt-1 pb-1.5 text-[var(--color-on-surface-variant)] tracking-wider">
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
                    onClick={onClose}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      cn(
                        "group relative flex items-center gap-2.5 h-9 px-3 rounded-sm text-[13px] transition-colors",
                        collapsed && "justify-center px-0",
                        isActive
                          ? "bg-[var(--color-primary-container)] text-[var(--color-foreground)]"
                          : "text-[var(--color-on-surface-variant)] hover:bg-[var(--state-hover)] hover:text-[var(--color-foreground)]",
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive ? (
                          <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-[var(--color-primary)]" />
                        ) : null}
                        <Icon size={16} className="flex-shrink-0" />
                        {!collapsed ? <span className="truncate">{item.label}</span> : null}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* 返回前台 */}
      <div className="flex-shrink-0 border-t border-[var(--color-border-light)]">
        <NavLink
          to="/"
          className={cn(
            "flex items-center gap-2.5 h-11 px-3 text-[13px] text-[var(--color-on-surface-variant)] hover:bg-[var(--state-hover)] hover:text-[var(--color-foreground)] transition-colors",
            collapsed && "justify-center px-0",
          )}
          title={collapsed ? "返回前台" : undefined}
        >
          <ArrowLeftToLine size={16} className="flex-shrink-0" />
          {!collapsed ? <span>返回前台</span> : null}
        </NavLink>
        {onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            className="flex items-center justify-center gap-2 h-11 w-full text-[var(--color-on-surface-variant)] hover:bg-[var(--state-hover)] hover:text-[var(--color-foreground)] transition-colors"
          >
            {collapsed ? <ChevronRight size={16} /> : (
              <>
                <ChevronLeft size={16} />
                <span className="text-[13px]">收起菜单</span>
              </>
            )}
          </button>
        ) : null}
      </div>
    </>
  );
}

function ShieldMark() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="M12 2L4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3z" />
      <path d="M8.5 12l2.5 2.5 4.5-4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
