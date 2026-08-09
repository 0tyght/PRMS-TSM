const ACCESS_TOKEN_KEY = "smart_thapho_access_token";
const ACTIVE_SYSTEM_KEY = "smart_thapho_active_system";
const LOCAL_SESSION_PARAM = "smart_thapho_session";
const LOCAL_SYSTEM_PARAM = "smart_thapho_system";

function isLocalhost() {
  return ["localhost", "127.0.0.1"].includes(window.location.hostname);
}

function importLocalDevelopmentSession() {
  if (!isLocalhost()) return;

  const url = new URL(window.location.href);
  const token = url.searchParams.get(LOCAL_SESSION_PARAM);
  const systemId = url.searchParams.get(LOCAL_SYSTEM_PARAM);

  if (!token) return;

  sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
  if (systemId) sessionStorage.setItem(ACTIVE_SYSTEM_KEY, systemId);

  url.searchParams.delete(LOCAL_SESSION_PARAM);
  url.searchParams.delete(LOCAL_SYSTEM_PARAM);
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

export function getAccessToken() {
  importLocalDevelopmentSession();
  const token = sessionStorage.getItem(ACCESS_TOKEN_KEY);
  if (token) return token;

  const legacyToken = sessionStorage.getItem("prms_access_token");
  if (!legacyToken) return "";

  sessionStorage.setItem(ACCESS_TOKEN_KEY, legacyToken);
  sessionStorage.removeItem("prms_access_token");
  return legacyToken;
}

export function setAccessToken(token) {
  sessionStorage.setItem(ACCESS_TOKEN_KEY, String(token || ""));
}

export function setActiveSystem(systemId) {
  sessionStorage.setItem(ACTIVE_SYSTEM_KEY, systemId);
}

export function clearSession() {
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(ACTIVE_SYSTEM_KEY);
  sessionStorage.removeItem("prms_access_token");
}

export function readSessionUser(token) {
  try {
    const payload = String(token).split(".")[1];
    const normalized = payload
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const data = JSON.parse(new TextDecoder().decode(
      Uint8Array.from(window.atob(normalized), (character) => character.charCodeAt(0)),
    ));
    return { name: data.name || "เจ้าหน้าที่เทศบาล", role: data.role || "OFFICER" };
  } catch {
    return { name: "เจ้าหน้าที่เทศบาล", role: "OFFICER" };
  }
}
