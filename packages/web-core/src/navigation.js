import { NavigationService } from "./application/NavigationService.js";

export { NavigationService };
export const navigationService = new NavigationService();

export function getPortalUrl() {
  return navigationService.getPortalUrl();
}

export function getSystemUrl(systemId) {
  return navigationService.getSystemUrl(systemId);
}

export function getSystemPickerUrl() {
  return navigationService.getSystemPickerUrl();
}

export function openSystemApplication(systemId, token = "", { replace = false } = {}) {
  return navigationService.openSystemApplication(systemId, token, { replace });
}
