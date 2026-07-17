import { FileText } from "lucide-react";
import SkeletonPage from "./SkeletonPage";

export default function AuditPage() {
  return (
    <SkeletonPage
      title="审计日志"
      subtitle="系统 · 操作审计 / 数据访问 / 证据链留存"
      breadcrumb="系统 / 审计日志"
      icon={FileText}
      cards={[
        { title: "今日操作", value: "1,256", tone: "info" },
        { title: "数据访问", value: "8,932", tone: "info" },
        { title: "敏感操作", value: 18, tone: "warning" },
        { title: "异常告警", value: 0, tone: "success" },
      ]}
      features={[
        "用户操作全量审计",
        "数据访问记录追踪",
        "敏感操作二次确认",
        "审计证据链留存（防篡改）",
        "审计日志检索与导出",
        "合规留痕与取证支持",
      ]}
      relatedLinks={[
        { to: "/system/settings", label: "系统设置" },
        { to: "/", label: "监管总览" },
      ]}
    />
  );
}
