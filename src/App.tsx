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
import LoginPage from "@/pages/LoginPage";

export default function App() {
  return (
    <Router>
      <Routes>
        {/* 登录页：独立路由，不挂载 AppLayout（无侧栏/顶栏），作为 401 跳转目标 */}
        <Route path="/login" element={<LoginPage />} />
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
      </Routes>
    </Router>
  );
}
