import { demoRequest } from "./demoData.js";
import { getApiBase } from "./runtimeConfig.js";

export const IS_GITHUB_DEMO = import.meta.env.VITE_GITHUB_DEMO === "true";

export function createApi(token) {
  async function request(path, options = {}) {
    async function fetchOnce(apiBase) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try { return await fetch(`${apiBase}${path.replace(/^\/api/, "")}`, {
        ...options,
        signal: controller.signal,
        headers: { "Content-Type":"application/json", ...(token ? { Authorization:`Bearer ${token}` } : {}), ...options.headers },
      }); } finally { clearTimeout(timeout); }
    }
    let apiBase = await getApiBase();
    if (!apiBase && IS_GITHUB_DEMO) return demoRequest(path, options);
    let response;
    try {
      response = await fetchOnce(apiBase);
      if (response.status >= 500) throw new Error(`API ${response.status}`);
    } catch (firstError) {
      try {
        apiBase = await getApiBase(true);
        if (!apiBase) throw firstError;
        response = await fetchOnce(apiBase);
        if (response.status >= 500) throw new Error(`API ${response.status}`);
      } catch (retryError) {
        if (IS_GITHUB_DEMO) return demoRequest(path, options);
        throw retryError;
      }
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || "ไม่สามารถเชื่อมต่อระบบได้");
    return body.data;
  }
  return {
    get: path => request(path),
    patch: (path, data) => request(path, { method:"PATCH", body:JSON.stringify(data) }),
    post: (path, data) => request(path, { method:"POST", body:JSON.stringify(data) }),
  };
}
