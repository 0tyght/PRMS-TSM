const SYSTEM_ROUTES = Object.freeze({ pet: "prms-tsm", waste: "waste-management", disaster: "disaster-management", water: "waterworks-management" });
const LOCAL_PORTS = Object.freeze({ pet: 5174, waste: 5175, disaster: 5176, water: 5177 });

export class NavigationService {
  constructor({ windowObject = window } = {}) {
    this.windowObject = windowObject;
  }

  isLocalhost() {
    return ["localhost", "127.0.0.1"].includes(this.windowObject.location.hostname);
  }

  getPortalUrl() {
    const { location } = this.windowObject;
    if (this.isLocalhost()) return `${location.protocol}//${location.hostname}:5173/`;
    for (const route of Object.values(SYSTEM_ROUTES)) {
      const marker = `/${route}/`;
      const index = location.pathname.indexOf(marker);
      if (index >= 0) return `${location.origin}${location.pathname.slice(0, index + 1)}`;
    }
    return `${location.origin}${location.pathname.endsWith("/") ? location.pathname : `${location.pathname}/`}`;
  }

  getSystemUrl(systemId) {
    const route = SYSTEM_ROUTES[systemId];
    if (!route) return this.getPortalUrl();
    if (this.isLocalhost()) return `${this.windowObject.location.protocol}//${this.windowObject.location.hostname}:${LOCAL_PORTS[systemId]}/`;
    return new URL(`${route}/`, this.getPortalUrl()).href;
  }

  getSystemPickerUrl() {
    const target = new URL(this.getPortalUrl());
    target.searchParams.set("switch", "1");
    return target.href;
  }

  openSystemApplication(systemId, token = "", { replace = false } = {}) {
    const targetUrl = this.getSystemUrl(systemId);
    const navigate = (url) => replace ? this.windowObject.location.replace(url) : this.windowObject.location.assign(url);
    if (!this.isLocalhost() || !token) return navigate(targetUrl);
    const target = new URL(targetUrl);
    target.searchParams.set("smart_thapho_session", token);
    target.searchParams.set("smart_thapho_system", systemId);
    return navigate(target.href);
  }
}

