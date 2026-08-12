import { navigationService } from "@smart-thapho/web-core/navigation";
import { sessionStore } from "@smart-thapho/web-core/session";
import { PortalController } from "../application/PortalController.js";

export function createPortalController() {
  return new PortalController({ session: sessionStore, navigation: navigationService });
}
