import { create } from "zustand";
import type { AdminRole } from "@/api/types";

/** 后台当前用户（Mock） */
export interface AdminUserSession {
  id: string;
  username: string;
  name: string;
  role: AdminRole;
  department: string;
}

interface AuthState {
  user: AdminUserSession | null;
  /** 是否已登录（由 user 派生） */
  isAuthenticated: boolean;
  /** 以指定角色登录（Mock：无凭证校验） */
  login: (role: AdminRole) => void;
  /** 退出，清理本地态 */
  logout: () => void;
  /** 切换角色（已登录态下演示用） */
  switchRole: (role: AdminRole) => void;
}

const STORAGE_KEY = "xjh-psp-admin-auth";

/** 三角色对应的演示档案 */
const ROLE_PROFILES: Record<AdminRole, Omit<AdminUserSession, "role">> = {
  admin: { id: "u-admin-001", username: "admin", name: "系统管理员", department: "信息中心" },
  "核查员": { id: "u-verifier-002", username: "verifier", name: "王志远", department: "监督处" },
  "处置员": { id: "u-handler-003", username: "handler", name: "李建国", department: "处置处" },
};

function readInitial(): AdminUserSession | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? (JSON.parse(saved) as AdminUserSession) : null;
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set) => {
  const initial = readInitial();
  return {
    user: initial,
    isAuthenticated: initial !== null,
    login: (role) => {
      const user: AdminUserSession = { ...ROLE_PROFILES[role], role };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
      set({ user, isAuthenticated: true });
    },
    logout: () => {
      localStorage.removeItem(STORAGE_KEY);
      set({ user: null, isAuthenticated: false });
    },
    switchRole: (role) => {
      const user: AdminUserSession = { ...ROLE_PROFILES[role], role };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
      set({ user });
    },
  };
});
