import { NavigationService } from "./NavigationService.js";
import { SessionStore } from "./SessionStore.js";

export class SystemApplicationController {
  constructor({ session = new SessionStore(), navigation = new NavigationService(), windowObject = window } = {}) {
    this.session = session;
    this.navigation = navigation;
    this.windowObject = windowObject;
  }

  getSession() {
    const token = this.session.getAccessToken();
    return Object.freeze({ token, user: this.session.readUser(token), authenticated: Boolean(token) });
  }

  redirectToLogin({ replace = true } = {}) {
    const url = this.navigation.getPortalUrl();
    if (replace) this.windowObject.location.replace(url);
    else this.windowObject.location.assign(url);
  }

  switchSystem() {
    this.windowObject.location.assign(this.navigation.getSystemPickerUrl());
  }

  logout() {
    this.session.clear();
    this.redirectToLogin({ replace: false });
  }

  subscribeToExpiration(callback = () => this.logout()) {
    const handler = () => callback();
    this.windowObject.addEventListener("smart-thapho:session-expired", handler);
    return () => this.windowObject.removeEventListener("smart-thapho:session-expired", handler);
  }
}
