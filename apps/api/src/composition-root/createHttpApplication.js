import { createApp as createExpressApplication } from "../app.js";
import { LineBotAdapter } from "../infrastructure/line/LineBotAdapter.js";
import { LineNotificationAdapter } from "../infrastructure/line/LineNotificationAdapter.js";
import { NativeCitizenAdapter } from "../infrastructure/line/NativeCitizenAdapter.js";
import { ReportExportAdapter } from "../infrastructure/reports/ReportExportAdapter.js";
import { MfaAdapter } from "../infrastructure/security/MfaAdapter.js";
import { CitizenSubmissionApprovalService } from "../application/submissions/CitizenSubmissionApprovalService.js";
import { database } from "../core/db.js";
import { config } from "../core/config.js";
import { createWasteManagementServices } from "./createWasteManagementServices.js";
import { WasteHttpModule } from "../modules/waste/waste.router.js";

export function createHttpApplicationServices() {
  const nativeCitizen =
    new NativeCitizenAdapter();

  const wasteManagement =
    createWasteManagementServices({
      database,
      config,
    });

  const wasteHttpModule =
    new WasteHttpModule({
      services:
        wasteManagement,
    });

  return Object.freeze({
    lineNotifications:
      new LineNotificationAdapter(),

    nativeCitizen,

    citizenSubmissionApproval:
      new CitizenSubmissionApprovalService({
        nativeCitizenService:
          nativeCitizen,
      }),

    lineBot:
      new LineBotAdapter(),

    reportExports:
      new ReportExportAdapter(),

    mfa:
      new MfaAdapter(),

    wasteManagement,
    wasteHttpModule,
  });
}

export function createApp(
  options = {},
) {
  return createExpressApplication({
    ...options,

    services:
      options.services ||
      createHttpApplicationServices(),
  });
}
