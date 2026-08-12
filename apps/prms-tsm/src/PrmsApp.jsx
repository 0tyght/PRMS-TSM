import { lazy, Suspense, useEffect, useMemo } from "react";
import AdminLayout from "./components/layout/AdminLayout.jsx";
import PageErrorBoundary from "./components/layout/PageErrorBoundary.jsx";
import { useHashPage } from "./hooks/useHashPage.js";
import { PrmsApplicationController } from "./application/PrmsApplicationController.js";

const applicationController = new PrmsApplicationController();

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
  const { page: requestedPage, navigate } = useHashPage();
  const viewModel = useMemo(() => applicationController.createViewModel(requestedPage), [requestedPage]);
  const { token, user, page, title } = viewModel;
  const Page = PAGE_COMPONENTS[page] || DashboardPage;

  useEffect(() => {
    if (!token) applicationController.redirectToLogin();
  }, [token]);

  useEffect(() => {
    if (requestedPage !== page) navigate(page);
  }, [navigate, page, requestedPage]);

  if (!token) return <main className="prms-auth-check">กำลังนำกลับไปยังหน้าเข้าสู่ระบบ…</main>;

  return (
    <AdminLayout page={page} navigate={navigate} title={title} user={user} onLogout={() => applicationController.logout()} onSwitchSystem={() => applicationController.switchSystem()}>
      <PageErrorBoundary key={page} onRecover={() => navigate("dashboard")}>
        <Suspense fallback={<PageLoading />}><Page token={token} navigate={navigate} /></Suspense>
      </PageErrorBoundary>
    </AdminLayout>
  );
}
