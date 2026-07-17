import { useNavigate, useLocation } from "react-router-dom";
import { ShieldCheck, UserCheck, Wrench, ArrowRight, Info } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import type { AdminRole } from "@/api/types";
import StatusTag from "@/components/ui/StatusTag";

interface RoleCard {
  role: AdminRole;
  title: string;
  desc: string;
  icon: typeof ShieldCheck;
  recommended?: boolean;
}

const ROLES: RoleCard[] = [
  {
    role: "admin",
    title: "系统管理员",
    desc: "拥有后台全部权限：配置、监控、用户、审计",
    icon: ShieldCheck,
    recommended: true,
  },
  {
    role: "核查员",
    title: "核查员",
    desc: "前台核查工单处置，无后台访问权限（演示 RBAC 拦截）",
    icon: UserCheck,
  },
  {
    role: "处置员",
    title: "处置员",
    desc: "前台风险线索处置，无后台访问权限（演示 RBAC 拦截）",
    icon: Wrench,
  },
];

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAuthStore((s) => s.login);
  const reason = (location.state as { reason?: string } | null)?.reason;
  const from = (location.state as { from?: string } | null)?.from;

  const onPick = (role: AdminRole) => {
    login(role);
    // 守卫会自行判定：admin 放行，其余重定向回登录页
    navigate(from && from.startsWith("/admin/") ? from : "/admin/cockpit", {
      replace: true,
    });
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: "var(--color-bg)" }}
    >
      <div className="w-full max-w-[920px]">
        {/* 品牌 */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="w-12 h-12 rounded-md flex items-center justify-center mb-3"
            style={{
              background:
                "linear-gradient(135deg, var(--color-primary), var(--color-primary-hover))",
              color: "#fff",
            }}
          >
            <ShieldCheck size={26} />
          </div>
          <h1
            className="text-h1 font-medium"
            style={{ color: "var(--color-foreground)" }}
          >
            穿透式监管平台 · 后台管理中心
          </h1>
          <p
            className="text-body mt-1.5"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
            Mock 模式：选择角色一键登录（演示用，预留真实鉴权接口位）
          </p>
        </div>

        {/* 拦截提示 */}
        {reason === "forbidden" ? (
          <div
            className="flex items-center gap-2 mb-5 p-3 rounded-sm"
            style={{
              background: "var(--color-warning-bg, rgba(240,165,15,0.12))",
              border: "1px solid var(--color-warning-line, rgba(240,165,15,0.4))",
            }}
          >
            <Info size={16} style={{ color: "var(--color-warning)" }} />
            <span className="text-lead" style={{ color: "var(--color-foreground)" }}>
              当前角色无后台访问权限，请以「系统管理员」登录。
            </span>
          </div>
        ) : null}

        {/* 角色卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {ROLES.map((r) => {
            const Icon = r.icon;
            return (
              <button
                key={r.role}
                type="button"
                onClick={() => onPick(r.role)}
                className="ds-card p-5 text-left flex flex-col gap-3 transition-shadow hover:shadow-ds-3 cursor-pointer relative"
                style={{
                  borderColor: r.recommended
                    ? "var(--color-primary)"
                    : "var(--color-border)",
                }}
              >
                {r.recommended ? (
                  <div className="absolute top-3 right-3">
                    <StatusTag tone="info">推荐</StatusTag>
                  </div>
                ) : null}
                <div
                  className="w-10 h-10 rounded-sm flex items-center justify-center"
                  style={{
                    background: "var(--color-primary-container)",
                    color: "var(--color-primary)",
                  }}
                >
                  <Icon size={20} />
                </div>
                <div>
                  <div
                    className="text-h3 font-medium"
                    style={{ color: "var(--color-foreground)" }}
                  >
                    {r.title}
                  </div>
                  <div
                    className="text-body mt-1"
                    style={{ color: "var(--color-on-surface-variant)" }}
                  >
                    {r.desc}
                  </div>
                </div>
                <div
                  className="mt-auto flex items-center gap-1 text-body"
                  style={{ color: "var(--color-primary)" }}
                >
                  以此角色登录
                  <ArrowRight size={14} />
                </div>
              </button>
            );
          })}
        </div>

        <div
          className="text-center text-caption mt-8"
          style={{ color: "var(--color-on-surface-variant)" }}
        >
          真实环境将对接 POST /api/v1/auth/login（JWT），本期仅 Mock。
        </div>
      </div>
    </div>
  );
}
