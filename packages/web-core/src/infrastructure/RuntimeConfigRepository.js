const DEFAULT_CONFIG_SOURCES = Object.freeze([
  () => new URL("runtime-config.json", `${location.origin}${import.meta.env.BASE_URL}`).href,
  () => "https://raw.githubusercontent.com/0tyght/PRMS-TSM/main/runtime-config.json",
]);

export class RuntimeConfigRepository {
  constructor({ fetchImplementation = fetch, sources = DEFAULT_CONFIG_SOURCES, locationObject = location } = {}) {
    this.fetchImplementation = fetchImplementation;
    this.sources = sources;
    this.locationObject = locationObject;
    this.pending = undefined;
  }

  normalizeApiBase(value) {
    if (!value) return "";
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) return "";
      return `${url.href.replace(/\/$/, "").replace(/\/api$/, "")}/api`;
    } catch {
      return "";
    }
  }

  async getApiBase(forceRefresh = false) {
    if (["localhost", "127.0.0.1"].includes(this.locationObject.hostname)) return "/api";
    if (forceRefresh) this.pending = undefined;
    if (!this.pending) this.pending = this.#load();
    return this.pending;
  }

  async #load() {
    for (const source of this.sources) {
      try {
        const response = await this.fetchImplementation(source(), { cache: "no-store" });
        if (!response.ok) continue;
        const apiBase = this.normalizeApiBase((await response.json()).apiBaseUrl);
        if (apiBase) return apiBase;
      } catch {
        // Continue with the next configured source.
      }
    }
    return "";
  }
}

