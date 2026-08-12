import { getPlatformSystem } from "../config/systems.js";

export class PortalController {
  constructor({ session, navigation, windowObject = window } = {}) {
    if (!session || !navigation) throw new TypeError("PortalController requires session and navigation services");
    this.session = session;
    this.navigation = navigation;
    this.windowObject = windowObject;
  }

  getSnapshot() {
    const token = this.session.getAccessToken();
    return Object.freeze({
      token,
      user: this.session.readUser(token),
      switchRequested: new URLSearchParams(this.windowObject.location.search).get("switch") === "1",
    });
  }

  openActiveSystem(token) {
    const activeSystemId = this.session.getActiveSystem();
    if (!getPlatformSystem(activeSystemId)) {
      this.session.clear();
      return false;
    }
    this.navigation.openSystemApplication(activeSystemId, token, { replace: true });
    return true;
  }

  selectSystem(systemId, token) {
    if (!getPlatformSystem(systemId)) return false;
    this.session.setActiveSystem(systemId);
    this.navigation.openSystemApplication(systemId, token, { replace: true });
    return true;
  }

  logout() {
    this.session.clear();
  }

  subscribeToExpiration(listener) {
    const handler = () => { this.logout(); listener(""); };
    this.windowObject.addEventListener("smart-thapho:session-expired", handler);
    return () => this.windowObject.removeEventListener("smart-thapho:session-expired", handler);
  }
}
