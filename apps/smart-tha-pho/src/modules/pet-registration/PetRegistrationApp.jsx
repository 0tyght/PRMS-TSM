import { lazy, Suspense, useMemo } from "react";
import AdminLayout from "../../components/layout/AdminLayout.jsx";
import PageErrorBoundary from "../../components/layout/PageErrorBoundary.jsx";
import { ADMIN_MENU } from "../../config/navigation.js";
import { useHashPage } from "../../hooks/useHashPage.js";

const DashboardPage = lazy(() => import("../../pages/DashboardPage.jsx"));
const OwnersPage = lazy(() => import("../../pages/OwnersPage.jsx"));
const PetsPage = lazy(() => import("../../pages/PetsPage.jsx"));
const RegistrationsPage = lazy(() => import("../../pages/RegistrationsPage.jsx"));
const ServicesPage = lazy(() => import("../../pages/ServicesPage.jsx"));
const SettingsPage = lazy(() => import("../../pages/SettingsPage.jsx"));

const PAGE_COMPONENTS = Object.freeze({
  dashboard: DashboardPage,
  registrations: RegistrationsPage,
  owners: OwnersPage,
  pets: PetsPage,
  services: ServicesPage,
  settings: SettingsPage,
});

function PageLoading() {
  return (
    <section className="panel page-loading" aria-live="polite" aria-busy="true">
      <i aria-hidden="true">⌛</i>
      <h1>กำลังเปิดข้อมูลทะเบียนสัตว์เลี้ยง</h1>
      <p>กรุณารอสักครู่</p>
    </section>
  );
}

export default function PetRegistrationApp({ token, user, onSwitchSystem, onLogout }) {
  const { page, navigate } = useHashPage();
  const title = useMemo(
    () => ADMIN_MENU.find((item) => item.id === page)?.label || "ภาพรวม",
    [page],
  );
  const Page = PAGE_COMPONENTS[page] || DashboardPage;

  return (
    <AdminLayout
      page={page}
      navigate={navigate}
      title={title}
      user={user}
      onLogout={onLogout}
      onSwitchSystem={onSwitchSystem}
    >
      <PageErrorBoundary key={page} onRecover={() => navigate("dashboard")}>
        <Suspense fallback={<PageLoading />}>
          <Page token={token} navigate={navigate} />
        </Suspense>
      </PageErrorBoundary>
    </AdminLayout>
  );
}
