import crypto from "node:crypto";
import { DomainRuleViolation } from "../../../domain/common/errors/DomainRuleViolation.js";
import { WasteOperationPlan } from "../../../domain/waste/entities/WasteOperationPlan.js";

export class WastePlanService {
  constructor({
    repository,
    auditLog,
    planNumberService,
    resourceServiceFactory,
    idFactory =
      () => crypto.randomUUID(),
  }) {
    if (!repository) {
      throw new TypeError(
        "WastePlanService requires repository",
      );
    }

    if (!auditLog) {
      throw new TypeError(
        "WastePlanService requires auditLog",
      );
    }

    if (!planNumberService) {
      throw new TypeError(
        "WastePlanService requires planNumberService",
      );
    }

    if (
      typeof resourceServiceFactory !==
      "function"
    ) {
      throw new TypeError(
        "WastePlanService requires resourceServiceFactory",
      );
    }

    if (
      typeof idFactory !==
      "function"
    ) {
      throw new TypeError(
        "WastePlanService requires idFactory",
      );
    }

    this.repository =
      repository;
    this.auditLog =
      auditLog;
    this.planNumberService =
      planNumberService;
    this.resourceServiceFactory =
      resourceServiceFactory;
    this.idFactory =
      idFactory;
  }

  async list({
    date = null,
  } = {}) {
    return this.repository.list({
      date,
    });
  }

  async create(
    input,
    actor,
  ) {
    const id =
      this.idFactory();

    let created;

    await this.repository.transaction(
      async (db) => {
        const resourceService =
          this.resourceServiceFactory(
            db,
          );

        await resourceService
          .assertAssignment(
            input,
          );

        const planNo =
          input.planNo ||
          await this.planNumberService
            .next(
              db,
              input.scheduledDate,
            );

        await this.repository.create(
          db,
          {
            id,
            ...input,
            planNo,
            createdBy:
              actor.userId,
          },
        );

        created = {
          ...input,
          planNo,
        };
      },
    );

    await this.auditLog.record({
      userId: actor.userId,
      action:
        "CREATE_WASTE_PLAN",
      entityType:
        "WASTE_PLAN",
      entityId: id,
      nextValue:
        created,
      ipAddress:
        actor.ipAddress,
    });

    return {
      id,
      ...created,
      status: "SCHEDULED",
    };
  }

  async update(
    id,
    input,
    actor,
  ) {
    await this.repository.transaction(
      async (db) => {
        const current =
          await this.repository
            .findEditableContext(
              db,
              id,
              {
                lock: true,
              },
            );

        if (!current) {
          throw new DomainRuleViolation(
            "WASTE_PLAN_NOT_FOUND",
            "ไม่พบแผนปฏิบัติงานเก็บขยะ",
            { status: 404 },
          );
        }

        new WasteOperationPlan({
          id,
          status:
            current.status,
          publicationStatus:
            current.publicationStatus,
          publicationVersion:
            current.publicationVersion,
          vehicleId:
            current.vehicleId,
        }).assertEditable();

        const merged = {
          scheduledDate:
            input.scheduledDate ??
            current.scheduledDate,

          routeId:
            input.routeId ??
            current.routeId,

          vehicleId:
            input.vehicleId ??
            current.vehicleId,

          driverId:
            input.driverId ??
            current.driverId,

          scheduledStartAt:
            input.scheduledStartAt ===
            undefined
              ? current.scheduledStartAt
              : input.scheduledStartAt,

          scheduledEndAt:
            input.scheduledEndAt ===
            undefined
              ? current.scheduledEndAt
              : input.scheduledEndAt,
        };

        const resourceService =
          this.resourceServiceFactory(
            db,
          );

        await resourceService
          .assertAssignment(
            merged,
            {
              excludePlanId: id,
            },
          );

        await this.repository.update(
          db,
          id,
          input,
        );
      },
    );

    await this.auditLog.record({
      userId: actor.userId,
      action:
        "UPDATE_WASTE_PLAN",
      entityType:
        "WASTE_PLAN",
      entityId: id,
      nextValue:
        input,
      ipAddress:
        actor.ipAddress,
    });

    return {
      id,
      ...input,
    };
  }
}
