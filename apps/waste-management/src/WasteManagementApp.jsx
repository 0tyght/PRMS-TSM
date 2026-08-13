import { useEffect, useMemo } from "react";
import WasteLayout from "./components/WasteLayout.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import PlansPage from "./pages/PlansPage.jsx";
import ResourcesPage from "./pages/ResourcesPage.jsx";
import TrackingPage from "./pages/TrackingPage.jsx";
import ServiceUsersPage from "./pages/ServiceUsersPage.jsx";
import BillingPage from "./pages/BillingPage.jsx";
import IncidentsPage from "./pages/IncidentsPage.jsx";
import ReportsPage from "./pages/ReportsPage.jsx";
import DriverTrackingPage from "./pages/DriverTrackingPage.jsx";
import { useHashPage } from "./lib/useHashPage.js";
import { WasteApplicationController } from "./application/WasteApplicationController.js";
import "./waste.css";
import "./route-assignment.css";

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

const applicationController = new WasteApplicationController({ pageIds: Object.keys(PAGES) });

export default function WasteManagementApp() {
  const { page: requestedPage, query, navigate } = useHashPage();
  const isDriverTracking = requestedPage === "driver-gps";
  const viewModel = useMemo(() => applicationController.createViewModel(requestedPage), [requestedPage]);
  const { token, user, page } = viewModel;
  const Page = PAGES[page] || DashboardPage;

  useEffect(() => { if (!isDriverTracking && !token) applicationController.redirectToLogin(); }, [isDriverTracking, token]);
  useEffect(() => {
    return applicationController.subscribeToExpiration(() => applicationController.logout());
  }, []);
  useEffect(() => { if (!isDriverTracking && requestedPage !== page) navigate(page); }, [isDriverTracking, navigate, page, requestedPage]);
  if (isDriverTracking) return <DriverTrackingPage trackingToken={query.get("token") || ""} />;
  if (!token) return <main className="waste-auth-check">กำลังตรวจสอบสิทธิ์เข้าใช้งาน</main>;

  return <WasteLayout page={page} navigate={navigate} user={user} onSwitchSystem={() => applicationController.switchSystem()} onLogout={() => applicationController.logout()}><Page token={token} navigate={navigate} planId={query.get("plan")} /></WasteLayout>;
}
