import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Database,
  Cable,
  ListChecks,
  Search,
  AlertTriangle,
  Share2,
  SlidersHorizontal,
  ClipboardList,
  Workflow,
  MonitorPlay,
  Banknote,
  TrendingUp,
  ShieldCheck,
  HardHat,
  FileText,
  Settings,
} from "lucide-react";

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
}
export interface NavGroup {
  title?: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    items: [{ path: "/", label: "监管总览", icon: LayoutDashboard }],
  },
  {
    title: "数据采集中心",
    items: [
      { path: "/collection/overview", label: "数据采集概览", icon: Database },
      { path: "/collection/sources", label: "数据源管理", icon: Cable },
      { path: "/collection/tasks", label: "采集任务", icon: ListChecks },
    ],
  },
  {
    title: "智慧监督中心",
    items: [
      { path: "/monitoring/penetration", label: "穿透查询", icon: Search },
      { path: "/monitoring/risk-warnings", label: "风险预警", icon: AlertTriangle },
      { path: "/monitoring/graph", label: "关系图谱", icon: Share2 },
      { path: "/monitoring/rules", label: "规则配置", icon: SlidersHorizontal },
    ],
  },
  {
    title: "调度指挥中心",
    items: [
      { path: "/dispatch/work-orders", label: "核查工单", icon: ClipboardList },
      { path: "/dispatch/process", label: "处置流程", icon: Workflow },
      { path: "/dispatch/dashboard", label: "指挥大屏", icon: MonitorPlay },
    ],
  },
  {
    title: "业务场景",
    items: [
      { path: "/scenarios/finance", label: "财务资金监管", icon: Banknote },
      { path: "/scenarios/investment", label: "投资决策监管", icon: TrendingUp },
      { path: "/scenarios/compliance", label: "合规风控监管", icon: ShieldCheck },
      { path: "/scenarios/safety", label: "安全生产监管", icon: HardHat },
    ],
  },
  {
    title: "系统",
    items: [
      { path: "/system/audit", label: "审计日志", icon: FileText },
      { path: "/system/settings", label: "系统设置", icon: Settings },
    ],
  },
];

/** 根据路径查找所属分组标题，用于面包屑 */
export function findGroupTitle(path: string): string | undefined {
  for (const g of navGroups) {
    if (g.items.some((i) => i.path === path)) return g.title;
  }
  return undefined;
}

export function findNavItem(path: string): NavItem | undefined {
  for (const g of navGroups) {
    const item = g.items.find((i) => i.path === path);
    if (item) return item;
  }
  return undefined;
}
