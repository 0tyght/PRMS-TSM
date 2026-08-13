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
import { ProposeWasteServiceUserRouteAssignmentUseCase } from "../modules/waste/application/ProposeWasteServiceUserRouteAssignmentUseCase.js";
import { ConfirmWasteServiceUserRouteAssignmentUseCase } from "../modules/waste/application/ConfirmWasteServiceUserRouteAssignmentUseCase.js";
import { MariaDbWasteRouteRepository } from "../modules/waste/infrastructure/MariaDbWasteRouteRepository.js";
import { OsrmTripRouteOptimizer } from "../modules/waste/infrastructure/OsrmTripRouteOptimizer.js";
import { RouteAssignmentService } from "../modules/waste/domain/RouteAssignmentService.js";
import { MariaDbWastePlanRepository } from "../modules/waste/infrastructure/MariaDbWastePlanRepository.js";
import { WastePlanNoticeFactory } from "../modules/waste/domain/WastePlanNoticeFactory.js";
import { PublishWasteOperationPlanUseCase } from "../modules/waste/application/PublishWasteOperationPlanUseCase.js";
import { WithdrawWasteOperationPlanUseCase } from "../modules/waste/application/WithdrawWasteOperationPlanUseCase.js";

export function createHttpApplicationServices() {
  const nativeCitizen = new NativeCitizenAdapter();
  const wasteRouteRepository = new MariaDbWasteRouteRepository({ database });
  const wasteRouteOptimizer = new OsrmTripRouteOptimizer({ baseUrl: config.routingApiBaseUrl });
  const wasteRouteAssignmentService = new RouteAssignmentService();
  const wastePlanRepository = new MariaDbWastePlanRepository({ database });
  const wastePlanNoticeFactory = new WastePlanNoticeFactory();
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
      proposeAssignment: new ProposeWasteServiceUserRouteAssignmentUseCase({ routeRepository: wasteRouteRepository, routeOptimizer: wasteRouteOptimizer, routeAssignmentService: wasteRouteAssignmentService }),
      confirmAssignment: new ConfirmWasteServiceUserRouteAssignmentUseCase({ routeRepository: wasteRouteRepository }),
    }),
    wastePlanPublication: Object.freeze({
      publish: new PublishWasteOperationPlanUseCase({ repository: wastePlanRepository, noticeFactory: wastePlanNoticeFactory }),
      withdraw: new WithdrawWasteOperationPlanUseCase({ repository: wastePlanRepository, noticeFactory: wastePlanNoticeFactory }),
      repository: wastePlanRepository,
    }),
  });
}

export function createApp(options = {}) {
  return createExpressApplication({ ...options, services: options.services || createHttpApplicationServices() });
}
