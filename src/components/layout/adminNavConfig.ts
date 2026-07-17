import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Bell,
  Users,
  Shield,
  ScrollText,
  Cable,
  Database,
  CalendarClock,
  GitBranch,
  Layers,
  SlidersHorizontal,
  Bot,
  EyeOff,
} from "lucide-react";

export interface AdminNavItem {
  path: string;
  label: string;
  icon: LucideIcon;
}
export interface AdminNavGroup {
  title: string;
  items: AdminNavItem[];
}

/** 后台 4 大模块 14 项导航 */
export const adminNavGroups: AdminNavGroup[] = [
  {
    title: "运营监控",
    items: [
      { path: "/admin/cockpit", label: "驾驶舱", icon: LayoutDashboard },
      { path: "/admin/alerts", label: "告警中心", icon: Bell },
    ],
  },
  {
    title: "系统管理",
    items: [
      { path: "/admin/users", label: "用户管理", icon: Users },
      { path: "/admin/roles", label: "角色权限", icon: Shield },
      { path: "/admin/audit-logs", label: "操作审计", icon: ScrollText },
    ],
  },
  {
    title: "数据采集运维",
    items: [
      { path: "/admin/connectors", label: "连接器目录", icon: Cable },
      { path: "/admin/sources-ops", label: "数据源运维", icon: Database },
      { path: "/admin/task-scheduler", label: "任务调度", icon: CalendarClock },
      { path: "/admin/transforms", label: "Transform 管道", icon: GitBranch },
    ],
  },
  {
    title: "监管配置",
    items: [
      { path: "/admin/scenes", label: "监管场景", icon: Layers },
      { path: "/admin/rules-models", label: "规则与模型", icon: SlidersHorizontal },
      { path: "/admin/ai-agents", label: "AI 智能体", icon: Bot },
      { path: "/admin/masking", label: "脱敏策略", icon: EyeOff },
    ],
  },
];

/** 根据路径查找所属分组标题（面包屑用） */
export function findAdminGroupTitle(path: string): string | undefined {
  for (const g of adminNavGroups) {
    if (g.items.some((i) => i.path === path)) return g.title;
  }
  return undefined;
}

export function findAdminNavItem(path: string): AdminNavItem | undefined {
  for (const g of adminNavGroups) {
    const item = g.items.find((i) => i.path === path);
    if (item) return item;
  }
  return undefined;
}
