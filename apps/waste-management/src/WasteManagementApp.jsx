import { useEffect, useMemo } from "react";
import { clearSession, getAccessToken, readSessionUser } from "@smart-thapho/web-core/session";
import { getPortalUrl } from "@smart-thapho/web-core/navigation";
import WasteLayout from "./components/WasteLayout.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import PlansPage from "./pages/PlansPage.jsx";
import ResourcesPage from "./pages/ResourcesPage.jsx";
import TrackingPage from "./pages/TrackingPage.jsx";
import ServiceUsersPage from "./pages/ServiceUsersPage.jsx";
import BillingPage from "./pages/BillingPage.jsx";
import IncidentsPage from "./pages/IncidentsPage.jsx";
import ReportsPage from "./pages/ReportsPage.jsx";
import { useHashPage } from "./lib/useHashPage.js";
import "./waste.css";

const PAGES = Object.freeze({
  dashboard: DashboardPage,
  plans: PlansPage,
  resources: ResourcesPage,
  tracking: TrackingPage,
  "service-users": ServiceUsersPage,
  billing: BillingPage,
  incidents: IncidentsPage,
  reports: ReportsPage,
});

export default function WasteManagementApp() {
  const token = getAccessToken();
  const user = useMemo(() => readSessionUser(token), [token]);
  const { page, query, navigate } = useHashPage();
  const Page = PAGES[page] || DashboardPage;

  useEffect(() => { if (!token) window.location.replace(getPortalUrl()); }, [token]);
  useEffect(() => {
    const handleExpiredSession = () => {
      clearSession();
      window.location.assign(getPortalUrl());
    };
    window.addEventListener("smart-thapho:session-expired", handleExpiredSession);
    return () => window.removeEventListener("smart-thapho:session-expired", handleExpiredSession);
  }, []);
  if (!token) return <main className="waste-auth-check">กำลังตรวจสอบสิทธิ์เข้าใช้งาน</main>;

  const logout = () => { clearSession(); window.location.assign(getPortalUrl()); };
  return <WasteLayout page={page} navigate={navigate} user={user} onSwitchSystem={() => window.location.assign(getPortalUrl())} onLogout={logout}><Page token={token} navigate={navigate} planId={query.get("plan")} /></WasteLayout>;
}
