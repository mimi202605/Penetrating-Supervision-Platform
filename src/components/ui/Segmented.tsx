import { cn } from "@/lib/utils";

export interface SegmentOption<T extends string = string> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
  className?: string;
}

export default function Segmented<T extends string = string>({
  options,
  value,
  onChange,
  size = "md",
  className,
}: SegmentedProps<T>) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-sm overflow-hidden",
        className,
      )}
      style={{
        background: "var(--color-surface-container)",
        border: "1px solid var(--color-border)",
      }}
    >
      {options.map((opt, idx) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "transition-colors whitespace-nowrap",
              size === "sm" ? "px-2.5 h-7 text-caption" : "px-3 h-8 text-body",
              active
                ? "font-medium"
                : "hover:bg-[var(--state-hover)]",
              idx > 0 && "border-l",
            )}
            style={{
              background: active ? "var(--color-primary)" : "transparent",
              color: active ? "#fff" : "var(--color-foreground)",
              borderLeftColor: "var(--color-border)",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
