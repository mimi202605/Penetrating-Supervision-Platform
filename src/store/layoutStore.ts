import { create } from "zustand";

interface LayoutState {
  // 桌面端侧栏折叠（图标模式）
  collapsed: boolean;
  // 移动端侧栏抽屉
  drawerOpen: boolean;
  toggleCollapsed: () => void;
  setCollapsed: (v: boolean) => void;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
}

const STORAGE_KEY = "xjh-psp-sidebar";

export const useLayoutStore = create<LayoutState>((set, get) => ({
  collapsed: typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) === "1" : false,
  drawerOpen: false,
  toggleCollapsed: () => {
    const next = !get().collapsed;
    localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    set({ collapsed: next });
  },
  setCollapsed: (v) => {
    localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
    set({ collapsed: v });
  },
  openDrawer: () => set({ drawerOpen: true }),
  closeDrawer: () => set({ drawerOpen: false }),
  toggleDrawer: () => set((s) => ({ drawerOpen: !s.drawerOpen })),
}));
