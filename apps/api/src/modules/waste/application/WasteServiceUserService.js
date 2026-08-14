import crypto from "node:crypto";
import { DomainRuleViolation } from "../../../domain/common/errors/DomainRuleViolation.js";
import { WasteServiceUser } from "../domain/WasteServiceUser.js";

export class WasteServiceUserService {
  constructor({
    repository,
    auditLog,
    routeLifecycleService,
    routeAssignmentService,
    idFactory =
      () => crypto.randomUUID(),
  }) {
    if (!repository) {
      throw new TypeError(
        "WasteServiceUserService requires repository",
      );
    }

    if (!auditLog) {
      throw new TypeError(
        "WasteServiceUserService requires auditLog",
      );
    }

    if (!routeLifecycleService) {
      throw new TypeError(
        "WasteServiceUserService requires routeLifecycleService",
      );
    }

    if (!routeAssignmentService) {
      throw new TypeError(
        "WasteServiceUserService requires routeAssignmentService",
      );
    }

    this.repository = repository;
    this.auditLog = auditLog;
    this.routeLifecycleService =
      routeLifecycleService;
    this.routeAssignmentService =
      routeAssignmentService;
    this.idFactory = idFactory;
  }

  async list(query = {}) {
    const rows =
      await this.repository.list(query);

    return rows.map(
      (row) =>
        new WasteServiceUser(
          row,
        ).toObject(),
    );
  }

  async create(input, actor) {
    const user =
      new WasteServiceUser({
        ...input,
        id: this.idFactory(),
        routeId: null,
        routeName: null,
        routeAssignmentStatus:
          "UNASSIGNED",
        routeAssignmentDistanceM:
          null,
        routeAssignedAt: null,
      });

    await this.repository.transaction(
      async (db) => {
        await this.repository.create(
          db,
          user.toObject(),
        );
      },
    );

    await this.auditLog.record({
      userId: actor.userId,
      action:
        "CREATE_WASTE_SERVICE_USER",
      entityType:
        "WASTE_SERVICE_USER",
      entityId: user.id,
      nextValue: user.toObject(),
      ipAddress: actor.ipAddress,
    });

    return user.toObject();
  }

  async update(id, changes, actor) {
    const sanitized = {
      ...changes,
    };

    if (
      Object.hasOwn(
        sanitized,
        "routeId",
      )
    ) {
      delete sanitized.routeId;
    }

    if (
      !Object.keys(sanitized).length
    ) {
      throw new DomainRuleViolation(
        "WASTE_SERVICE_USER_ROUTE_DIRECT_UPDATE_NOT_ALLOWED",
        "ใช้คำสั่งยืนยันเส้นทางเพื่อเปลี่ยนเส้นทางรับผิดชอบ",
        { status: 422 },
      );
    }

    const data =
      await this.repository.transaction(
        async (db) => {
          const before =
            await this.repository.findById(
              id,
              {
                database: db,
                lock: true,
              },
            );

          if (!before) {
            throw new DomainRuleViolation(
              "WASTE_SERVICE_USER_NOT_FOUND",
              "ไม่พบผู้ใช้บริการเก็บขยะ",
              { status: 404 },
            );
          }

          const user =
            new WasteServiceUser(
              before,
            );

          user.update(sanitized);

          const persistenceChanges = {
            ...sanitized,
          };

          if (
            sanitized.isActive ===
            false
          ) {
            persistenceChanges.lineUserId =
              null;
          }

          const saved =
            await this.repository.update(
              db,
              id,
              persistenceChanges,
            );

          if (!saved) {
            throw new DomainRuleViolation(
              "WASTE_SERVICE_USER_NOT_FOUND",
              "ไม่พบผู้ใช้บริการเก็บขยะ",
              { status: 404 },
            );
          }

          await this.repository
            .syncRouteStop(
              db,
              id,
            );

          const locationChanged =
            user.locationChangedFrom(
              before,
            );

          const activeChanged =
            user.activeStateChangedFrom(
              before,
            );

          if (
            activeChanged &&
            !user.isActive &&
            before.lineUserId
          ) {
            await this.repository
              .removeCitizenLineSession(
                db,
                before.lineUserId,
              );
          }

          if (
            (
              locationChanged ||
              activeChanged
            ) &&
            before.routeId
          ) {
            const currentGeojson =
              await this.repository
                .loadRouteGeojson(
                  db,
                  before.routeId,
                );

            if (currentGeojson) {
              const nextGeojson =
                this.routeLifecycleService
                  .markForRecalculation(
                    currentGeojson,
                    locationChanged
                      ? "SERVICE_LOCATION_CHANGED"
                      : "SERVICE_STATUS_CHANGED",
                  );

              await this.repository
                .saveRouteGeojson(
                  db,
                  before.routeId,
                  nextGeojson,
                );
            }
          }

          return {
            id,
            ...persistenceChanges,
          };
        },
      );

    await this.auditLog.record({
      userId: actor.userId,
      action:
        "UPDATE_WASTE_SERVICE_USER",
      entityType:
        "WASTE_SERVICE_USER",
      entityId: id,
      nextValue: sanitized,
      ipAddress: actor.ipAddress,
    });

    return data;
  }

