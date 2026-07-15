import { useMemo, useState } from "react";
import { ADMIN_MENU } from "./config/navigation.js";
import { useHashPage } from "./hooks/useHashPage.js";
import AdminLayout from "./components/layout/AdminLayout.jsx";
import PageErrorBoundary from "./components/layout/PageErrorBoundary.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import RegistrationsPage from "./pages/RegistrationsPage.jsx";
import PetsPage from "./pages/PetsPage.jsx";
import ServicesPage from "./pages/ServicesPage.jsx";
import MapPage from "./pages/MapPage.jsx";
import CasesPage from "./pages/CasesPage.jsx";
import ReportsPage from "./pages/ReportsPage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";

const PAGE_COMPONENTS = {
  dashboard: DashboardPage,
  registrations: RegistrationsPage,
  pets: PetsPage,
  services: ServicesPage,
  map: MapPage,
  cases: CasesPage,
  reports: ReportsPage,
  settings: SettingsPage,
};

export default function App() {
  const [token, setToken] = useState(() => {
    try {
      return sessionStorage.getItem("prms_access_token");
    } catch {
      return null;
    }
  });

  const { page, navigate } = useHashPage();

  const title = useMemo(
    () =>
      ADMIN_MENU.find((item) => item.id === page)?.label ||
      "ภาพรวม",
    [page],
  );

  if (!token) {
    return <LoginPage onLogin={setToken} />;
  }

  const Page = PAGE_COMPONENTS[page] || DashboardPage;

  function logout() {
    try {
      sessionStorage.removeItem("prms_access_token");
    } catch {
      // ดำเนินการออกจากระบบต่อ
    }

    setToken(null);
  }

  function recoverPage() {
    if (page === "dashboard") {
      window.location.reload();
      return;
    }

    navigate("dashboard");
  }

  return (
    <AdminLayout
      page={page}
      navigate={navigate}
      title={title}
      onLogout={logout}
    >
      <PageErrorBoundary
        resetKey={page}
        onRecover={recoverPage}
      >
        <Page
          key={page}
          token={token}
          navigate={navigate}
        />
      </PageErrorBoundary>
    </AdminLayout>
  );
}