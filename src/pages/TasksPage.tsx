import { ListChecks } from "lucide-react";
import SkeletonPage from "./SkeletonPage";

export default function TasksPage() {
  return (
    <SkeletonPage
      title="采集任务"
      subtitle="数据采集中心 · 任务调度、运行监控、失败重试"
      breadcrumb="数据采集中心 / 采集任务"
      icon={ListChecks}
      cards={[
        { title: "运行中任务", value: 12, tone: "info" },
        { title: "今日成功", value: 156, tone: "success" },
        { title: "今日失败", value: 3, tone: "error" },
        { title: "平均延迟", value: "1.2s", tone: "info" },
      ]}
      features={[
        "全量/增量/CDC 三种采集模式",
        "Cron 调度 + 实时流式",
        "失败任务自动重试与告警",
        "吞吐量与延迟监控",
        "任务依赖编排（DAG）",
        "数据质量校验钩子",
      ]}
      relatedLinks={[
        { to: "/collection/overview", label: "数据采集概览" },
        { to: "/collection/sources", label: "数据源管理" },
      ]}
    />
  );
}
