import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  /** 右侧抽屉宽度，默认 480 */
  width?: number;
  children: ReactNode;
  /** 底部操作区 */
  footer?: ReactNode;
}

export default function Drawer({
  open,
  onClose,
  title,
  width = 480,
  children,
  footer,
}: DrawerProps) {
  // 锁定滚动 + ESC 关闭
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className={cn("fixed inset-0 z-[300]", open ? "" : "pointer-events-none")}
      aria-hidden={!open}
    >
      {/* 遮罩 */}
      <div
        onClick={onClose}
        className={cn(
          "absolute inset-0 transition-opacity duration-240",
          open ? "opacity-100" : "opacity-0",
        )}
        style={{ background: "rgba(0,0,0,0.55)" }}
      />
      {/* 抽屉 */}
      <aside
        className={cn(
          "absolute top-0 right-0 bottom-0 flex flex-col transition-transform duration-240",
          open ? "translate-x-0" : "translate-x-full",
        )}
        style={{
          width: "min(100vw, " + width + "px)",
          background: "var(--color-surface)",
          borderLeft: "1px solid var(--color-border)",
          boxShadow: "var(--tw-shadow, 0 8px 32px rgba(0,0,0,0.4))",
          transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0, 1)",
        }}
        role="dialog"
        aria-modal="true"
      >
        {/* 头部 */}
        <div
          className="flex items-center justify-between h-14 px-5 flex-shrink-0"
          style={{ borderBottom: "1px solid var(--color-border)" }}
        >
          <div
            className="text-h3 font-medium truncate"
            style={{ color: "var(--color-foreground)" }}
          >
            {title}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ds-icon-btn"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>
        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {/* 底部 */}
        {footer ? (
          <div
            className="flex items-center justify-end gap-2 h-16 px-5 flex-shrink-0"
            style={{ borderTop: "1px solid var(--color-border)" }}
          >
            {footer}
          </div>
        ) : null}
      </aside>
    </div>,
    document.body,
  );
}
