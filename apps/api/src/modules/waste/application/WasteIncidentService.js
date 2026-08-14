import crypto from "node:crypto";
import { DomainRuleViolation } from "../../../domain/common/errors/DomainRuleViolation.js";
import { WasteIncident } from "../domain/WasteIncident.js";

export class WasteIncidentService {
  constructor({
    repository,
    auditLog,
    idFactory =
      () => crypto.randomUUID(),
  }) {
    if (!repository) {
      throw new TypeError(
        "WasteIncidentService requires repository",
      );
    }

    if (!auditLog) {
      throw new TypeError(
        "WasteIncidentService requires auditLog",
      );
    }

    this.repository = repository;
    this.auditLog = auditLog;
    this.idFactory = idFactory;
  }

  async list(query = {}) {
    return this.repository.list(
      query,
    );
  }

  async create(input, actor) {
    const incident =
      new WasteIncident({
        id: this.idFactory(),
        ...input,
        happenedAt:
          new Date(
            input.happenedAt,
          ),
        status: "REPORTED",
      });

    await this.repository.create(
      incident.toObject(),
    );

    await this.auditLog.record({
      userId: actor.userId,
      action:
        "CREATE_WASTE_INCIDENT",
      entityType:
        "WASTE_INCIDENT",
      entityId: incident.id,
      nextValue: input,
      ipAddress: actor.ipAddress,
    });

    return {
      id: incident.id,
      ...input,
      status: "REPORTED",
    };
  }

  async update(
    id,
    input,
    actor,
  ) {
    const current =
      await this.repository
        .findById(id);

    if (!current) {
      throw new DomainRuleViolation(
        "WASTE_INCIDENT_NOT_FOUND",
        "ไม่พบเหตุระหว่างปฏิบัติงาน",
        { status: 404 },
      );
    }

    const incident =
      new WasteIncident(
        current,
      );

    incident.update(input);

    const saved =
      await this.repository.update(
        id,
        input,
      );

    if (!saved) {
      throw new DomainRuleViolation(
        "WASTE_INCIDENT_NOT_FOUND",
        "ไม่พบเหตุระหว่างปฏิบัติงาน",
        { status: 404 },
      );
    }

    await this.auditLog.record({
      userId: actor.userId,
      action:
        "UPDATE_WASTE_INCIDENT",
      entityType:
        "WASTE_INCIDENT",
      entityId: id,
      nextValue: input,
      ipAddress: actor.ipAddress,
    });

    return {
      id,
      ...input,
    };
  }
}
