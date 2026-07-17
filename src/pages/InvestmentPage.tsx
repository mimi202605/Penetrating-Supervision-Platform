import { TrendingUp } from "lucide-react";
import SkeletonPage from "./SkeletonPage";

export default function InvestmentPage() {
  return (
    <SkeletonPage
      title="投资决策监管"
      subtitle="业务场景 · 投资项目全周期穿透 / 决策越权识别 / 收益异常监测"
      breadcrumb="业务场景 / 投资决策监管"
      icon={TrendingUp}
      cards={[
        { title: "在投项目", value: 42, tone: "info" },
        { title: "本年投资额", value: "186 亿", tone: "info" },
        { title: "决策越权预警", value: 5, tone: "error" },
        { title: "投资收益率", value: "8.6%", tone: "success" },
      ]}
      features={[
        "投资项目全周期穿透",
        "决策越权规则识别（R-056）",
        "收益异常波动监测",
        "投资合规性自动审查",
        "投后管理跟踪",
        "投资组合风险视图",
      ]}
      relatedLinks={[
        { to: "/scenarios/finance", label: "财务资金监管" },
        { to: "/monitoring/risk-warnings", label: "风险预警" },
      ]}
    />
  );
}
