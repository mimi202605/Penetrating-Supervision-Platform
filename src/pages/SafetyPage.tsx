import { HardHat } from "lucide-react";
import SkeletonPage from "./SkeletonPage";

export default function SafetyPage() {
  return (
    <SkeletonPage
      title="安全生产监管"
      subtitle="业务场景 · 隐患排查 / 整改跟踪 / 应急响应穿透"
      breadcrumb="业务场景 / 安全生产监管"
      icon={HardHat}
      cards={[
        { title: "隐患总数", value: 128, tone: "info" },
        { title: "重大隐患", value: 6, tone: "error" },
        { title: "已整改", value: 112, tone: "success" },
        { title: "整改率", value: "87.5%", tone: "warning" },
      ]}
      features={[
        "安全隐患排查台账",
        "整改进度实时跟踪",
        "应急响应预案穿透",
        "重大隐患升级预警",
        "安全责任落实追踪",
        "安全事故复盘分析",
      ]}
      relatedLinks={[
        { to: "/dispatch/work-orders", label: "核查工单" },
        { to: "/dispatch/dashboard", label: "指挥大屏" },
      ]}
    />
  );
}
