import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Menu, Search, Bell, HelpCircle, ChevronDown, Sun, Moon, X } from "lucide-react";
import { useThemeStore } from "@/store/themeStore";
import { useLayoutStore } from "@/store/layoutStore";
import { useIsMobile } from "@/hooks/useMediaQuery";

export default function TopNav() {
  const navigate = useNavigate();
  const { theme, toggle } = useThemeStore();
  const { toggleDrawer, openDrawer } = useLayoutStore();
  const isMobile = useIsMobile();
  const [searchOpen, setSearchOpen] = useState(false);
  const [keyword, setKeyword] = useState("");

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword.trim()) return;
    navigate(`/monitoring/penetration?q=${encodeURIComponent(keyword.trim())}`);
    setKeyword("");
    setSearchOpen(false);
  };

  return (
    <header
      className="flex items-center h-12 px-4 flex-shrink-0 relative z-[100]"
      style={{
        background: "var(--color-surface)",
        borderBottom: "1px solid var(--color-border)",
        boxShadow: "0 2px 6px 0 rgba(0,0,0,0.18)",
      }}
    >
      {/* 汉堡 - 仅移动端显示 */}
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

      {/* 品牌 */}
      <div className="flex items-center gap-2.5 flex-shrink-0">
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center"
          style={{
            background:
              "linear-gradient(135deg, var(--color-primary), var(--color-primary-hover))",
            color: "#fff",
          }}
        >
          <ShieldIcon />
        </div>
        <div className="flex flex-col leading-none">
          <span
            className="text-caption"
            style={{ color: "var(--color-on-surface-variant)", letterSpacing: "0.06em" }}
          >
            中央企业
          </span>
          <span
            className="text-h3 font-medium"
            style={{ color: "var(--color-foreground)" }}
          >
            穿透式监管平台
          </span>
        </div>
      </div>

      {/* 搜索 */}
      {!isMobile ? (
        <form onSubmit={onSearch} className="ml-6 flex items-center gap-2 w-[360px] h-8 px-3 rounded-sm" style={{ background: "var(--color-surface-container)", border: "1px solid var(--color-border)" }}>
          <Search size={14} style={{ color: "var(--color-on-surface-variant)", flexShrink: 0 }} />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="输入主体/资金/合同/项目关键字进行穿透查询"
            className="border-none outline-none bg-transparent text-lead w-full"
            style={{ color: "var(--color-foreground)" }}
          />
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setSearchOpen((v) => !v)}
          className="ds-icon-btn ml-2"
          aria-label="搜索"
        >
          <Search size={18} />
        </button>
      )}

      <div className="ml-auto flex items-center gap-4">
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

        {/* 预警通知 */}
        <div className="ds-icon-btn" title="预警通知">
          <Bell size={18} />
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 text-caption leading-4 text-center font-medium rounded-full"
            style={{
              background: "var(--color-danger)",
              color: "#fff",
              border: "2px solid var(--color-surface)",
            }}
          >
            12
          </span>
        </div>

        {/* 帮助 */}
        <div className="ds-icon-btn hidden sm:flex" title="帮助">
          <HelpCircle size={18} />
        </div>

        {/* 用户 */}
        <div className="flex items-center gap-2 cursor-pointer">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-lead font-medium"
            style={{ background: "var(--color-primary)", color: "#fff" }}
          >
            监
          </div>
          {!isMobile ? (
            <>
              <span className="text-lead" style={{ color: "var(--color-foreground)" }}>
                监管员·张明
              </span>
              <ChevronDown size={12} style={{ color: "var(--color-on-surface-variant)" }} />
            </>
          ) : null}
        </div>
      </div>

      {/* 移动端搜索浮层 */}
      {isMobile && searchOpen ? (
        <form
          onSubmit={onSearch}
          className="absolute top-12 left-0 right-0 px-4 py-3 flex items-center gap-2"
          style={{
            background: "var(--color-surface)",
            borderBottom: "1px solid var(--color-border)",
            boxShadow: "var(--tw-shadow, 0 4px 12px rgba(0,0,0,0.2))",
          }}
        >
          <div className="ds-input flex-1">
            <Search size={14} style={{ color: "var(--color-on-surface-variant)" }} />
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="穿透查询关键字"
              autoFocus
            />
          </div>
          <button type="submit" className="ds-btn ds-btn-primary">
            查询
          </button>
          <button
            type="button"
            onClick={() => setSearchOpen(false)}
            className="ds-icon-btn"
            aria-label="关闭搜索"
          >
            <X size={16} />
          </button>
        </form>
      ) : null}
    </header>
  );
}

/** 设计稿 logo 简化版 */
function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.6}>
      <path d="M12 2L4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3z" />
      <path d="M8.5 12l2.5 2.5 4.5-4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
