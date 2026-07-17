import { useEffect, useMemo, useState } from "react";
import AdminLayout from "./components/layout/AdminLayout.jsx";
import PageErrorBoundary from "./components/layout/PageErrorBoundary.jsx";
import { ADMIN_MENU } from "./config/navigation.js";
import { useHashPage } from "./hooks/useHashPage.js";
import CasesPage from "./pages/CasesPage.jsx";
import AuditPage from "./pages/AuditPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import OwnersPage from "./pages/OwnersPage.jsx";
import PetsPage from "./pages/PetsPage.jsx";
import RegistrationsPage from "./pages/RegistrationsPage.jsx";
import ReportsPage from "./pages/ReportsPageResponsive.jsx";
import ServicesPage from "./pages/ServicesPage.jsx";
import SettingsPage from "./pages/SettingsPageLive.jsx";

const PAGE_COMPONENTS = {
  dashboard: DashboardPage,
  registrations: RegistrationsPage,
  owners: OwnersPage,
  pets: PetsPage,
  services: ServicesPage,
  cases: CasesPage,
  reports: ReportsPage,
  audit: AuditPage,
  settings: SettingsPage,
};

export default function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem("prms_access_token"));
  const { page, navigate } = useHashPage();
  const title = useMemo(
    () => ADMIN_MENU.find((item) => item.id === page)?.label || "ภาพรวมและแผนที่",
    [page],
  );

  useEffect(() => {
    const expireSession = () => {
      sessionStorage.removeItem("prms_access_token");
      setToken(null);
    };
    window.addEventListener("prms:session-expired", expireSession);
    return () => window.removeEventListener("prms:session-expired", expireSession);
  }, []);

  if (!token) return <LoginPage onLogin={setToken} />;

  const Page = PAGE_COMPONENTS[page] || DashboardPage;
  const logout = () => {
    sessionStorage.removeItem("prms_access_token");
    setToken(null);
  };

  return (
    <AdminLayout page={page} navigate={navigate} title={title} onLogout={logout}>
      <PageErrorBoundary key={page} onRecover={() => navigate("dashboard")}>
        <Page token={token} navigate={navigate} />
      </PageErrorBoundary>
    </AdminLayout>
  );
}
