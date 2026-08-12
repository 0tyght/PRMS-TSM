const ACCESS_TOKEN_KEY = "smart_thapho_access_token";
const ACTIVE_SYSTEM_KEY = "smart_thapho_active_system";
const LEGACY_ACCESS_TOKEN_KEY = "prms_access_token";
const LOCAL_SESSION_PARAM = "smart_thapho_session";
const LOCAL_SYSTEM_PARAM = "smart_thapho_system";

export class SessionStore {
  constructor({ storage = sessionStorage, windowObject = window } = {}) {
    this.storage = storage;
    this.windowObject = windowObject;
  }

  isLocalhost() {
    return ["localhost", "127.0.0.1"].includes(this.windowObject.location.hostname);
  }

  importLocalDevelopmentSession() {
    if (!this.isLocalhost()) return;
    const url = new URL(this.windowObject.location.href);
    const token = url.searchParams.get(LOCAL_SESSION_PARAM);
    const systemId = url.searchParams.get(LOCAL_SYSTEM_PARAM);
    if (!token) return;
    this.setAccessToken(token);
    if (systemId) this.setActiveSystem(systemId);
    url.searchParams.delete(LOCAL_SESSION_PARAM);
    url.searchParams.delete(LOCAL_SYSTEM_PARAM);
    this.windowObject.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  getAccessToken() {
    this.importLocalDevelopmentSession();
    const token = this.storage.getItem(ACCESS_TOKEN_KEY);
    if (token) return token;
    const legacyToken = this.storage.getItem(LEGACY_ACCESS_TOKEN_KEY);
    if (!legacyToken) return "";
    this.setAccessToken(legacyToken);
    this.storage.removeItem(LEGACY_ACCESS_TOKEN_KEY);
    return legacyToken;
  }

  setAccessToken(token) {
    this.storage.setItem(ACCESS_TOKEN_KEY, String(token || ""));
  }

  setActiveSystem(systemId) {
    this.storage.setItem(ACTIVE_SYSTEM_KEY, systemId);
  }

  getActiveSystem() {
    return this.storage.getItem(ACTIVE_SYSTEM_KEY) || "";
  }

  clear() {
    this.storage.removeItem(ACCESS_TOKEN_KEY);
    this.storage.removeItem(ACTIVE_SYSTEM_KEY);
    this.storage.removeItem(LEGACY_ACCESS_TOKEN_KEY);
  }

  readUser(token) {
    try {
      const payload = String(token).split(".")[1];
      const normalized = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
      const data = JSON.parse(new TextDecoder().decode(
        Uint8Array.from(this.windowObject.atob(normalized), (character) => character.charCodeAt(0)),
      ));
      return Object.freeze({ name: data.name || "เจ้าหน้าที่เทศบาล", role: data.role || "OFFICER" });
    } catch {
      return Object.freeze({ name: "เจ้าหน้าที่เทศบาล", role: "OFFICER" });
    }
  }
}

