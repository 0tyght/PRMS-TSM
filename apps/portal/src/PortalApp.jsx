import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { getPlatformSystem } from "./config/systems.js";
import PlatformLoginPage from "./pages/PlatformLoginPage.jsx";
import SystemPickerPage from "./pages/SystemPickerPage.jsx";
import { clearSession, getAccessToken, getActiveSystem, readSessionUser, setActiveSystem } from "@smart-thapho/web-core/session";
import { openSystemApplication } from "@smart-thapho/web-core/navigation";

export default function PortalApp() {
  const [token, setToken] = useState(getAccessToken);
  const user = useMemo(() => readSessionUser(token), [token]);
  const switchRequested = useMemo(
    () => new URLSearchParams(window.location.search).get("switch") === "1",
    [],
  );

  useEffect(() => {
    const expireSession = () => {
      clearSession();
      setToken("");
    };

    window.addEventListener("smart-thapho:session-expired", expireSession);
    return () => window.removeEventListener("smart-thapho:session-expired", expireSession);
  }, []);

  useLayoutEffect(() => {
    if (!token || switchRequested) return;

    const activeSystemId = getActiveSystem();
    if (getPlatformSystem(activeSystemId)) {
      openSystemApplication(activeSystemId, token, { replace: true });
      return;
    }

    clearSession();
    setToken("");
  }, [switchRequested, token]);

  const selectSystem = (systemId, sessionToken = token) => {
    if (!getPlatformSystem(systemId)) return;
    setActiveSystem(systemId);
    openSystemApplication(systemId, sessionToken, { replace: true });
  };

  const logout = () => {
    clearSession();
    setToken("");
  };

  if (!token) {
    return <PlatformLoginPage onLogin={(nextToken, systemId) => {
      selectSystem(systemId, nextToken);
    }} />;
  }

  if (!switchRequested) return null;

  return <SystemPickerPage user={user} onSelect={selectSystem} onLogout={logout} />;
}
