import { SystemApplicationController } from "@smart-thapho/web-core/application";
import { ADMIN_MENU, DEFAULT_PAGE, isAdminPage } from "../config/navigation.js";

export class PrmsApplicationController extends SystemApplicationController {
  resolvePage(requestedPage, user) {
    const validPage = isAdminPage(requestedPage) ? requestedPage : DEFAULT_PAGE;
    return validPage === "settings" && user?.role !== "ADMIN" ? DEFAULT_PAGE : validPage;
  }

  createViewModel(requestedPage) {
    const session = this.getSession();
    const page = this.resolvePage(requestedPage, session.user);
    const title = ADMIN_MENU.find((item) => item.id === page)?.label || "ภาพรวม";
    return Object.freeze({ ...session, page, title });
  }
}

