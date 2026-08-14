import crypto from "node:crypto";
import { DomainRuleViolation } from "../../../domain/common/errors/DomainRuleViolation.js";
import { WasteRoute } from "../domain/WasteRoute.js";
import { WasteRouteStopSequence } from "../domain/WasteRouteStopSequence.js";

export class WasteRouteService {
  constructor({
    repository,
    auditLog,
    idFactory = () => crypto.randomUUID(),
  }) {
    if (!repository) {
      throw new TypeError(
        "WasteRouteService requires repository",
      );
    }

    if (!auditLog) {
      throw new TypeError(
        "WasteRouteService requires auditLog",
      );
    }

    if (typeof idFactory !== "function") {
      throw new TypeError(
        "WasteRouteService requires idFactory function",
      );
    }

    this.repository = repository;
    this.auditLog = auditLog;
    this.idFactory = idFactory;
  }

  async list() {
    const rows =
      await this.repository.list();

    return rows.map(
      (row) =>
        new WasteRoute(row).toObject(),
    );
  }

  async create(input, actor) {
    const route =
      new WasteRoute({
        id: this.idFactory(),
        ...input,
        stopCount: 0,
        serviceUserCount: 0,
      });

    await this.repository.create(
      route.toObject(),
    );

    await this.auditLog.record({
      userId: actor.userId,
      action: "CREATE_WASTE_ROUTE",
      entityType: "WASTE_ROUTE",
      entityId: route.id,
      nextValue: input,
      ipAddress: actor.ipAddress,
    });

    return route.toObject();
  }

  async update(id, changes, actor) {
    const current =
      await this.repository.findById(id);

    if (!current) {
      throw new DomainRuleViolation(
        "WASTE_ROUTE_NOT_FOUND",
        "ไม่พบข้อมูลเส้นทางเก็บขยะ",
        { status: 404 },
      );
    }

    const route =
      new WasteRoute(current);

    route.assertManualGeometryIsNotChanged(
      changes,
    );

    if (changes.isActive === false) {
      route.assertCanDeactivate(
        await this.repository
          .countActiveDependencies(id),
      );
    }

    route.update(changes);

    const saved =
      await this.repository.update(
        id,
        changes,
      );

    if (!saved) {
      throw new DomainRuleViolation(
        "WASTE_ROUTE_NOT_FOUND",
        "ไม่พบข้อมูลเส้นทางเก็บขยะ",
        { status: 404 },
      );
    }

    await this.auditLog.record({
      userId: actor.userId,
      action: "UPDATE_WASTE_ROUTE",
      entityType: "WASTE_ROUTE",
      entityId: id,
      nextValue: changes,
      ipAddress: actor.ipAddress,
    });

    return route.toObject();
  }

  async remove(id, actor) {
    const current =
      await this.repository.findById(id);

    if (!current) {
      throw new DomainRuleViolation(
        "WASTE_ROUTE_NOT_FOUND",
        "ไม่พบข้อมูลเส้นทางเก็บขยะ",
        { status: 404 },
      );
    }

    const route =
      new WasteRoute(current);

    route.assertDeletable(
      await this.repository.countUsage(id),
    );

    const removed =
      await this.repository.remove(id);

    if (!removed) {
      throw new DomainRuleViolation(
        "WASTE_ROUTE_NOT_FOUND",
        "ไม่พบข้อมูลเส้นทางเก็บขยะ",
        { status: 404 },
      );
    }

    await this.auditLog.record({
      userId: actor.userId,
      action: "DELETE_WASTE_ROUTE",
      entityType: "WASTE_ROUTE",
      entityId: id,
      nextValue: null,
      ipAddress: actor.ipAddress,
    });
  }

  async getStops(routeId) {
    const route =
      await this.repository.findById(
        routeId,
      );

    if (!route) {
      throw new DomainRuleViolation(
        "WASTE_ROUTE_NOT_FOUND",
        "ไม่พบข้อมูลเส้นทางเก็บขยะ",
        { status: 404 },
      );
    }

    return this.repository.listStops(
      routeId,
    );
  }

  async replaceStops(
    routeId,
    input,
    actor,
  ) {
    const sequence =
      new WasteRouteStopSequence(
        input.stops,
      );

    const result =
      await this.repository.replaceStops(
        routeId,
        sequence.ordered(),
      );

    if (
      result.status ===
      "ROUTE_NOT_FOUND"
    ) {
      throw new DomainRuleViolation(
        "WASTE_ROUTE_NOT_FOUND",
        "ไม่พบข้อมูลเส้นทางเก็บขยะ",
        { status: 404 },
      );
    }

    if (
      result.status ===
      "INVALID_SERVICE_USERS"
    ) {
      throw new DomainRuleViolation(
        "WASTE_ROUTE_STOP_SERVICE_USER_INVALID",
        "มีผู้ใช้บริการที่ไม่ได้อยู่ในเส้นทางนี้หรือปิดบริการแล้ว",
        { status: 422 },
      );
    }

    await this.auditLog.record({
      userId: actor.userId,
      action:
        "REORDER_WASTE_ROUTE_STOPS",
      entityType: "WASTE_ROUTE",
      entityId: routeId,
      nextValue: {
        stops: sequence.toArray(),
      },
      ipAddress: actor.ipAddress,
    });

    return {
      routeId,
      stopCount: sequence.count,
    };
  }
}