  async unlinkLine(id, actor) {
    const result =
      await this.repository.transaction(
        async (db) => {
          const current =
            await this.repository.findById(
              id,
              {
                database: db,
                lock: true,
              },
            );

          if (!current) {
            throw new DomainRuleViolation(
              "WASTE_SERVICE_USER_NOT_FOUND",
              "ไม่พบผู้ใช้บริการเก็บขยะ",
              { status: 404 },
            );
          }

          const user =
            new WasteServiceUser(
              current,
            );

          const unlinked =
            user.unlinkLine();

          if (unlinked) {
            await this.repository.update(
              db,
              id,
              {
                lineUserId: null,
              },
            );

            await this.repository
              .removeCitizenLineSession(
                db,
                current.lineUserId,
              );
          }

          return { unlinked };
        },
      );

    await this.auditLog.record({
      userId: actor.userId,
      action:
        "UNLINK_WASTE_SERVICE_USER_LINE",
      entityType:
        "WASTE_SERVICE_USER",
      entityId: id,
      nextValue: result,
      ipAddress: actor.ipAddress,
    });

    return {
      id,
      lineUserId: null,
      ...result,
    };
  }

  async remove(id, actor) {
    await this.repository.transaction(
      async (db) => {
        const current =
          await this.repository.findById(
            id,
            {
              database: db,
              lock: true,
            },
          );

        if (!current) {
          throw new DomainRuleViolation(
            "WASTE_SERVICE_USER_NOT_FOUND",
            "ไม่พบผู้ใช้บริการเก็บขยะ",
            { status: 404 },
          );
        }

        const user =
          new WasteServiceUser(
            current,
          );

        user.assertDeletable(
          await this.repository
            .historyCounts(
              db,
              id,
            ),
        );

        if (current.lineUserId) {
          await this.repository
            .removeCitizenLineSession(
              db,
              current.lineUserId,
            );
        }

        await this.repository
          .deleteRouteStops(
            db,
            id,
          );

        const removed =
          await this.repository.remove(
            db,
            id,
          );

        if (!removed) {
          throw new DomainRuleViolation(
            "WASTE_SERVICE_USER_NOT_FOUND",
            "ไม่พบผู้ใช้บริการเก็บขยะ",
            { status: 404 },
          );
        }

        if (current.routeId) {
          const currentGeojson =
            await this.repository
              .loadRouteGeojson(
                db,
                current.routeId,
              );

          if (currentGeojson) {
            const nextGeojson =
              this.routeLifecycleService
                .markForRecalculation(
                  currentGeojson,
                  "SERVICE_USER_DELETED",
                );

            await this.repository
              .saveRouteGeojson(
                db,
                current.routeId,
                nextGeojson,
              );
          }
        }
      },
    );

    await this.auditLog.record({
      userId: actor.userId,
      action:
        "DELETE_WASTE_SERVICE_USER",
      entityType:
        "WASTE_SERVICE_USER",
      entityId: id,
      nextValue: null,
      ipAddress: actor.ipAddress,
    });
  }

  async routeSuggestions(id) {
    const [
      userRecord,
      routes,
    ] = await Promise.all([
      this.repository.findById(id),
      this.repository
        .listActiveRoutesForSuggestions(),
    ]);

    if (
      !userRecord ||
      !userRecord.isActive
    ) {
      throw new DomainRuleViolation(
        "WASTE_SERVICE_USER_NOT_FOUND",
        "ไม่พบผู้ใช้บริการเก็บขยะ",
        { status: 404 },
      );
    }

    const user =
      new WasteServiceUser(
        userRecord,
      );

    if (
      user.latitude == null ||
      user.longitude == null
    ) {
      throw new DomainRuleViolation(
        "WASTE_SERVICE_USER_LOCATION_REQUIRED",
        "กรุณาปักตำแหน่งสถานที่รับบริการก่อนค้นหาเส้นทางใกล้เคียง",
        { status: 422 },
      );
    }

    const suggestions =
      this.routeAssignmentService
        .suggest(
          {
            latitude:
              user.latitude,
            longitude:
              user.longitude,
          },
          routes.filter(
            (route) =>
              route.routeGeojson,
          ),
          routes.length,
        )
        .map(
          ({
            routeGeojson,
            ...suggestion
          }) => suggestion,
        );

    const suggestedIds =
      new Set(
        suggestions.map(
          (route) => route.id,
        ),
      );

    for (const route of routes) {
      if (
        suggestedIds.has(route.id)
      ) {
        continue;
      }

      suggestions.push({
        id: route.id,
        routeCode:
          route.routeCode,
        routeName:
          route.routeName,
        distanceMeters: null,
        eligible: true,
        recommended: false,
        requiresInitialSetup: true,
      });
    }

    return suggestions;
  }
}
