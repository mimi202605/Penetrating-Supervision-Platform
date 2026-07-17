import { Server, Users, Flag, RefreshCw, type LucideIcon } from "lucide-react";

interface GuaranteeSectionProps {
  data: { icon: string; name: string; desc: string }[];
}

const iconMap: Record<string, LucideIcon> = {
  server: Server,
  users: Users,
  flag: Flag,
  "refresh-cw": RefreshCw,
};

export default function GuaranteeSection({ data }: GuaranteeSectionProps) {
  return (
    <section className="flex flex-col">
      <div className="mb-3">
        <h2 className="ds-section-title">四个保障</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {data.map((g) => {
          const Icon = iconMap[g.icon] ?? Server;
          return (
            <div key={g.name} className="ds-card flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-sm flex items-center justify-center flex-shrink-0"
                style={{
                  background: "var(--color-primary-container)",
                  color: "var(--color-primary)",
                }}
              >
                <Icon size={18} strokeWidth={1.5} />
              </div>
              <div className="flex flex-col gap-0.5 min-w-0">
                <span
                  className="text-lead font-medium truncate"
                  style={{ color: "var(--color-foreground)" }}
                >
                  {g.name}
                </span>
                <span
                  className="text-body truncate"
                  style={{ color: "var(--color-on-surface-variant)" }}
                >
                  {g.desc}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
