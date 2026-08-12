export class HashNavigation {
  constructor({ windowObject = window, defaultPage = "dashboard" } = {}) {
    this.windowObject = windowObject;
    this.defaultPage = defaultPage;
  }

  read() {
    const raw = this.windowObject.location.hash.replace(/^#\/?/, "");
    const [pathname = "", queryString = ""] = raw.split("?");
    return Object.freeze({ page: pathname || this.defaultPage, query: new URLSearchParams(queryString) });
  }

  navigate(page, query = null, { replace = false } = {}) {
    const queryString = query instanceof URLSearchParams ? query.toString() : String(query || "").replace(/^\?/, "");
    const hash = `#/${page || this.defaultPage}${queryString ? `?${queryString}` : ""}`;
    if (replace) this.windowObject.history.replaceState({}, "", hash);
    else this.windowObject.location.hash = hash;
    this.windowObject.dispatchEvent(new HashChangeEvent("hashchange"));
  }

  subscribe(listener) {
    const handler = () => listener(this.read());
    this.windowObject.addEventListener("hashchange", handler);
    return () => this.windowObject.removeEventListener("hashchange", handler);
  }
}

