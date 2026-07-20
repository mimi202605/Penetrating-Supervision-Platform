import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/api";
import type { ApiError } from "@/api";

/**
 * 登录页：作为 401 跳转目标，避免 handle401 跳转到不存在的 /login 造成死循环。
 * 路由位置：App.tsx 中放在 AppLayout 之外（不带侧栏/顶栏），path="/login"。
 */
export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/";

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!username.trim() || !password) {
      setError("请输入用户名和密码");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.login({ username: username.trim(), password });
      // 登录成功后跳转到 next（去掉前导 # 兼容 HashRouter）
      const target = next.startsWith("#") ? next.slice(1) : next;
      navigate(target || "/", { replace: true });
    } catch (err) {
      const message = (err as ApiError)?.message || "登录失败，请检查用户名和密码";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background:
          "radial-gradient(circle at 20% 20%, rgba(56,123,255,0.18), transparent 60%), var(--color-bg)",
      }}
    >
      <div
        className="w-full max-w-[420px] rounded-md"
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          boxShadow: "0 24px 48px rgba(0,0,0,0.4)",
        }}
      >
        <div className="px-8 pt-8 pb-2 text-center">
          <div
            className="text-h2 font-semibold"
            style={{ color: "var(--color-foreground)" }}
          >
            集团穿透式监管平台
          </div>
          <div
            className="text-body mt-1.5"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
            一平台 · 三中心 · 全级次穿透
          </div>
        </div>
        <form onSubmit={onSubmit} className="p-8 pt-6 flex flex-col gap-4">
          <div>
            <label
              className="text-body block mb-1.5"
              style={{ color: "var(--color-on-surface-variant)" }}
              htmlFor="login-username"
            >
              用户名
            </label>
            <input
              id="login-username"
              type="text"
              autoComplete="username"
              className="ds-input w-full"
              placeholder="请输入用户名"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div>
            <label
              className="text-body block mb-1.5"
              style={{ color: "var(--color-on-surface-variant)" }}
              htmlFor="login-password"
            >
              密码
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              className="ds-input w-full"
              placeholder="请输入密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
            />
          </div>
          {error ? (
            <div
              className="text-body px-3 py-2 rounded-sm"
              style={{
                background: "var(--color-error-container, rgba(220,38,38,0.12))",
                color: "var(--color-error, #dc2626)",
              }}
              role="alert"
            >
              {error}
            </div>
          ) : null}
          <button
            type="submit"
            disabled={submitting}
            className="ds-btn ds-btn-primary w-full"
          >
            {submitting ? "登录中..." : "登录"}
          </button>
          <div
            className="text-caption text-center"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
            演示账号：admin / admin123
          </div>
        </form>
      </div>
    </div>
  );
}
