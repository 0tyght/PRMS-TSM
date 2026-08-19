import { MariaDbAuditLogRepository } from "../infrastructure/audit/MariaDbAuditLogRepository.js";

import { RouteAssignmentService } from "../modules/waste/domain/RouteAssignmentService.js";
import { WasteRouteLifecycleService } from "../modules/waste/domain/WasteRouteLifecycleService.js";
import { WastePlanResourcePolicy } from "../modules/waste/domain/WastePlanResourcePolicy.js";
import { WasteTrackingPolicy } from "../modules/waste/domain/WasteTrackingPolicy.js";
import { WastePlanExecutionPolicy } from "../modules/waste/domain/WastePlanExecutionPolicy.js";
import { WasteChargeNoticeFactory } from "../modules/waste/domain/WasteChargeNoticeFactory.js";
import { WasteRoutePreviewPolicy } from "../modules/waste/domain/WasteRoutePreviewPolicy.js";
import { WastePlanNoticeFactory } from "../modules/waste/domain/WastePlanNoticeFactory.js";

import { WastePlanNumberService } from "../modules/waste/application/WastePlanNumberService.js";
import { WasteTrackingTokenService } from "../modules/waste/application/WasteTrackingTokenService.js";
import { WastePlanResourceService } from "../modules/waste/application/WastePlanResourceService.js";
import { WasteVehicleService } from "../modules/waste/application/WasteVehicleService.js";
import { WasteDriverService } from "../modules/waste/application/WasteDriverService.js";
import { WasteRouteService } from "../modules/waste/application/WasteRouteService.js";
import { WasteServiceUserService } from "../modules/waste/application/WasteServiceUserService.js";
import { WasteTrackingService } from "../modules/waste/application/WasteTrackingService.js";
import { WasteIncidentService } from "../modules/waste/application/WasteIncidentService.js";
import { AssignWasteIncidentReplacementUseCase } from "../modules/waste/application/AssignWasteIncidentReplacementUseCase.js";
import { WastePlanService } from "../modules/waste/application/WastePlanService.js";
import { WastePlanStatusService } from "../modules/waste/application/WastePlanStatusService.js";
import { WasteDashboardQueryService } from "../modules/waste/application/WasteDashboardQueryService.js";
import { WasteBillingService } from "../modules/waste/application/WasteBillingService.js";
import { WasteReportQueryService } from "../modules/waste/application/WasteReportQueryService.js";
import { WasteRoutePreviewService } from "../modules/waste/application/WasteRoutePreviewService.js";
import { ProposeWasteRouteUseCase } from "../modules/waste/application/ProposeWasteRouteUseCase.js";
import { ConfirmWasteRouteProposalUseCase } from "../modules/waste/application/ConfirmWasteRouteProposalUseCase.js";
import { ProposeWasteServiceUserRouteAssignmentUseCase } from "../modules/waste/application/ProposeWasteServiceUserRouteAssignmentUseCase.js";
import { ConfirmWasteServiceUserRouteAssignmentUseCase } from "../modules/waste/application/ConfirmWasteServiceUserRouteAssignmentUseCase.js";
import { ProposeWasteRouteServiceUsersUseCase } from "../modules/waste/application/ProposeWasteRouteServiceUsersUseCase.js";
import { ConfirmWasteRouteServiceUsersUseCase } from "../modules/waste/application/ConfirmWasteRouteServiceUsersUseCase.js";
import { PublishWasteOperationPlanUseCase } from "../modules/waste/application/PublishWasteOperationPlanUseCase.js";
import { WithdrawWasteOperationPlanUseCase } from "../modules/waste/application/WithdrawWasteOperationPlanUseCase.js";
import { WastePlanPublicationService } from "../modules/waste/application/WastePlanPublicationService.js";

