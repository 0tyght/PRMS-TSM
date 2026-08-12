import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import PlatformLoginPage from "./pages/PlatformLoginPage.jsx";
import SystemPickerPage from "./pages/SystemPickerPage.jsx";
import { createPortalController } from "./composition-root/createPortalController.js";

const portalController = createPortalController();

export default function PortalApp() {
  const initialSnapshot = useMemo(() => portalController.getSnapshot(), []);
  const [token, setToken] = useState(initialSnapshot.token);
  const user = useMemo(() => portalController.session.readUser(token), [token]);
  const switchRequested = initialSnapshot.switchRequested;

  useEffect(() => {
    return portalController.subscribeToExpiration(setToken);
  }, []);

  useLayoutEffect(() => {
    if (!token || switchRequested) return;

    if (!portalController.openActiveSystem(token)) setToken("");
  }, [switchRequested, token]);

  const selectSystem = (systemId, sessionToken = token) => {
    portalController.selectSystem(systemId, sessionToken);
  };

  const logout = () => {
    portalController.logout();
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
