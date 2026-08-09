import { useEffect, useMemo, useState } from "react";
import { getPlatformSystem } from "./config/systems.js";
import PlatformLoginPage from "./pages/PlatformLoginPage.jsx";
import SystemPickerPage from "./pages/SystemPickerPage.jsx";
import { clearSession, getAccessToken, readSessionUser, setActiveSystem } from "@smart-thapho/web-core/session";
import { openSystemApplication } from "@smart-thapho/web-core/navigation";

export default function PortalApp() {
  const [token, setToken] = useState(getAccessToken);
  const user = useMemo(() => readSessionUser(token), [token]);

  useEffect(() => {
    const expireSession = () => {
      clearSession();
      setToken("");
    };

    window.addEventListener("smart-thapho:session-expired", expireSession);
    return () => window.removeEventListener("smart-thapho:session-expired", expireSession);
  }, []);

  const selectSystem = (systemId) => {
    if (!getPlatformSystem(systemId)) return;
    setActiveSystem(systemId);
    openSystemApplication(systemId);
  };

  const logout = () => {
    clearSession();
    setToken("");
  };

  if (!token) {
    return <PlatformLoginPage onLogin={(nextToken, systemId) => {
      setToken(nextToken);
      selectSystem(systemId);
    }} />;
  }

  return <SystemPickerPage user={user} onSelect={selectSystem} onLogout={logout} />;
}
