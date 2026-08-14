import crypto from "node:crypto";
import { DomainRuleViolation } from "../../../domain/common/errors/DomainRuleViolation.js";
import { WasteDriver } from "../domain/WasteDriver.js";

export class WasteDriverService {
  constructor({
    repository,
    auditLog,
    idFactory = () => crypto.randomUUID(),
  }) {
    if (!repository) {
      throw new TypeError(
        "WasteDriverService requires repository",
      );
    }

    if (!auditLog) {
      throw new TypeError(
        "WasteDriverService requires auditLog",
      );
    }

    this.repository = repository;
    this.auditLog = auditLog;
    this.idFactory = idFactory;
  }

  async list() {
    const rows = await this.repository.list();

    return rows.map(
      (row) => new WasteDriver(row).toObject(),
    );
  }

  async create(input, actor) {
    const driver = new WasteDriver({
      id: this.idFactory(),
      ...input,
    });

    await this.repository.create(
      driver.toObject(),
    );

    await this.auditLog.record({
      userId: actor.userId,
      action: "CREATE_WASTE_DRIVER",
      entityType: "WASTE_DRIVER",
      entityId: driver.id,
      nextValue: driver.toObject(),
      ipAddress: actor.ipAddress,
    });

    return driver.toObject();
  }

  async update(id, changes, actor) {
    const current =
      await this.repository.findById(id);

    if (!current) {
      throw new DomainRuleViolation(
        "WASTE_DRIVER_NOT_FOUND",
        "ไม่พบข้อมูลคนขับรถเก็บขยะ",
        { status: 404 },
      );
    }

    const driver =
      new WasteDriver(current).update(changes);

    const saved = await this.repository.update(
      id,
      changes,
    );

    if (!saved) {
      throw new DomainRuleViolation(
        "WASTE_DRIVER_NOT_FOUND",
        "ไม่พบข้อมูลคนขับรถเก็บขยะ",
        { status: 404 },
      );
    }

    await this.auditLog.record({
      userId: actor.userId,
      action: "UPDATE_WASTE_DRIVER",
      entityType: "WASTE_DRIVER",
      entityId: id,
      nextValue: changes,
      ipAddress: actor.ipAddress,
    });

    return driver.toObject();
  }

  async remove(id, actor) {
    const current =
      await this.repository.findById(id);

    if (!current) {
      throw new DomainRuleViolation(
        "WASTE_DRIVER_NOT_FOUND",
        "ไม่พบข้อมูลคนขับรถเก็บขยะ",
        { status: 404 },
      );
    }

    const driver = new WasteDriver(current);

    driver.assertDeletable(
      await this.repository.countUsage(id),
    );

    const removed =
      await this.repository.remove(id);

    if (!removed) {
      throw new DomainRuleViolation(
        "WASTE_DRIVER_NOT_FOUND",
        "ไม่พบข้อมูลคนขับรถเก็บขยะ",
        { status: 404 },
      );
    }

    await this.auditLog.record({
      userId: actor.userId,
      action: "DELETE_WASTE_DRIVER",
      entityType: "WASTE_DRIVER",
      entityId: id,
      nextValue: null,
      ipAddress: actor.ipAddress,
    });
  }
}