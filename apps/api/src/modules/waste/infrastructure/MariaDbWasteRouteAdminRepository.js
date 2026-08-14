import crypto from "node:crypto";

function parseJson(value) {
  if (!value) return null;

  return typeof value === "string"
    ? JSON.parse(value)
    : value;
}

function mapRoute(row) {
  if (!row) return null;

  return {
    ...row,
    routeGeojson: parseJson(row.routeGeojson),
    isActive: Boolean(Number(row.isActive)),
    stopCount: Number(row.stopCount || 0),
    serviceUserCount:
      Number(row.serviceUserCount || 0),
  };
}

const UPDATE_FIELDS = Object.freeze({
  routeCode: "route_code",
  routeName: "route_name",
  description: "description",
  isActive: "is_active",
});

export class MariaDbWasteRouteAdminRepository {
  constructor({ database }) {
    if (!database) {
      throw new TypeError(
        "MariaDbWasteRouteAdminRepository requires database",
      );
    }

    this.database = database;
  }

  async list() {
    const [rows] =
      await this.database.execute(
        `SELECT
           r.id,
           r.route_code AS routeCode,
           r.route_name AS routeName,
           r.description,
           CAST(r.route_geojson AS CHAR) AS routeGeojson,
           r.is_active AS isActive,
           COUNT(DISTINCT s.id) AS stopCount,
           COUNT(DISTINCT u.id) AS serviceUserCount
         FROM waste_routes r
         LEFT JOIN waste_route_stops s
           ON s.route_id = r.id
          AND s.is_active = 1
         LEFT JOIN waste_service_users u
           ON u.route_id = r.id
          AND u.is_active = 1
         GROUP BY
           r.id,
           r.route_code,
           r.route_name,
           r.description,
           r.route_geojson,
           r.is_active
         ORDER BY
           r.is_active DESC,
           r.route_code`,
      );

    return rows.map(mapRoute);
  }

  async findById(id) {
    const [rows] =
      await this.database.execute(
        `SELECT
           r.id,
           r.route_code AS routeCode,
           r.route_name AS routeName,
           r.description,
           CAST(r.route_geojson AS CHAR) AS routeGeojson,
           r.is_active AS isActive,
           COUNT(DISTINCT s.id) AS stopCount,
           COUNT(DISTINCT u.id) AS serviceUserCount
         FROM waste_routes r
         LEFT JOIN waste_route_stops s
           ON s.route_id = r.id
          AND s.is_active = 1
         LEFT JOIN waste_service_users u
           ON u.route_id = r.id
          AND u.is_active = 1
         WHERE r.id = ?
         GROUP BY
           r.id,
           r.route_code,
           r.route_name,
           r.description,
           r.route_geojson,
           r.is_active
         LIMIT 1`,
        [id],
      );

    return mapRoute(rows[0]);
  }

