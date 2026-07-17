import { Cable } from "lucide-react";
import SkeletonPage from "./SkeletonPage";

export default function SourcesPage() {
  return (
    <SkeletonPage
      title="数据源管理"
      subtitle="数据采集中心 · 数据源接入、健康监控、权限管理"
      breadcrumb="数据采集中心 / 数据源管理"
      icon={Cable}
      cards={[
        { title: "已接入数据源", value: 246, tone: "info" },
        { title: "在线", value: 244, tone: "success" },
        { title: "异常", value: 2, tone: "error" },
        { title: "今日新增", value: 0, tone: "info" },
      ]}
      features={[
        "浪潮 iGIX 模块化接入（凭证/合同/项目/客商）",
        "司库系统 binlog CDC 实时同步",
        "Oracle/JDBC 增量调度",
        "数据源健康度仪表盘",
        "字段映射与脱敏配置",
        "采集权限与审计",
      ]}
      relatedLinks={[
        { to: "/collection/overview", label: "数据采集概览" },
        { to: "/collection/tasks", label: "采集任务" },
      ]}
    />
  );
}
