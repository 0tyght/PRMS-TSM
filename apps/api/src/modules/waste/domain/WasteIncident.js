import { DomainRuleViolation } from "../../../domain/common/errors/DomainRuleViolation.js";

const INCIDENT_TYPES =
  Object.freeze([
    "VEHICLE_BREAKDOWN",
    "ACCIDENT",
    "ROAD_CLOSED",
    "ACCESS_BLOCKED",
    "OTHER",
  ]);

const INCIDENT_STATUSES =
  Object.freeze([
    "REPORTED",
    "ACKNOWLEDGED",
    "RESOLVED",
  ]);

export class WasteIncident {
  #status;

  constructor({
    id = null,
    planId = null,
    planNo = null,
    vehicleId = null,
    vehicleCode = null,
    replacementVehicleId = null,
    replacementVehicleCode = null,
    driverId = null,
    driverName = null,
    incidentType,
    status = "REPORTED",
    description,
    happenedAt,
    resolvedAt = null,
    resolutionNote = null,
  }) {
    this.id = id;
    this.planId = planId;
    this.planNo = planNo;
    this.vehicleId = vehicleId;
    this.vehicleCode =
      vehicleCode;
    this.replacementVehicleId =
      replacementVehicleId;
    this.replacementVehicleCode =
      replacementVehicleCode;
    this.driverId = driverId;
    this.driverName = driverName;
    this.description = description;
    this.happenedAt = happenedAt;
    this.resolvedAt = resolvedAt;
    this.resolutionNote =
      resolutionNote;

    this.changeIncidentType(
      incidentType,
    );

    this.changeStatus(status);
  }

  get status() {
    return this.#status;
  }

  changeIncidentType(
    incidentType,
  ) {
    if (
      !INCIDENT_TYPES.includes(
        incidentType,
      )
    ) {
      throw new DomainRuleViolation(
        "WASTE_INCIDENT_TYPE_INVALID",
        "ประเภทเหตุระหว่างการปฏิบัติงานเก็บขยะไม่ถูกต้อง",
        { status: 422 },
      );
    }

    this.incidentType =
      incidentType;

    return this;
  }

  changeStatus(status) {
    if (
      !INCIDENT_STATUSES.includes(
        status,
      )
    ) {
      throw new DomainRuleViolation(
        "WASTE_INCIDENT_STATUS_INVALID",
        "สถานะเหตุระหว่างการปฏิบัติงานเก็บขยะไม่ถูกต้อง",
        { status: 422 },
      );
    }

    this.#status = status;

    return this;
  }

  update(changes = {}) {
    if ("status" in changes) {
      this.changeStatus(
        changes.status,
      );
    }

    if (
      "replacementVehicleId" in
      changes
    ) {
      this.replacementVehicleId =
        changes.replacementVehicleId;
    }

    if (
      "resolutionNote" in
      changes
    ) {
      this.resolutionNote =
        changes.resolutionNote;
    }

    return this;
  }

  toObject() {
    return {
      id: this.id,
      planId: this.planId,
      planNo: this.planNo,
      vehicleId: this.vehicleId,
      vehicleCode:
        this.vehicleCode,
      replacementVehicleId:
        this.replacementVehicleId,
      replacementVehicleCode:
        this.replacementVehicleCode,
      driverId: this.driverId,
      driverName: this.driverName,
      incidentType:
        this.incidentType,
      status: this.#status,
      description:
        this.description,
      happenedAt:
        this.happenedAt,
      resolvedAt:
        this.resolvedAt,
      resolutionNote:
        this.resolutionNote,
    };
  }
}