import { MariaDbWastePlanResourceRepository } from "../modules/waste/infrastructure/MariaDbWastePlanResourceRepository.js";
import { MariaDbWasteVehicleRepository } from "../modules/waste/infrastructure/MariaDbWasteVehicleRepository.js";
import { MariaDbWasteDriverRepository } from "../modules/waste/infrastructure/MariaDbWasteDriverRepository.js";
import { MariaDbWasteRouteAdminRepository } from "../modules/waste/infrastructure/MariaDbWasteRouteAdminRepository.js";
import { MariaDbWasteServiceUserRepository } from "../modules/waste/infrastructure/MariaDbWasteServiceUserRepository.js";
import { MariaDbWasteTrackingRepository } from "../modules/waste/infrastructure/MariaDbWasteTrackingRepository.js";
import { MariaDbWasteIncidentRepository } from "../modules/waste/infrastructure/MariaDbWasteIncidentRepository.js";
import { MariaDbWastePlanAdminRepository } from "../modules/waste/infrastructure/MariaDbWastePlanAdminRepository.js";
import { MariaDbWasteDashboardRepository } from "../modules/waste/infrastructure/MariaDbWasteDashboardRepository.js";
import { MariaDbWasteBillingRepository } from "../modules/waste/infrastructure/MariaDbWasteBillingRepository.js";
import { MariaDbWasteReportRepository } from "../modules/waste/infrastructure/MariaDbWasteReportRepository.js";
import { OsrmRoutePreviewProvider } from "../modules/waste/infrastructure/OsrmRoutePreviewProvider.js";
import { MariaDbWasteRouteRepository } from "../modules/waste/infrastructure/MariaDbWasteRouteRepository.js";
import { OsrmTripRouteOptimizer } from "../modules/waste/infrastructure/OsrmTripRouteOptimizer.js";
import { MariaDbWastePlanRepository } from "../modules/waste/infrastructure/MariaDbWastePlanRepository.js";

