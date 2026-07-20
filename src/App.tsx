import { HashRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "@/components/layout/AppLayout";
import OverviewPage from "@/pages/OverviewPage";
import CollectionOverviewPage from "@/pages/CollectionOverviewPage";
import SourcesPage from "@/pages/SourcesPage";
import TasksPage from "@/pages/TasksPage";
import PenetrationPage from "@/pages/PenetrationPage";
import RiskWarningsPage from "@/pages/RiskWarningsPage";
import GraphPage from "@/pages/GraphPage";
import RulesPage from "@/pages/RulesPage";
import WorkOrdersPage from "@/pages/WorkOrdersPage";
import ProcessPage from "@/pages/ProcessPage";
import BigScreenPage from "@/pages/BigScreenPage";
import FinancePage from "@/pages/FinancePage";
import InvestmentPage from "@/pages/InvestmentPage";
import CompliancePage from "@/pages/CompliancePage";
import SafetyPage from "@/pages/SafetyPage";
import AuditPage from "@/pages/AuditPage";
import SettingsPage from "@/pages/SettingsPage";
import AdminLayout from "@/components/layout/AdminLayout";
import RequireAdmin from "@/components/admin/RequireAdmin";
import LoginPage from "@/pages/admin/LoginPage";
import CockpitPage from "@/pages/admin/CockpitPage";
import AlertsPage from "@/pages/admin/AlertsPage";
import UsersPage from "@/pages/admin/UsersPage";
import RolesPage from "@/pages/admin/RolesPage";
import AuditLogsPage from "@/pages/admin/AuditLogsPage";
import ConnectorsPage from "@/pages/admin/ConnectorsPage";
import SourcesOpsPage from "@/pages/admin/SourcesOpsPage";
import TaskSchedulerPage from "@/pages/admin/TaskSchedulerPage";
import TransformsPage from "@/pages/admin/TransformsPage";
import ScenesPage from "@/pages/admin/ScenesPage";
import RulesModelsPage from "@/pages/admin/RulesModelsPage";
import AiAgentsPage from "@/pages/admin/AiAgentsPage";
import MaskingPage from "@/pages/admin/MaskingPage";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/collection/overview" element={<CollectionOverviewPage />} />
          <Route path="/collection/sources" element={<SourcesPage />} />
          <Route path="/collection/tasks" element={<TasksPage />} />
          <Route path="/monitoring/penetration" element={<PenetrationPage />} />
          <Route path="/monitoring/risk-warnings" element={<RiskWarningsPage />} />
          <Route path="/monitoring/graph" element={<GraphPage />} />
          <Route path="/monitoring/rules" element={<RulesPage />} />
          <Route path="/dispatch/work-orders" element={<WorkOrdersPage />} />
          <Route path="/dispatch/process" element={<ProcessPage />} />
          <Route path="/dispatch/dashboard" element={<BigScreenPage />} />
          <Route path="/scenarios/finance" element={<FinancePage />} />
          <Route path="/scenarios/investment" element={<InvestmentPage />} />
          <Route path="/scenarios/compliance" element={<CompliancePage />} />
          <Route path="/scenarios/safety" element={<SafetyPage />} />
          <Route path="/system/audit" element={<AuditPage />} />
          <Route path="/system/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
        {/* 后台管理中心 */}
        <Route path="/admin/login" element={<LoginPage />} />
        <Route element={<AdminLayout />}>
          <Route element={<RequireAdmin />}>
            <Route path="/admin/cockpit" element={<CockpitPage />} />
            <Route path="/admin/alerts" element={<AlertsPage />} />
            <Route path="/admin/users" element={<UsersPage />} />
            <Route path="/admin/roles" element={<RolesPage />} />
            <Route path="/admin/audit-logs" element={<AuditLogsPage />} />
            <Route path="/admin/connectors" element={<ConnectorsPage />} />
            <Route path="/admin/sources-ops" element={<SourcesOpsPage />} />
            <Route path="/admin/task-scheduler" element={<TaskSchedulerPage />} />
            <Route path="/admin/transforms" element={<TransformsPage />} />
            <Route path="/admin/scenes" element={<ScenesPage />} />
            <Route path="/admin/rules-models" element={<RulesModelsPage />} />
            <Route path="/admin/ai-agents" element={<AiAgentsPage />} />
            <Route path="/admin/masking" element={<MaskingPage />} />
          </Route>
        </Route>
      </Routes>
    </Router>
  );
}
