import { lazy, Suspense, useEffect, useMemo } from "react";
import AdminLayout from "./components/layout/AdminLayout.jsx";
import PageErrorBoundary from "./components/layout/PageErrorBoundary.jsx";
import { ADMIN_MENU } from "./config/navigation.js";
import { useHashPage } from "./hooks/useHashPage.js";
import { clearSession, getAccessToken, readSessionUser } from "@smart-thapho/web-core/session";
import { getPortalUrl, getSystemPickerUrl } from "@smart-thapho/web-core/navigation";

const DashboardPage = lazy(() => import("./pages/DashboardPage.jsx"));
const OwnersPage = lazy(() => import("./pages/OwnersPage.jsx"));
const PetsPage = lazy(() => import("./pages/PetsPage.jsx"));
const RegistrationsPage = lazy(() => import("./pages/RegistrationsPage.jsx"));
const ServicesPage = lazy(() => import("./pages/ServicesPage.jsx"));
const SettingsPage = lazy(() => import("./pages/SettingsPage.jsx"));

const PAGE_COMPONENTS = Object.freeze({ dashboard: DashboardPage, registrations: RegistrationsPage, owners: OwnersPage, pets: PetsPage, services: ServicesPage, settings: SettingsPage });

function PageLoading() {
  return <section className="panel page-loading" aria-live="polite" aria-busy="true"><i aria-hidden="true">◌</i><h1>กำลังเปิดข้อมูลทะเบียนสัตว์เลี้ยง</h1><p>กรุณารอสักครู่</p></section>;
}

export default function PrmsApp() {
  const token = getAccessToken();
  const user = useMemo(() => readSessionUser(token), [token]);
  const { page, navigate } = useHashPage();
  const permittedPage = page === "settings" && user?.role !== "ADMIN" ? "dashboard" : page;
  const title = useMemo(() => ADMIN_MENU.find((item) => item.id === permittedPage)?.label || "ภาพรวม", [permittedPage]);
  const Page = PAGE_COMPONENTS[permittedPage] || DashboardPage;

  useEffect(() => {
    if (!token) window.location.replace(getPortalUrl());
  }, [token]);

  useEffect(() => {
    if (page === "settings" && user?.role !== "ADMIN") navigate("dashboard");
  }, [navigate, page, user?.role]);

  if (!token) return <main className="prms-auth-check">กำลังนำกลับไปยังหน้าเข้าสู่ระบบ…</main>;

  const returnToPortal = () => window.location.assign(getSystemPickerUrl());
  const logout = () => {
    clearSession();
    window.location.assign(getPortalUrl());
  };

  return (
    <AdminLayout page={permittedPage} navigate={navigate} title={title} user={user} onLogout={logout} onSwitchSystem={returnToPortal}>
      <PageErrorBoundary key={permittedPage} onRecover={() => navigate("dashboard")}>
        <Suspense fallback={<PageLoading />}><Page token={token} navigate={navigate} /></Suspense>
      </PageErrorBoundary>
    </AdminLayout>
  );
}
