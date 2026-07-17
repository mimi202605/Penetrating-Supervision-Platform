import { useNavigate } from "react-router-dom";
import { Menu, Sun, Moon, Command, LogOut } from "lucide-react";
import { useThemeStore } from "@/store/themeStore";
import { useAdminStore } from "@/store/adminStore";
import { useAuthStore } from "@/store/authStore";
import { useIsMobile } from "@/hooks/useMediaQuery";
import StatusTag from "@/components/ui/StatusTag";

export default function AdminTopNav() {
  const navigate = useNavigate();
  const { theme, toggle } = useThemeStore();
  const { toggleDrawer } = useAdminStore();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const isMobile = useIsMobile();

  const onLogout = () => {
    logout();
    navigate("/admin/login", { replace: true });
  };

  return (
    <header
      className="flex items-center h-12 px-4 flex-shrink-0 z-[100]"
      style={{
        background: "var(--color-surface)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      {isMobile ? (
        <button
          type="button"
          onClick={toggleDrawer}
          className="ds-icon-btn"
          aria-label="打开菜单"
        >
          <Menu size={18} />
        </button>
      ) : null}

      {/* 品牌·后台 */}
      <div className="flex items-center gap-2.5 flex-shrink-0">
        <span
          className="text-h3 font-medium"
          style={{ color: "var(--color-foreground)" }}
        >
          后台管理中心
        </span>
        <StatusTag tone="info">admin</StatusTag>
      </div>

      <div className="ml-auto flex items-center gap-3">
        {/* 命令面板入口（占位） */}
        <button
          type="button"
          className="ds-icon-btn"
          title="命令面板（⌘K，占位）"
          aria-label="命令面板"
        >
          <Command size={18} />
        </button>

        {/* 主题切换 */}
        <button
          type="button"
          onClick={toggle}
          className="ds-icon-btn"
          title={theme === "dark" ? "切换到亮色" : "切换到暗色"}
          aria-label="切换主题"
        >
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        {/* 当前用户 */}
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-lead font-medium"
            style={{ background: "var(--color-primary)", color: "#fff" }}
          >
            {(user?.name ?? "A").slice(0, 1)}
          </div>
          {!isMobile ? (
            <div className="leading-none">
              <div
                className="text-lead"
                style={{ color: "var(--color-foreground)" }}
              >
                {user?.name ?? "未登录"}
              </div>
              <div
                className="text-caption mt-0.5"
                style={{ color: "var(--color-on-surface-variant)" }}
              >
                {user?.department ?? "—"}
              </div>
            </div>
          ) : null}
        </div>

        {/* 退出 */}
        <button
          type="button"
          onClick={onLogout}
          className="ds-icon-btn"
          title="退出登录"
          aria-label="退出登录"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
