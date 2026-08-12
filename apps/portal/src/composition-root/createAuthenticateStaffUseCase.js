import { ApiClient } from "@smart-thapho/web-core/api";
import { sessionStore } from "@smart-thapho/web-core/session";
import { AuthenticateStaffUseCase } from "../application/AuthenticateStaffUseCase.js";

export function createAuthenticateStaffUseCase() {
  return new AuthenticateStaffUseCase({ apiClient: new ApiClient(), session: sessionStore });
}
