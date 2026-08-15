import { DomainRuleViolation } from "../../../domain/common/errors/DomainRuleViolation.js";
import { WasteOperationPlan } from "../../../domain/waste/entities/WasteOperationPlan.js";

export class WastePlanStatusService {
  constructor({
    repository,
    policy,
    auditLog,
  }) {
    if (!repository) {
      throw new TypeError(
        "WastePlanStatusService requires repository",
      );
    }

    if (!policy) {
      throw new TypeError(
        "WastePlanStatusService requires policy",
      );
    }

    if (!auditLog) {
      throw new TypeError(
        "WastePlanStatusService requires auditLog",
      );
    }

    this.repository =
      repository;

    this.policy =
      policy;

    this.auditLog =
      auditLog;
  }

  async updateStatus(
    id,
    input,
    actor,
  ) {
    await this.repository.transaction(
      async (db) => {
        const current =
          await this.repository
            .findExecutionContext(
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

        const previousStatus =
          current.status;

        const plan =
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
          });

        plan.transitionTo(
          input.status,
        );

        if (
          input.status ===
          "IN_PROGRESS"
        ) {
          const vehicle =
            await this.repository
              .findVehicleState(
                db,
                current.vehicleId,
              );

          const driver =
            await this.repository
              .findDriverState(
                db,
                current.driverId,
              );

          const conflict =
            await this.repository
              .findActiveResourceConflict(
                db,
                {
                  planId: id,
                  vehicleId:
                    current.vehicleId,
                  driverId:
                    current.driverId,
                },
              );

          this.policy
            .assertVehicleReady(
              vehicle,
              {
                resuming:
                  previousStatus ===
                  "INTERRUPTED",
              },
            )
            .assertDriverReady(
              driver,
            )
            .assertNoActiveConflict(
              conflict,
            );
        }

        await this.repository
          .updateStatus(
            db,
            {
              id,
              status:
                input.status,
              note:
                input.note,
            },
          );

        if (
          input.status ===
          "IN_PROGRESS"
        ) {
          await this.repository
            .markVehicleInService(
              db,
              current.vehicleId,
            );
        }

        if (
          [
            "COMPLETED",
            "CANCELLED",
          ].includes(
            input.status,
          )
        ) {
          await this.repository
            .releaseVehicle(
              db,
              current.vehicleId,
            );
        }


        if (
          current.publicationStatus === "PUBLISHED" &&
          ["IN_PROGRESS", "COMPLETED"].includes(input.status) &&
          typeof this.repository.enqueueCollectionStatusNotices === "function"
        ) {
          await this.repository.enqueueCollectionStatusNotices(db, {
            plan: current,
            status: input.status,
          });
        }
      },
    );

    await this.auditLog.record({
      userId:
        actor.userId,
      action:
        "UPDATE_WASTE_PLAN_STATUS",
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
