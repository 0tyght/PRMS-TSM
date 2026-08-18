import crypto from "node:crypto";
import { DomainRuleViolation } from "../../../domain/common/errors/DomainRuleViolation.js";
import { WasteDriver } from "../domain/WasteDriver.js";

function duplicateDriverCode(error) {
  return error?.code === "ER_DUP_ENTRY" && /driver_code|uk_waste_driver_code/i.test(String(error?.message || ""));
}

export class WasteDriverService {
  constructor({ repository, auditLog, idFactory = () => crypto.randomUUID() }) {
    if (!repository) throw new TypeError("WasteDriverService requires repository");
    if (!auditLog) throw new TypeError("WasteDriverService requires auditLog");
    this.repository = repository;
    this.auditLog = auditLog;
    this.idFactory = idFactory;
  }

  async list() {
    const rows = await this.repository.list();
    return rows.map((row) => new WasteDriver(row).toObject());
  }

  async create(input, actor) {
    const driver = new WasteDriver({ id: this.idFactory(), ...input }).assertHasDriverCode();
    try {
      await this.repository.create(driver.toObject());
    } catch (error) {
      if (duplicateDriverCode(error)) {
        throw new DomainRuleViolation("WASTE_DRIVER_CODE_DUPLICATE", "รหัสพนักงานนี้ถูกใช้งานแล้ว กรุณาระบุรหัสพนักงานอื่น", { status: 409 });
      }
      throw error;
    }
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
    const current = await this.repository.findById(id);
    if (!current) throw new DomainRuleViolation("WASTE_DRIVER_NOT_FOUND", "ไม่พบข้อมูลพนักงานประจำรถขยะ", { status: 404 });
    const driver = new WasteDriver(current).update(changes).assertHasDriverCode();
    const safeChanges = { ...changes };
    delete safeChanges.lineUserId;
    if (Object.hasOwn(safeChanges, "driverCode") && safeChanges.driverCode) {
      safeChanges.driverCode = String(safeChanges.driverCode).trim().toUpperCase();
    }
    try {
      const saved = await this.repository.update(id, safeChanges);
      if (!saved) throw new DomainRuleViolation("WASTE_DRIVER_NOT_FOUND", "ไม่พบข้อมูลพนักงานประจำรถขยะ", { status: 404 });
    } catch (error) {
      if (duplicateDriverCode(error)) {
        throw new DomainRuleViolation("WASTE_DRIVER_CODE_DUPLICATE", "รหัสพนักงานนี้ถูกใช้งานแล้ว กรุณาระบุรหัสพนักงานอื่น", { status: 409 });
      }
      throw error;
    }
    await this.auditLog.record({
      userId: actor.userId,
      action: "UPDATE_WASTE_DRIVER",
      entityType: "WASTE_DRIVER",
      entityId: id,
      nextValue: safeChanges,
      ipAddress: actor.ipAddress,
    });
    return driver.toObject();
  }

  async unlinkLine(id, actor) {
    const current = await this.repository.findById(id);
    if (!current) throw new DomainRuleViolation("WASTE_DRIVER_NOT_FOUND", "ไม่พบข้อมูลพนักงานประจำรถขยะ", { status: 404 });
    if (!current.lineUserId) return new WasteDriver(current).toObject();
    const saved = await this.repository.unlinkLine(id);
    if (!saved) throw new DomainRuleViolation("WASTE_DRIVER_NOT_FOUND", "ไม่พบข้อมูลพนักงานประจำรถขยะ", { status: 404 });
    await this.auditLog.record({
      userId: actor.userId,
      action: "UNLINK_WASTE_DRIVER_LINE",
      entityType: "WASTE_DRIVER",
      entityId: id,
      nextValue: { lineUserId: null },
      ipAddress: actor.ipAddress,
    });
    return new WasteDriver({ ...current, lineUserId: null }).toObject();
  }

  async remove(id, actor) {
    const current = await this.repository.findById(id);
    if (!current) throw new DomainRuleViolation("WASTE_DRIVER_NOT_FOUND", "ไม่พบข้อมูลพนักงานประจำรถขยะ", { status: 404 });
    const driver = new WasteDriver(current);
    driver.assertDeletable(await this.repository.countUsage(id));
    const removed = await this.repository.remove(id);
    if (!removed) throw new DomainRuleViolation("WASTE_DRIVER_NOT_FOUND", "ไม่พบข้อมูลพนักงานประจำรถขยะ", { status: 404 });
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
