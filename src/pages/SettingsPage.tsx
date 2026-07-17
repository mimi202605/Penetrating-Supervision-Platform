import { Settings } from "lucide-react";
import SkeletonPage from "./SkeletonPage";

export default function SettingsPage() {
  return (
    <SkeletonPage
      title="系统设置"
      subtitle="系统 · 用户权限 / 通知配置 / 系统参数"
      breadcrumb="系统 / 系统设置"
      icon={Settings}
      cards={[
        { title: "注册用户", value: 286, tone: "info" },
        { title: "角色数", value: 5, tone: "info" },
        { title: "通知通道", value: 4, tone: "success" },
        { title: "系统可用性", value: "99.97%", tone: "success" },
      ]}
      features={[
        "用户与角色管理（5 类角色）",
        "Keycloak 单点登录集成",
        "通知通道配置（站内信/短信/邮件/加急）",
        "系统参数动态调整",
        "数据保留策略配置",
        "信创环境兼容适配",
      ]}
      relatedLinks={[
        { to: "/system/audit", label: "审计日志" },
        { to: "/", label: "监管总览" },
      ]}
    />
  );
}
