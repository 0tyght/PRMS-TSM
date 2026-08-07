import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { getPlatformSystem } from "./config/systems.js";
import PlatformLoginPage from "./pages/PlatformLoginPage.jsx";
import SystemPickerPage from "./pages/SystemPickerPage.jsx";

const APPLICATIONS = Object.freeze({
  pet: lazy(() => import("./apps/pet-registration/PetRegistrationApp.jsx")),
  waste: lazy(() => import("./apps/waste-management/WasteManagementApp.jsx")),
  disaster: lazy(() => import("./apps/disaster-management/DisasterManagementApp.jsx")),
  water: lazy(() => import("./apps/waterworks-management/WaterworksManagementApp.jsx")),
});

function getAccessToken() {
  const token = sessionStorage.getItem("smart_thapho_access_token");
  if (token) return token;

  const legacyToken = sessionStorage.getItem("prms_access_token");
  if (!legacyToken) return null;

  sessionStorage.setItem("smart_thapho_access_token", legacyToken);
  sessionStorage.removeItem("prms_access_token");
  return legacyToken;
}

function getActiveSystemId() {
  const systemId = sessionStorage.getItem("smart_thapho_active_system");
  return getPlatformSystem(systemId) ? systemId : null;
}

function readSessionUser(token) {
  try {
    const payload = token.split(".")[1];
    const normalized = payload
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const bytes = Uint8Array.from(window.atob(normalized), (character) => character.charCodeAt(0));
    const data = JSON.parse(new TextDecoder().decode(bytes));
    return { name: data.name || "เจ้าหน้าที่เทศบาล", role: data.role || "OFFICER" };
  } catch {
    return { name: "เจ้าหน้าที่เทศบาล", role: "OFFICER" };
  }
}

function ApplicationLoading() {
  return (
    <main className="platform-picker-page">
      <section className="panel page-loading" aria-live="polite" aria-busy="true">
        <i aria-hidden="true">⌛</i>
        <h1>กำลังเปิดระบบงาน</h1>
        <p>กรุณารอสักครู่</p>
      </section>
    </main>
  );
}

export default function SmartThaPhoApp() {
  const [token, setToken] = useState(getAccessToken);
  const [activeSystemId, setActiveSystemId] = useState(getActiveSystemId);
  const activeSystem = getPlatformSystem(activeSystemId);
  const user = useMemo(() => readSessionUser(token || ""), [token]);

  useEffect(() => {
    const expireSession = () => {
      sessionStorage.removeItem("smart_thapho_access_token");
      sessionStorage.removeItem("smart_thapho_active_system");
      setActiveSystemId(null);
      setToken(null);
    };

    window.addEventListener("smart-thapho:session-expired", expireSession);
    window.addEventListener("prms:session-expired", expireSession);
    return () => {
      window.removeEventListener("smart-thapho:session-expired", expireSession);
      window.removeEventListener("prms:session-expired", expireSession);
    };
  }, []);

  const selectSystem = (systemId) => {
    if (!getPlatformSystem(systemId)) return;
    sessionStorage.setItem("smart_thapho_active_system", systemId);
    setActiveSystemId(systemId);
  };

  const switchSystem = () => {
    sessionStorage.removeItem("smart_thapho_active_system");
    setActiveSystemId(null);
  };

  const logout = () => {
    sessionStorage.removeItem("smart_thapho_access_token");
    sessionStorage.removeItem("smart_thapho_active_system");
    sessionStorage.removeItem("prms_access_token");
    setActiveSystemId(null);
    setToken(null);
  };

  if (!token) {
    return <PlatformLoginPage onLogin={(nextToken, systemId) => {
      setToken(nextToken);
      selectSystem(systemId);
    }} />;
  }

  if (!activeSystem) {
    return <SystemPickerPage user={user} onSelect={selectSystem} onLogout={logout} />;
  }

  const Application = APPLICATIONS[activeSystem.id];
  return (
    <Suspense fallback={<ApplicationLoading />}>
      <Application
        token={token}
        user={user}
        system={activeSystem}
        onSwitchSystem={switchSystem}
        onLogout={logout}
      />
    </Suspense>
  );
}
