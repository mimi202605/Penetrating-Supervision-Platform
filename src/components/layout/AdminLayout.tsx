import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import AdminTopNav from "./AdminTopNav";
import AdminSideNav from "./AdminSideNav";
import { useThemeStore } from "@/store/themeStore";

/**
 * 后台布局外壳：AdminTopNav + AdminSideNav + 主内容 Outlet。
 * 与 AppLayout 并列，独立路由区。
 */
export default function AdminLayout() {
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
  }, [theme]);

  return (
    <div
      className="flex flex-col h-screen overflow-hidden"
      style={{ background: "var(--color-bg)" }}
    >
      <AdminTopNav />
      <div className="flex flex-1 min-h-0">
        <AdminSideNav />
        <main
          className="flex-1 min-w-0 overflow-y-auto"
          style={{ background: "var(--color-bg)" }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
