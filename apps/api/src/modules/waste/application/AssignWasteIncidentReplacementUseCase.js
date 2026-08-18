import { DomainRuleViolation } from "../../../domain/common/errors/DomainRuleViolation.js";
import { WasteIncident } from "../domain/WasteIncident.js";

function replacementVehicleStatus(incidentType) {
  return [
    "VEHICLE_BREAKDOWN",
    "ACCIDENT",
  ].includes(incidentType)
    ? "MAINTENANCE"
    : "AVAILABLE";
}

export class AssignWasteIncidentReplacementUseCase {
  constructor({
    incidentRepository,
    planRepository,
    executionPolicy,
    auditLog,
  }) {
    if (!incidentRepository) {
      throw new TypeError(
        "AssignWasteIncidentReplacementUseCase requires incidentRepository",
      );
    }

    if (!planRepository) {
      throw new TypeError(
        "AssignWasteIncidentReplacementUseCase requires planRepository",
      );
    }

    if (!executionPolicy) {
      throw new TypeError(
        "AssignWasteIncidentReplacementUseCase requires executionPolicy",
      );
    }

    if (!auditLog) {
      throw new TypeError(
        "AssignWasteIncidentReplacementUseCase requires auditLog",
      );
    }

    this.incidentRepository =
      incidentRepository;
    this.planRepository =
      planRepository;
    this.executionPolicy =
      executionPolicy;
    this.auditLog = auditLog;
  }

  async execute(
    incidentId,
    {
      replacementVehicleId = null,
      replacementDriverId = null,
      resumePlan = true,
      resolutionNote = null,
    },
    actor,
  ) {
    const saved = await this.planRepository.transaction(
      async (database) => {
        const current = await this.incidentRepository.findById(
          incidentId,
          { database, lock: true },
        );

        if (!current) {
          throw new DomainRuleViolation(
            "WASTE_INCIDENT_NOT_FOUND",
            "ไม่พบเหตุระหว่างการปฏิบัติงานเก็บขยะ",
            { status: 404 },
          );
        }

        const incident = new WasteIncident(current).assignReplacement({
          replacementVehicleId,
          replacementDriverId,
          resolutionNote,
        });

        if (!current.planId) {
          throw new DomainRuleViolation(
            "WASTE_INCIDENT_PLAN_REQUIRED",
            "เหตุนี้ไม่ได้ผูกกับแผนปฏิบัติงานเก็บขยะ จึงยังมอบหมายทรัพยากรทดแทนเพื่อให้แผนเดินต่อไม่ได้",
            { status: 422 },
          );
        }

        const plan = await this.planRepository.findExecutionContext(
          database,
          current.planId,
          { lock: true },
        );

        if (!plan) {
          throw new DomainRuleViolation(
            "WASTE_PLAN_NOT_FOUND",
            "ไม่พบแผนปฏิบัติงานเก็บขยะที่เกี่ยวข้องกับเหตุนี้",
            { status: 404 },
          );
        }

        if (![
          "IN_PROGRESS",
          "INTERRUPTED",
        ].includes(plan.status)) {
          throw new DomainRuleViolation(
            "WASTE_INCIDENT_PLAN_NOT_ACTIVE",
            "มอบหมายทรัพยากรทดแทนได้เฉพาะแผนปฏิบัติงานเก็บขยะที่กำลังปฏิบัติงานหรือหยุดชะงัก",
            { status: 409 },
          );
        }

        const nextVehicleId =
          replacementVehicleId ||
          plan.vehicleId;
        const nextDriverId =
          replacementDriverId ||
          plan.driverId;

        if (resumePlan) {
          const vehicle = await this.planRepository.findVehicleState(
            database,
            nextVehicleId,
          );
          const driver = await this.planRepository.findDriverState(
            database,
            nextDriverId,
          );
          const conflict = await this.planRepository.findActiveResourceConflict(
            database,
            {
              planId: plan.id,
              vehicleId: nextVehicleId,
              driverId: nextDriverId,
            },
          );

          this.executionPolicy
            .assertVehicleReady(vehicle, {
              resuming:
                nextVehicleId ===
                plan.vehicleId,
            })
            .assertDriverReady(driver)
            .assertNoActiveConflict(conflict);
        }

        await this.planRepository.replaceExecutionResources(
          database,
          {
            id: plan.id,
            vehicleId: nextVehicleId,
            driverId: nextDriverId,
            resumePlan,
          },
        );

        if (
          replacementVehicleId &&
          replacementVehicleId !==
            plan.vehicleId
        ) {
          await this.planRepository.setVehicleStatus(
            database,
            plan.vehicleId,
            replacementVehicleStatus(
              current.incidentType,
            ),
          );
        }

        if (resumePlan) {
          await this.planRepository.markVehicleInService(
            database,
            nextVehicleId,
          );

          await this.planRepository.enqueueCollectionStatusNotices(
            database,
            {
              plan: {
                ...plan,
                vehicleId: nextVehicleId,
                driverId: nextDriverId,
              },
              status: "IN_PROGRESS",
            },
          );
        }

        await this.incidentRepository.assignReplacement(
          database,
          incidentId,
          incident.toObject(),
        );

        return {
          ...incident.toObject(),
          planId: plan.id,
          planNo: plan.planNo,
          resumed: resumePlan,
        };
      },
    );

    await this.auditLog.record({
      userId: actor.userId,
      action: "ASSIGN_WASTE_INCIDENT_REPLACEMENT",
      entityType: "WASTE_INCIDENT",
      entityId: incidentId,
      nextValue: {
        replacementVehicleId,
        replacementDriverId,
        resumePlan,
        resolutionNote,
      },
      ipAddress: actor.ipAddress,
    });

    return saved;
  }
}
