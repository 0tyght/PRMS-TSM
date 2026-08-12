import { SystemApplicationController } from "@smart-thapho/web-core/application";

export class WasteApplicationController extends SystemApplicationController {
  constructor({ pageIds, ...dependencies }) {
    super(dependencies);
    this.pageIds = new Set(pageIds);
  }

  resolvePage(requestedPage) {
    return this.pageIds.has(requestedPage) ? requestedPage : "dashboard";
  }

  createViewModel(requestedPage) {
    return Object.freeze({ ...this.getSession(), page: this.resolvePage(requestedPage) });
  }
}

