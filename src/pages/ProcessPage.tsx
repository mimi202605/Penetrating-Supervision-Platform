import { Workflow } from "lucide-react";
import SkeletonPage from "./SkeletonPage";

export default function ProcessPage() {
  return (
    <SkeletonPage
      title="处置流程"
      subtitle="调度指挥中心 · Flowable 工单引擎 · 流程编排与监控"
      breadcrumb="调度指挥中心 / 处置流程"
      icon={Workflow}
      cards={[
        { title: "在办流程", value: 47, tone: "info" },
        { title: "今日归档", value: 8, tone: "success" },
        { title: "超时预警", value: 3, tone: "error" },
        { title: "按时率", value: "96%", tone: "success" },
      ]}
      features={[
        "Flowable BPMN 流程编排",
        "核查 → 整改 → 复核 → 归档 四级流转",
        "超时催办与升级机制",
        "节点 SLA 配置与监控",
        "审批权限矩阵",
        "流程实例可视化追踪",
      ]}
      relatedLinks={[
        { to: "/dispatch/work-orders", label: "核查工单" },
        { to: "/dispatch/dashboard", label: "指挥大屏" },
      ]}
    />
  );
}