  async create(route) {
    await this.database.execute(
      `INSERT INTO waste_routes
        (
          id,
          route_code,
          route_name,
          description,
          route_geojson,
          is_active
        )
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        route.id,
        route.routeCode,
        route.routeName,
        route.description,
        route.routeGeojson
          ? JSON.stringify(route.routeGeojson)
          : null,
        route.isActive,
      ],
    );

    return route;
  }

  async update(id, changes) {
    const entries =
      Object.entries(changes).filter(
        ([key]) => UPDATE_FIELDS[key],
      );

    if (!entries.length) {
      return false;
    }

    const values = [];

    const sets = entries.map(
      ([key, value]) => {
        values.push(value);
        return `${UPDATE_FIELDS[key]} = ?`;
      },
    );

    values.push(id);

    const [result] =
      await this.database.execute(
        `UPDATE waste_routes
         SET ${sets.join(", ")}
         WHERE id = ?`,
        values,
      );

    return result.affectedRows > 0;
  }

  async countActiveDependencies(id) {
    const [[row]] =
      await this.database.execute(
        `SELECT
           (
             SELECT COUNT(*)
             FROM waste_operation_plans
             WHERE route_id = ?
               AND status IN (
                 'SCHEDULED',
                 'IN_PROGRESS',
                 'INTERRUPTED'
               )
           ) AS activePlanCount,
           (
             SELECT COUNT(*)
             FROM waste_service_users
             WHERE route_id = ?
               AND is_active = 1
           ) AS activeUserCount`,
        [id, id],
      );

    return {
      activePlanCount:
        Number(row?.activePlanCount || 0),
      activeUserCount:
        Number(row?.activeUserCount || 0),
    };
  }

  async countUsage(id) {
    const [[row]] =
      await this.database.execute(
        `SELECT
           (
             SELECT COUNT(*)
             FROM waste_operation_plans
             WHERE route_id = ?
           ) AS planCount,
           (
             SELECT COUNT(*)
             FROM waste_service_users
             WHERE route_id = ?
           ) AS userCount`,
        [id, id],
      );

    return {
      planCount:
        Number(row?.planCount || 0),
      userCount:
        Number(row?.userCount || 0),
    };
  }

  async remove(id) {
    const [result] =
      await this.database.execute(
        `DELETE FROM waste_routes
         WHERE id = ?`,
        [id],
      );

    return result.affectedRows > 0;
  }

  async listStops(routeId) {
    const [rows] =
      await this.database.execute(
        `SELECT
           s.id,
           s.service_user_id AS serviceUserId,
           s.sequence_no AS sequenceNo,
           s.stop_name AS stopName,
           s.latitude,
           s.longitude,
           u.service_no AS serviceNo,
           u.full_name AS fullName,
           u.house_no AS houseNo,
           v.village_no AS villageNo
         FROM waste_route_stops s
         LEFT JOIN waste_service_users u
           ON u.id = s.service_user_id
         LEFT JOIN villages v
           ON v.id = u.village_id
         WHERE s.route_id = ?
           AND s.is_active = 1
         ORDER BY s.sequence_no`,
        [routeId],
      );

    return rows.map((row) => ({
      ...row,
      sequenceNo:
        Number(row.sequenceNo),
    }));
  }

  async replaceStops(routeId, stops) {
    return this.database.transaction(
      async (db) => {
        const [routeRows] =
          await db.execute(
            `SELECT id
             FROM waste_routes
             WHERE id = ?
             FOR UPDATE`,
            [routeId],
          );

        if (!routeRows[0]) {
          return {
            status: "ROUTE_NOT_FOUND",
            stopCount: 0,
          };
        }

        const serviceUserIds =
          stops.map(
            (stop) => stop.serviceUserId,
          );

        let serviceUsers = [];

        if (serviceUserIds.length) {
          const placeholders =
            serviceUserIds
              .map(() => "?")
              .join(",");

          const [rows] =
            await db.execute(
              `SELECT
                 id,
                 full_name AS fullName,
                 house_no AS houseNo,
                 latitude,
                 longitude
               FROM waste_service_users
               WHERE route_id = ?
                 AND is_active = 1
                 AND id IN (${placeholders})`,
              [
                routeId,
                ...serviceUserIds,
              ],
            );

          serviceUsers = rows;

          if (
            serviceUsers.length !==
            serviceUserIds.length
          ) {
            return {
              status:
                "INVALID_SERVICE_USERS",
              stopCount: 0,
            };
          }
        }

        const serviceUsersById =
          new Map(
            serviceUsers.map(
              (user) => [user.id, user],
            ),
          );

        await db.execute(
          `UPDATE waste_route_stops
           SET is_active = 0
           WHERE route_id = ?
             AND is_active = 1`,
          [routeId],
        );

        for (const stop of stops) {
          const user =
            serviceUsersById.get(
              stop.serviceUserId,
            );

          await db.execute(
            `INSERT INTO waste_route_stops
              (
                id,
                route_id,
                service_user_id,
                sequence_no,
                stop_name,
                latitude,
                longitude,
                is_active
              )
             VALUES (
               ?, ?, ?, ?, ?, ?, ?, 1
             )`,
            [
              crypto.randomUUID(),
              routeId,
              user.id,
              stop.sequenceNo,
              `บ้าน ${user.houseNo} · ${user.fullName}`,
              user.latitude,
              user.longitude,
            ],
          );
        }

        return {
          status: "OK",
          stopCount: stops.length,
        };
      },
    );
  }
}
