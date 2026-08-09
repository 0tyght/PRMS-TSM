const SYSTEM_ROUTES = Object.freeze({
  pet: "prms-tsm",
  waste: "waste-management",
  disaster: "disaster-management",
  water: "waterworks-management",
});

const LOCAL_PORTS = Object.freeze({
  pet: 5174,
  waste: 5175,
  disaster: 5176,
  water: 5177,
});

function isLocalhost() {
  return ["localhost", "127.0.0.1"].includes(window.location.hostname);
}

export function getPortalUrl() {
  if (isLocalhost()) {
    return `${window.location.protocol}//${window.location.hostname}:5173/`;
  }

  const path = window.location.pathname;
  for (const route of Object.values(SYSTEM_ROUTES)) {
    const marker = `/${route}/`;
    const index = path.indexOf(marker);
    if (index >= 0) return `${window.location.origin}${path.slice(0, index + 1)}`;
  }

  return `${window.location.origin}${path.endsWith("/") ? path : `${path}/`}`;
}

export function getSystemUrl(systemId) {
  const route = SYSTEM_ROUTES[systemId];
  if (!route) return getPortalUrl();

  if (isLocalhost()) {
    return `${window.location.protocol}//${window.location.hostname}:${LOCAL_PORTS[systemId]}/`;
  }

  return new URL(`${route}/`, getPortalUrl()).href;
}

export function openSystemApplication(systemId, token = "") {
  const targetUrl = getSystemUrl(systemId);

  if (!isLocalhost() || !token) {
    window.location.assign(targetUrl);
    return;
  }

  const target = new URL(targetUrl);
  target.searchParams.set("smart_thapho_session", token);
  target.searchParams.set("smart_thapho_system", systemId);
  window.location.assign(target.href);
}
