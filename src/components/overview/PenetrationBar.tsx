import { Flag, ListTree, Clock, Grid2x2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface PenItem {
  name: string;
  desc: string;
  tone: "info" | "primary" | "success";
  icon: LucideIcon;
}

const items: PenItem[] = [
  { name: "全级次组织穿透", desc: "跨层级监管直达底层", tone: "info", icon: Flag },
  { name: "全链条业务穿透", desc: "业务流程全覆盖", tone: "primary", icon: ListTree },
  { name: "全过程时间穿透", desc: "事前事中事后全周期", tone: "success", icon: Clock },
  { name: "全要素对象穿透", desc: "人财物事全维度", tone: "info", icon: Grid2x2 },
];

const toneStyles: Record<PenItem["tone"], { bg: string; color: string }> = {
  info: { bg: "var(--color-primary-container)", color: "var(--color-primary)" },
  primary: { bg: "var(--color-primary)", color: "#fff" },
  success: {
    bg: "var(--color-success-bg)",
    color: "var(--color-success)",
  },
};

export default function PenetrationBar() {
  return (
    <section className="ds-card flex items-stretch p-0 overflow-hidden">
      {items.map((item, idx) => {
        const Icon = item.icon;
        const t = toneStyles[item.tone];
        return (
          <div
            key={item.name}
            className={cn(
              "flex-1 flex items-center gap-3 p-4 min-w-0",
              idx > 0 && "border-l",
            )}
            style={{ borderLeftColor: "var(--color-border)" }}
          >
            <div
              className="w-8 h-8 rounded-sm flex items-center justify-center flex-shrink-0"
              style={{ background: t.bg, color: t.color }}
            >
              <Icon size={18} strokeWidth={1.5} />
            </div>
            <div className="flex flex-col gap-0.5 min-w-0">
              <span
                className="text-lead font-medium truncate"
                style={{ color: "var(--color-foreground)" }}
              >
                {item.name}
              </span>
              <span
                className="text-body truncate"
                style={{ color: "var(--color-on-surface-variant)" }}
              >
                {item.desc}
              </span>
            </div>
          </div>
        );
      })}
    </section>
  );
}
