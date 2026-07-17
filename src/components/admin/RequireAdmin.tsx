import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";

/**
 * 后台路由守卫：仅 admin 角色可访问，其余重定向到登录页并带 reason。
 * Mock 模式下演示 RBAC：以核查员/处置员登录会被弹回登录页。
 */
export default function RequireAdmin() {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();

  if (!user || user.role !== "admin") {
    return (
      <Navigate
        to="/admin/login"
        replace
        state={{ from: location.pathname, reason: "forbidden" }}
      />
    );
  }
  return <Outlet />;
}
