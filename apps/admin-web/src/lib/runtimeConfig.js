const CONFIG_URLS = [
  "https://raw.githubusercontent.com/0tyght/PRMS-TSM/main/runtime-config.json",
  new URL("runtime-config.json", `${location.origin}${import.meta.env.BASE_URL}`).href,
];

let pending;

function normalize(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) return "";
    return url.href.replace(/\/$/, "").replace(/\/api$/, "") + "/api";
  } catch { return ""; }
}

export async function getApiBase(force = false) {
  if (["localhost", "127.0.0.1"].includes(location.hostname)) return "/api";
  if (force) pending = undefined;
  if (!pending) pending = (async () => {
    for (const configUrl of CONFIG_URLS) {
      try {
        const response = await fetch(`${configUrl}?t=${Date.now()}`, { cache:"no-store" });
        if (!response.ok) continue;
        const apiBase = normalize((await response.json()).apiBaseUrl);
        if (apiBase) return apiBase;
      } catch { /* try the next config source */ }
    }
    return "";
  })();
  return pending;
}
