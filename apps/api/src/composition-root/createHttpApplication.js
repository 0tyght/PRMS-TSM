import { createApp as createExpressApplication } from "../app.js";
import { LineBotAdapter } from "../infrastructure/line/LineBotAdapter.js";
import { LineNotificationAdapter } from "../infrastructure/line/LineNotificationAdapter.js";
import { NativeCitizenAdapter } from "../infrastructure/line/NativeCitizenAdapter.js";
import { ReportExportAdapter } from "../infrastructure/reports/ReportExportAdapter.js";
import { MfaAdapter } from "../infrastructure/security/MfaAdapter.js";
import { CitizenSubmissionApprovalService } from "../application/submissions/CitizenSubmissionApprovalService.js";
import { database } from "../core/db.js";
import { config } from "../core/config.js";
import { ProposeWasteRouteUseCase } from "../modules/waste/application/ProposeWasteRouteUseCase.js";
import { ConfirmWasteRouteProposalUseCase } from "../modules/waste/application/ConfirmWasteRouteProposalUseCase.js";
import { MariaDbWasteRouteRepository } from "../modules/waste/infrastructure/MariaDbWasteRouteRepository.js";
import { OsrmTripRouteOptimizer } from "../modules/waste/infrastructure/OsrmTripRouteOptimizer.js";

export function createHttpApplicationServices() {
  const nativeCitizen = new NativeCitizenAdapter();
  const wasteRouteRepository = new MariaDbWasteRouteRepository({ database });
  const wasteRouteOptimizer = new OsrmTripRouteOptimizer({ baseUrl: config.routingApiBaseUrl });
  return Object.freeze({
    lineNotifications: new LineNotificationAdapter(),
    nativeCitizen,
    citizenSubmissionApproval: new CitizenSubmissionApprovalService({ nativeCitizenService: nativeCitizen }),
    lineBot: new LineBotAdapter(),
    reportExports: new ReportExportAdapter(),
    mfa: new MfaAdapter(),
    wasteRouteOptimization: Object.freeze({
      propose: new ProposeWasteRouteUseCase({ routeRepository: wasteRouteRepository, routeOptimizer: wasteRouteOptimizer }),
      confirm: new ConfirmWasteRouteProposalUseCase({ routeRepository: wasteRouteRepository }),
    }),
  });
}

export function createApp(options = {}) {
  return createExpressApplication({ ...options, services: options.services || createHttpApplicationServices() });
}
