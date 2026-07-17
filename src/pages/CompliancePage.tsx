import { ShieldCheck } from "lucide-react";
import SkeletonPage from "./SkeletonPage";

export default function CompliancePage() {
  return (
    <SkeletonPage
      title="合规风控监管"
      subtitle="业务场景 · 合规检查 / 风控阈值 / 制度执行穿透"
      breadcrumb="业务场景 / 合规风控监管"
      icon={ShieldCheck}
      cards={[
        { title: "合规检查项", value: 286, tone: "info" },
        { title: "本月违规", value: 14, tone: "warning" },
        { title: "已整改", value: 11, tone: "success" },
        { title: "待整改", value: 3, tone: "error" },
      ]}
      features={[
        "合规规则库（国资委/行业/集团）",
        "风控阈值动态管理",
        "制度执行穿透检查",
        "违规事件闭环处置",
        "合规风险评分模型",
        "合规报告自动生成",
      ]}
      relatedLinks={[
        { to: "/scenarios/finance", label: "财务资金监管" },
        { to: "/monitoring/rules", label: "规则配置" },
      ]}
    />
  );
}
