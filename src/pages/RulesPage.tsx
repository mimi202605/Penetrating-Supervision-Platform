import { SlidersHorizontal } from "lucide-react";
import SkeletonPage from "./SkeletonPage";

export default function RulesPage() {
  return (
    <SkeletonPage
      title="规则配置"
      subtitle="智慧监督中心 · 监控规则 / 模型 / 阈值 / 启停管理"
      breadcrumb="智慧监督中心 / 规则配置"
      icon={SlidersHorizontal}
      cards={[
        { title: "监控规则", value: "1,820", tone: "info" },
        { title: "在线模型", value: 36, tone: "success" },
        { title: "本月命中", value: 326, tone: "warning" },
        { title: "规则版本", value: "v2.4", tone: "info" },
      ]}
      features={[
        "Drools 规则引擎可视化编辑",
        "11+N 风险规则模板库",
        "阈值动态调整与生效控制",
        "AI 模型在线推理编排",
        "规则版本管理与回滚",
        "命中测试与沙盒验证",
      ]}
      relatedLinks={[
        { to: "/monitoring/risk-warnings", label: "风险预警" },
        { to: "/monitoring/penetration", label: "穿透查询" },
      ]}
    />
  );
}
