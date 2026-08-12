import { ApiClient } from "@smart-thapho/web-core/api";
import { WasteApplicationFacade } from "../application/WasteApplicationFacade.js";

export function createWasteApplication(token) {
  return new WasteApplicationFacade({ apiClient: new ApiClient({ token }) });
}
