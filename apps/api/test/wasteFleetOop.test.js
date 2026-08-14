import assert from "node:assert/strict";
import test from "node:test";

import { WasteVehicle } from "../src/modules/waste/domain/WasteVehicle.js";
import { WasteDriver } from "../src/modules/waste/domain/WasteDriver.js";
import { WasteVehicleService } from "../src/modules/waste/application/WasteVehicleService.js";
import { WasteDriverService } from "../src/modules/waste/application/WasteDriverService.js";

test("WasteVehicle protects deletion when operational history exists", () => {
  const vehicle = new WasteVehicle({
    id: "vehicle-1",
    vehicleCode: "W01",
    registrationNo: "กข 1234",
    vehicleType: "รถเก็บขยะ",
    status: "AVAILABLE",
  });

  assert.throws(
    () => vehicle.assertDeletable(1),
    { code: "WASTE_VEHICLE_HAS_HISTORY" },
  );

  assert.doesNotThrow(
    () => vehicle.assertDeletable(0),
  );
});

test("WasteDriver protects deletion when work history exists", () => {
  const driver = new WasteDriver({
    id: "driver-1",
    fullName: "สมชาย ทดสอบ",
    phone: "0812345678",
    isActive: true,
  });

  assert.throws(
    () => driver.assertDeletable(2),
    { code: "WASTE_DRIVER_HAS_HISTORY" },
  );

  driver.deactivate();

  assert.equal(driver.isActive, false);
});

test("WasteVehicleService creates an entity and audit event", async () => {
  const calls = [];

  const repository = {
    create: async (value) =>
      calls.push(["create", value]),
  };

  const auditLog = {
    record: async (value) =>
      calls.push(["audit", value]),
  };

  const service = new WasteVehicleService({
    repository,
    auditLog,
    idFactory: () => "vehicle-1",
  });

  const result = await service.create(
    {
      vehicleCode: "W01",
      registrationNo: "กข 1234",
      vehicleType: "รถเก็บขยะ",
      capacityKg: 5000,
      status: "AVAILABLE",
      note: null,
    },
    {
      userId: "officer-1",
      ipAddress: "127.0.0.1",
    },
  );

  assert.equal(result.id, "vehicle-1");
  assert.equal(result.status, "AVAILABLE");
  assert.equal(calls[0][0], "create");
  assert.equal(
    calls[1][1].action,
    "CREATE_WASTE_VEHICLE",
  );
});

test("WasteVehicleService refuses physical deletion after use", async () => {
  let removed = false;

  const repository = {
    findById: async () => ({
      id: "vehicle-1",
      vehicleCode: "W01",
      registrationNo: "กข 1234",
      vehicleType: "รถเก็บขยะ",
      capacityKg: 5000,
      status: "AVAILABLE",
      note: null,
    }),
    countUsage: async () => 4,
    remove: async () => {
      removed = true;
      return true;
    },
  };

  const service = new WasteVehicleService({
    repository,
    auditLog: { record: async () => {} },
  });

  await assert.rejects(
    () =>
      service.remove(
        "vehicle-1",
        {
          userId: "officer-1",
          ipAddress: null,
        },
      ),
    { code: "WASTE_VEHICLE_HAS_HISTORY" },
  );

  assert.equal(removed, false);
});

test("WasteDriverService updates driver state through domain object", async () => {
  const updates = [];

  const repository = {
    findById: async () => ({
      id: "driver-1",
      fullName: "สมชาย ทดสอบ",
      phone: "0812345678",
      lineUserId: null,
      isActive: 1,
    }),

    update: async (id, changes) => {
      updates.push([id, changes]);
      return true;
    },
  };

  const service = new WasteDriverService({
    repository,
    auditLog: { record: async () => {} },
  });

  const result = await service.update(
    "driver-1",
    { isActive: false },
    {
      userId: "officer-1",
      ipAddress: null,
    },
  );

  assert.equal(result.isActive, false);
  assert.equal(updates[0][0], "driver-1");
});