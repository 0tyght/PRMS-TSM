import { ApiClient } from "@smart-thapho/web-core/api";
import { PrmsApplicationFacade } from "../application/PrmsApplicationFacade.js";

export function createPrmsApplication(token) {
  return new PrmsApplicationFacade({ apiClient: new ApiClient({ token }) });
}
