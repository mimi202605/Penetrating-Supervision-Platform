import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import TopNav from "./TopNav";
import SideNav from "./SideNav";
import { useThemeStore } from "@/store/themeStore";
import { useLayoutStore } from "@/store/layoutStore";

/**
 * 三栏外壳：顶栏 + 侧栏 + 主内容区
 * - 桌面（≥1280）：完整 200px 侧栏
 * - 平板（768-1279）：侧栏可折叠为 64px 图标模式
 * - 移动（<768）：侧栏抽屉化，遮罩层
 */
export default function AppLayout() {
  const theme = useThemeStore((s) => s.theme);

  // 主题变化时同步 <html> class（themeStore 初始化已处理，这里仅作为兜底）
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
  }, [theme]);

  // 移动端路由切换时关闭抽屉：HashRouter 路由变化主要触发 hashchange，
  // 部分浏览器场景才会触发 popstate，两个事件都监听以覆盖所有情况
  useEffect(() => {
    const close = () => {
      useLayoutStore.getState().closeDrawer();
    };
    window.addEventListener("popstate", close);
    window.addEventListener("hashchange", close);
    return () => {
      window.removeEventListener("popstate", close);
      window.removeEventListener("hashchange", close);
    };
  }, []);

  return (
    <div
      className="flex flex-col h-screen overflow-hidden"
      style={{ background: "var(--color-bg)" }}
    >
      <TopNav />
      <div className="flex flex-1 min-h-0">
        <SideNav />
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
