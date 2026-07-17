import { create } from "zustand";

interface AdminState {
  // 后台侧栏折叠（桌面图标模式）
  collapsed: boolean;
  // 后台侧栏抽屉（移动端）
  drawerOpen: boolean;
  // 已确认/已读告警 id 集合
  readAlertIds: Set<string>;
  // 已静默告警 id 集合
  silencedAlertIds: Set<string>;
  toggleCollapsed: () => void;
  setCollapsed: (v: boolean) => void;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  markAlertRead: (id: string) => void;
  markAlertsRead: (ids: string[]) => void;
  silenceAlert: (id: string) => void;
}

const COLLAPSE_KEY = "xjh-psp-admin-collapsed";

export const useAdminStore = create<AdminState>((set, get) => ({
  collapsed:
    typeof window !== "undefined" ? localStorage.getItem(COLLAPSE_KEY) === "1" : false,
  drawerOpen: false,
  readAlertIds: new Set<string>(),
  silencedAlertIds: new Set<string>(),
  toggleCollapsed: () => {
    const next = !get().collapsed;
    localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
    set({ collapsed: next });
  },
  setCollapsed: (v) => {
    localStorage.setItem(COLLAPSE_KEY, v ? "1" : "0");
    set({ collapsed: v });
  },
  openDrawer: () => set({ drawerOpen: true }),
  closeDrawer: () => set({ drawerOpen: false }),
  toggleDrawer: () => set((s) => ({ drawerOpen: !s.drawerOpen })),
  markAlertRead: (id) =>
    set((s) => {
      const next = new Set(s.readAlertIds);
      next.add(id);
      return { readAlertIds: next };
    }),
  markAlertsRead: (ids) =>
    set((s) => {
      const next = new Set(s.readAlertIds);
      ids.forEach((id) => next.add(id));
      return { readAlertIds: next };
    }),
  silenceAlert: (id) =>
    set((s) => {
      const next = new Set(s.silencedAlertIds);
      next.add(id);
      return { silencedAlertIds: next };
    }),
}));