export function createWasteManagementServices({
  database,
  config,
}) {
  if (!database) {
    throw new TypeError(
      "createWasteManagementServices requires database",
    );
  }

  if (!config) {
    throw new TypeError(
      "createWasteManagementServices requires config",
    );
  }

  const auditLogRepository =
    new MariaDbAuditLogRepository({
      database,
    });

  const routeAssignmentService =
    new RouteAssignmentService();

  const routeLifecycleService =
    new WasteRouteLifecycleService();

  const planNumberService =
    new WastePlanNumberService();

  const trackingTokenService =
    new WasteTrackingTokenService({
      secret:
        config.jwtSecret,
    });

  const wastePlanResourcePolicy =
    new WastePlanResourcePolicy();

  const createPlanResourceService =
    (transactionDatabase) =>
      new WastePlanResourceService({
        repository:
          new MariaDbWastePlanResourceRepository({
            database:
              transactionDatabase,
          }),
        policy:
          wastePlanResourcePolicy,
        routeLifecycleService,
      });

  const wastePlanResourceService =
    createPlanResourceService(
      database,
    );

  const wasteVehicleService =
    new WasteVehicleService({
      repository:
        new MariaDbWasteVehicleRepository({
          database,
        }),
      auditLog:
        auditLogRepository,
    });

  const wasteDriverService =
    new WasteDriverService({
      repository:
        new MariaDbWasteDriverRepository({
          database,
        }),
      auditLog:
        auditLogRepository,
    });

  const wasteRouteService =
    new WasteRouteService({
      repository:
        new MariaDbWasteRouteAdminRepository({
          database,
        }),
      auditLog:
        auditLogRepository,
    });

  const wasteServiceUserService =
    new WasteServiceUserService({
      repository:
        new MariaDbWasteServiceUserRepository({
          database,
        }),
      auditLog:
        auditLogRepository,
      routeLifecycleService,
      routeAssignmentService,
    });

  const wasteTrackingService =
    new WasteTrackingService({
      repository:
        new MariaDbWasteTrackingRepository({
          database,
        }),
      policy:
        new WasteTrackingPolicy(),
    });

  const wastePlanAdminRepository =
    new MariaDbWastePlanAdminRepository({
      database,
    });

  const wasteIncidentRepository =
    new MariaDbWasteIncidentRepository({
      database,
    });

  const wasteIncidentService =
    new WasteIncidentService({
      repository:
        wasteIncidentRepository,
      auditLog:
        auditLogRepository,
    });

  const wasteIncidentReplacementUseCase =
    new AssignWasteIncidentReplacementUseCase({
      incidentRepository:
        wasteIncidentRepository,
      planRepository:
        wastePlanAdminRepository,
      executionPolicy:
        new WastePlanExecutionPolicy(),
      auditLog:
        auditLogRepository,
    });

  const wastePlanService =
    new WastePlanService({
      repository:
        wastePlanAdminRepository,
      auditLog:
        auditLogRepository,
      planNumberService,
      resourceServiceFactory:
        createPlanResourceService,
    });

  const wastePlanStatusService =
    new WastePlanStatusService({
      repository:
        wastePlanAdminRepository,
      policy:
        new WastePlanExecutionPolicy(),
      auditLog:
        auditLogRepository,
    });

  const wasteDashboardQueryService =
    new WasteDashboardQueryService({
      repository:
        new MariaDbWasteDashboardRepository({
          database,
        }),
    });

  const wasteBillingService =
    new WasteBillingService({
      repository:
        new MariaDbWasteBillingRepository({
          database,
        }),
      auditLog:
        auditLogRepository,
      noticeFactory:
        new WasteChargeNoticeFactory(),
    });

  const wasteReportQueryService =
    new WasteReportQueryService({
      repository:
        new MariaDbWasteReportRepository({
          database,
        }),
    });


  const wasteRoutePreviewService =
    new WasteRoutePreviewService({
      policy:
        new WasteRoutePreviewPolicy(),
      provider:
        new OsrmRoutePreviewProvider({
          baseUrl:
            config.routingApiBaseUrl,
        }),
    });

  const wasteRouteRepository =
    new MariaDbWasteRouteRepository({
      database,
    });

  const wasteRouteOptimizer =
    new OsrmTripRouteOptimizer({
      baseUrl:
        config.routingApiBaseUrl,
    });

  const wasteRouteOptimization =
    Object.freeze({
      propose:
        new ProposeWasteRouteUseCase({
          routeRepository:
            wasteRouteRepository,
          routeOptimizer:
            wasteRouteOptimizer,
        }),

      confirm:
        new ConfirmWasteRouteProposalUseCase({
          routeRepository:
            wasteRouteRepository,
        }),

      proposeAssignment:
        new ProposeWasteServiceUserRouteAssignmentUseCase({
          routeRepository:
            wasteRouteRepository,
          routeOptimizer:
            wasteRouteOptimizer,
          routeAssignmentService,
        }),

      confirmAssignment:
        new ConfirmWasteServiceUserRouteAssignmentUseCase({
          routeRepository:
            wasteRouteRepository,
        }),

      proposeServiceUsers:
        new ProposeWasteRouteServiceUsersUseCase({
          routeRepository: wasteRouteRepository,
          routeOptimizer: wasteRouteOptimizer,
        }),

      confirmServiceUsers:
        new ConfirmWasteRouteServiceUsersUseCase({
          routeRepository: wasteRouteRepository,
        }),
    });

  const wastePlanRepository =
    new MariaDbWastePlanRepository({
      database,
    });

  const wastePlanNoticeFactory =
    new WastePlanNoticeFactory();

  const publishWastePlan =
    new PublishWasteOperationPlanUseCase({
      repository:
        wastePlanRepository,
      noticeFactory:
        wastePlanNoticeFactory,
    });

  const withdrawWastePlan =
    new WithdrawWasteOperationPlanUseCase({
      repository:
        wastePlanRepository,
      noticeFactory:
        wastePlanNoticeFactory,
    });

  const wastePlanPublicationService =
    new WastePlanPublicationService({
      publishUseCase:
        publishWastePlan,
      withdrawUseCase:
        withdrawWastePlan,
      repository:
        wastePlanRepository,
      auditLog:
        auditLogRepository,
    });

  return Object.freeze({
    trackingTokenService,
    wastePlanResourceService,
    wasteVehicleService,
    wasteDriverService,
    wasteRouteService,
    wasteServiceUserService,
    wasteTrackingService,
    wasteIncidentService,
    wasteIncidentReplacementUseCase,
    wastePlanService,
    wastePlanStatusService,
    wasteDashboardQueryService,
    wasteBillingService,
    wasteReportQueryService,
    wasteRoutePreviewService,
    wasteRouteOptimization,
    wastePlanPublicationService,
  });
}
