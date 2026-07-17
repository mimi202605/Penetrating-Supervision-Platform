/**
 * 一个目标 Mission Banner
 * 渐变蓝 banner，圆形目标图标，战略框架徽章
 */
export default function MissionBanner() {
  return (
    <section
      className="flex items-center gap-5 p-5 sm:p-6 rounded-md"
      style={{
        background:
          "linear-gradient(135deg, var(--color-primary-container), var(--color-primary-soft))",
        border: "1px solid var(--color-primary-line)",
      }}
    >
      <div
        className="w-11 h-11 rounded-md flex items-center justify-center flex-shrink-0"
        style={{ background: "var(--color-primary)", color: "#fff" }}
      >
        <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke="currentColor" strokeWidth={1.8}>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" />
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2" />
        </svg>
      </div>
      <div className="flex-1 flex flex-col gap-1 min-w-0">
        <span
          className="text-caption font-medium"
          style={{
            color: "var(--color-primary)",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          一个目标
        </span>
        <span
          className="text-h3 font-medium leading-snug"
          style={{ color: "var(--color-foreground)" }}
        >
          加快推进智能化穿透式监管体系，坚持高质量发展，助力实现中国式现代化提供有力支撑
        </span>
      </div>
      <div
        className="px-3 py-1 rounded-sm whitespace-nowrap flex-shrink-0 hidden sm:block"
        style={{
          background: "var(--color-primary-container)",
          color: "var(--color-primary)",
          fontSize: "var(--font-size-body, 12px)",
          fontWeight: 500,
        }}
      >
        战略框架
      </div>
    </section>
  );
}
