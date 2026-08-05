import { useEffect, useMemo, useState } from "react";
import AdminLayout from "./components/layout/AdminLayout.jsx";
import PageErrorBoundary from "./components/layout/PageErrorBoundary.jsx";
import { ADMIN_MENU } from "./config/navigation.js";
import { useHashPage } from "./hooks/useHashPage.js";
import DashboardPage from "./pages/DashboardPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import OwnersPage from "./pages/OwnersPage.jsx";
import PetsPage from "./pages/PetsPage.jsx";
import RegistrationsPage from "./pages/RegistrationsPage.jsx";
import ServicesPage from "./pages/ServicesPage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";

const PAGE_COMPONENTS = {
  dashboard: DashboardPage,
  registrations: RegistrationsPage,
  owners: OwnersPage,
  pets: PetsPage,
  services: ServicesPage,
  settings: SettingsPage,
};

function readSessionUser(token) {
  try {
    const payload = token.split(".")[1];
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const normalized = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const bytes = Uint8Array.from(window.atob(normalized), (character) => character.charCodeAt(0));
    const data = JSON.parse(new TextDecoder().decode(bytes));
    return { name: data.name || "เจ้าหน้าที่เทศบาล", role: data.role || "OFFICER" };
  } catch {
    return { name: "เจ้าหน้าที่เทศบาล", role: "OFFICER" };
  }
}

export default function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem("prms_access_token"));
  const { page, navigate } = useHashPage();
  const sessionUser = useMemo(() => readSessionUser(token || ""), [token]);
  const title = useMemo(
    () => ADMIN_MENU.find((item) => item.id === page)?.label || "ภาพรวม",
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
    <AdminLayout page={page} navigate={navigate} title={title} user={sessionUser} onLogout={logout}>
      <PageErrorBoundary key={page} onRecover={() => navigate("dashboard")}>
        <Page token={token} navigate={navigate} />
      </PageErrorBoundary>
    </AdminLayout>
  );
}
