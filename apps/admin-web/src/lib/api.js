import { demoRequest } from "./demoData.js";
import { getApiBase } from "./runtimeConfig.js";

export const IS_GITHUB_DEMO = import.meta.env.VITE_GITHUB_DEMO === "true";

export function createApi(token) {
  async function request(path, options = {}) {
    const apiBase = await getApiBase();
    if (!apiBase && IS_GITHUB_DEMO) return demoRequest(path, options);
    const url = `${apiBase}${path.replace(/^\/api/, "")}`;
    let response;
    try {
      response = await fetch(url, {
        ...options,
        headers: { "Content-Type":"application/json", ...(token ? { Authorization:`Bearer ${token}` } : {}), ...options.headers },
      });
    } catch (error) {
      if (IS_GITHUB_DEMO) return demoRequest(path, options);
      throw error;
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
