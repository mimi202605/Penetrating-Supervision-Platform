import {
  Database,
  TrendingUp,
  CreditCard,
  Cpu,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import type { FrameworkItem } from "@/api/types";

interface FrameworkRowProps {
  systems: FrameworkItem[];
  strengths: FrameworkItem[];
}

const iconMap: Record<string, LucideIcon> = {
  database: Database,
  "trending-up": TrendingUp,
  "credit-card": CreditCard,
  cpu: Cpu,
  "shield-check": ShieldCheck,
};

export default function FrameworkRow({ systems, strengths }: FrameworkRowProps) {
  return (
    <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* 四个体系 */}
      <div className="flex flex-col">
        <div className="mb-3">
          <h2 className="ds-section-title">四个体系</h2>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {systems.map((s) => (
            <div
              key={s.name}
              className="ds-card flex items-center gap-3 p-3"
            >
              <div
                className="w-7 h-7 rounded-sm flex items-center justify-center flex-shrink-0 font-semibold text-lead"
                style={{
                  background: "var(--color-primary-container)",
                  color: "var(--color-primary)",
                }}
              >
                {s.num}
              </div>
              <div className="flex flex-col gap-0.5 min-w-0">
                <span
                  className="text-body font-medium truncate"
                  style={{ color: "var(--color-foreground)" }}
                >
                  {s.name}
                </span>
                <span
                  className="text-body truncate"
                  style={{ color: "var(--color-on-surface-variant)" }}
                >
                  {s.desc}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 五个强化 */}
      <div className="flex flex-col">
        <div className="mb-3">
          <h2 className="ds-section-title">五个强化</h2>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {strengths.map((s) => {
            const Icon = s.icon ? iconMap[s.icon] ?? Database : Database;
            return (
              <div
                key={s.name}
                className="ds-card flex items-center gap-3 p-3"
              >
                <div
                  className="w-7 h-7 rounded-sm flex items-center justify-center flex-shrink-0"
                  style={{ background: "var(--color-primary)", color: "#fff" }}
                >
                  <Icon size={16} strokeWidth={1.5} />
                </div>
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span
                    className="text-body font-medium truncate"
                    style={{ color: "var(--color-foreground)" }}
                  >
                    {s.name}
                  </span>
                  <span
                    className="text-body truncate"
                    style={{ color: "var(--color-on-surface-variant)" }}
                  >
                    {s.desc}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
