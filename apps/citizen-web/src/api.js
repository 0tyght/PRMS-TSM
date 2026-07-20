const CONFIG_URLS = [
  "https://raw.githubusercontent.com/0tyght/PRMS-TSM/main/runtime-config.json",
  new URL("runtime-config.json", `${location.origin}${import.meta.env.BASE_URL}`).href,
];

let apiBasePromise;

async function getApiBase() {
  if (["localhost", "127.0.0.1"].includes(location.hostname)) return "/api";
  if (!apiBasePromise) apiBasePromise = (async () => {
    for (const url of CONFIG_URLS) {
      try {
        const response = await fetch(`${url}?t=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) continue;
        const value = String((await response.json()).apiBaseUrl || "").replace(/\/+$/, "");
        if (value.startsWith("https://")) return value.endsWith("/api") ? value : `${value}/api`;
      } catch { /* ลองแหล่งถัดไป */ }
    }
    return "";
  })();
  return apiBasePromise;
}

export function createCitizenApi(token = "") {
  async function request(path, options = {}) {
    const base = await getApiBase();
    if (!base) throw new Error("ยังไม่พบการเชื่อมต่อ API ของเทศบาล");
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(`${base}/v1${path.startsWith('/') ? path : `/${path}`}`, {
        ...options,
        signal: controller.signal,
        cache: "no-store",
        headers: {
          Accept: "application/json",
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(options.headers || {}),
        },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "ไม่สามารถดำเนินการได้");
      return body.data ?? null;
    } catch (error) {
      if (error.name === "AbortError") throw new Error("การเชื่อมต่อใช้เวลานานเกินไป กรุณาลองใหม่");
      throw error;
    } finally {
      window.clearTimeout(timer);
    }
  }
  return {
    get: (path) => request(path),
    post: (path, data, headers = {}) => request(path, { method: "POST", body: JSON.stringify(data), headers }),
  };
}
