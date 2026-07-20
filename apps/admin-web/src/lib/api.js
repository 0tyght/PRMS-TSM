import { getApiBase } from "./runtimeConfig.js";

const REQUEST_TIMEOUT_MS = 12000;

function normalizeApiPath(path) {
  const value = String(path ?? "").trim();

  if (!value || value === "/api") {
    return "";
  }

  if (value.startsWith("/api/")) {
    return `/v1${value.slice(4)}`;
  }

  if (value.startsWith("/")) {
    return value;
  }

  return `/${value}`;
}

function createConnectionError(error) {
  if (error?.name === "AbortError") {
    return new Error(
      "การเชื่อมต่อเซิร์ฟเวอร์ใช้เวลานานเกินไป กรุณาตรวจสอบว่า API และ Cloudflare Tunnel เปิดอยู่"
    );
  }

  return new Error(
    "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ฐานข้อมูลได้ กรุณาตรวจสอบ XAMPP, API และ Cloudflare Tunnel"
  );
}

async function parseResponseBody(response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(text);
    } catch {
      return {};
    }
  }

  return {};
}

export function createApi(token) {
  async function fetchOnce(apiBase, path, options = {}) {
    const controller = new AbortController();

    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    const headers = new Headers(options.headers || {});

    headers.set("Accept", "application/json");

    if (
      options.body !== undefined &&
      options.body !== null &&
      !headers.has("Content-Type")
    ) {
      headers.set("Content-Type", "application/json");
    }

    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    try {
      return await fetch(`${apiBase}${normalizeApiPath(path)}`, {
        ...options,
        headers,
        signal: controller.signal,
        cache: "no-store",
      });
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  async function resolveApiBase(forceRefresh = false) {
    const apiBase = await getApiBase(forceRefresh);

    if (!apiBase) {
      throw new Error(
        "ไม่พบลิงก์ API ล่าสุด กรุณาเปิดเซิร์ฟเวอร์ด้วย scripts/start-public.ps1"
      );
    }

    return apiBase.replace(/\/+$/, "");
  }

  async function request(path, options = {}, unwrap = true) {
    let apiBase;

    try {
      apiBase = await resolveApiBase(false);
    } catch {
      apiBase = await resolveApiBase(true);
    }

    let response;

    try {
      response = await fetchOnce(apiBase, path, options);
    } catch (firstError) {
      try {
        apiBase = await resolveApiBase(true);
        response = await fetchOnce(apiBase, path, options);
      } catch (retryError) {
        throw createConnectionError(retryError || firstError);
      }
    }

    /*
     * หาก Cloudflare URL เดิมหมดอายุหรือเซิร์ฟเวอร์ตอบ 5xx
     * ให้โหลด runtime-config.json ใหม่แล้วลองอีกครั้ง
     */
    if (response.status >= 500) {
      try {
        const refreshedApiBase = await resolveApiBase(true);

        if (refreshedApiBase !== apiBase) {
          apiBase = refreshedApiBase;
          response = await fetchOnce(apiBase, path, options);
        }
      } catch {
        // ใช้ response เดิมและจัดการข้อความผิดพลาดด้านล่าง
      }
    }

    const body = await parseResponseBody(response);

    if (!response.ok) {
      if (response.status === 401) {
        window.dispatchEvent(new CustomEvent("prms:session-expired"));
        throw new Error(
          body.message ||
            "อีเมลหรือรหัสผ่านไม่ถูกต้อง หรือเซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่"
        );
      }

      if (response.status === 403) {
        throw new Error(
          body.message || "บัญชีนี้ไม่มีสิทธิ์ดำเนินการในส่วนนี้"
        );
      }

      if (response.status === 404) {
        throw new Error(
          body.message || "ไม่พบข้อมูลหรือบริการที่ร้องขอ"
        );
      }

      if (response.status >= 500) {
        throw new Error(
          body.message ||
            `เซิร์ฟเวอร์ API หรือฐานข้อมูลไม่พร้อมใช้งาน (${response.status})`
        );
      }

      throw new Error(
        body.message || `ไม่สามารถดำเนินการได้ (${response.status})`
      );
    }

    return unwrap ? (body.data ?? null) : body;
  }

  function createJsonOptions(method, data) {
    return {
      method,
      body: data === undefined ? undefined : JSON.stringify(data),
    };
  }

  return {
    get(path) {
      return request(path);
    },

    getPage(path) {
      return request(path, {}, false);
    },

    post(path, data) {
      return request(path, createJsonOptions("POST", data));
    },

    patch(path, data) {
      return request(path, createJsonOptions("PATCH", data));
    },

    put(path, data) {
      return request(path, createJsonOptions("PUT", data));
    },

    delete(path, data) {
      return request(path, createJsonOptions("DELETE", data));
    },

    async download(path, fallbackFileName) {
      const apiBase = await resolveApiBase(false);
      const response = await fetchOnce(apiBase, path);
      if (!response.ok) {
        const body = await parseResponseBody(response);
        throw new Error(body.message || "ไม่สามารถส่งออกรายงานได้");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const matched = disposition.match(/filename="?([^";]+)"?/i);
      const anchor = document.createElement("a");
      anchor.href = URL.createObjectURL(blob);
      anchor.download = matched?.[1] || fallbackFileName;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
    },
  };
}
