import crypto from "node:crypto";
import { DomainRuleViolation } from "../../../domain/common/errors/DomainRuleViolation.js";
import { WasteVehicle } from "../domain/WasteVehicle.js";

export class WasteVehicleService {
  constructor({
    repository,
    auditLog,
    idFactory = () => crypto.randomUUID(),
  }) {
    if (!repository) {
      throw new TypeError(
        "WasteVehicleService requires repository",
      );
    }

    if (!auditLog) {
      throw new TypeError(
        "WasteVehicleService requires auditLog",
      );
    }

    this.repository = repository;
    this.auditLog = auditLog;
    this.idFactory = idFactory;
  }

  async list(query = {}) {
    const rows = await this.repository.list(query);

    return rows.map(
      (row) => new WasteVehicle(row).toObject(),
    );
  }

  async create(input, actor) {
    const vehicle = new WasteVehicle({
      id: this.idFactory(),
      ...input,
    });

    await this.repository.create(
      vehicle.toObject(),
    );

    await this.auditLog.record({
      userId: actor.userId,
      action: "CREATE_WASTE_VEHICLE",
      entityType: "WASTE_VEHICLE",
      entityId: vehicle.id,
      nextValue: vehicle.toObject(),
      ipAddress: actor.ipAddress,
    });

    return vehicle.toObject();
  }

  async update(id, changes, actor) {
    const current =
      await this.repository.findById(id);

    if (!current) {
      throw new DomainRuleViolation(
        "WASTE_VEHICLE_NOT_FOUND",
        "ไม่พบข้อมูลรถเก็บขยะ",
        { status: 404 },
      );
    }

    const vehicle =
      new WasteVehicle(current).update(changes);

    const saved = await this.repository.update(
      id,
      changes,
    );

    if (!saved) {
      throw new DomainRuleViolation(
        "WASTE_VEHICLE_NOT_FOUND",
        "ไม่พบข้อมูลรถเก็บขยะ",
        { status: 404 },
      );
    }

    await this.auditLog.record({
      userId: actor.userId,
      action: "UPDATE_WASTE_VEHICLE",
      entityType: "WASTE_VEHICLE",
      entityId: id,
      nextValue: changes,
      ipAddress: actor.ipAddress,
    });

    return vehicle.toObject();
  }

  async remove(id, actor) {
    const current =
      await this.repository.findById(id);

    if (!current) {
      throw new DomainRuleViolation(
        "WASTE_VEHICLE_NOT_FOUND",
        "ไม่พบข้อมูลรถเก็บขยะ",
        { status: 404 },
      );
    }

    const vehicle = new WasteVehicle(current);

    vehicle.assertDeletable(
      await this.repository.countUsage(id),
    );

    const removed =
      await this.repository.remove(id);

    if (!removed) {
      throw new DomainRuleViolation(
        "WASTE_VEHICLE_NOT_FOUND",
        "ไม่พบข้อมูลรถเก็บขยะ",
        { status: 404 },
      );
    }

    await this.auditLog.record({
      userId: actor.userId,
      action: "DELETE_WASTE_VEHICLE",
      entityType: "WASTE_VEHICLE",
      entityId: id,
      nextValue: null,
      ipAddress: actor.ipAddress,
    });
  }
}