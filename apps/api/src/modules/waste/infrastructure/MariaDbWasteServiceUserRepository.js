import crypto from "node:crypto";

function asBoolean(value) {
  return Boolean(Number(value));
}

function parseJson(value) {
  if (!value) return null;

  return typeof value === "string"
    ? JSON.parse(value)
    : value;
}

const UPDATE_FIELDS =
  Object.freeze({
    serviceNo: "service_no",
    fullName: "full_name",
    phone: "phone",
    houseNo: "house_no",
    villageId: "village_id",
    addressDetail: "address_detail",
    lineUserId: "line_user_id",
    latitude: "latitude",
    longitude: "longitude",
    isActive: "is_active",
  });

export class MariaDbWasteServiceUserRepository {
  constructor({ database }) {
    if (!database) {
      throw new TypeError(
        "MariaDbWasteServiceUserRepository requires database",
      );
    }

    this.database = database;
  }

  transaction(work) {
    return this.database.transaction(work);
  }

  async list({
    routeId = null,
    search = null,
  } = {}) {
    const terms = [];
    const values = [];

    if (routeId) {
      terms.push("u.route_id = ?");
      values.push(routeId);
    }

    if (search) {
      terms.push(
        `(u.service_no LIKE ?
          OR u.full_name LIKE ?
          OR u.house_no LIKE ?)`,
      );

      values.push(
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
      );
    }

    const [rows] =
      await this.database.execute(
        `SELECT
           u.id,
           u.service_no AS serviceNo,
           u.full_name AS fullName,
           u.phone,
           u.house_no AS houseNo,
           u.village_id AS villageId,
           v.village_no AS villageNo,
           v.name_th AS villageName,
           u.address_detail AS addressDetail,
           u.line_user_id AS lineUserId,
           u.route_id AS routeId,
           r.route_name AS routeName,
           u.route_assignment_status AS routeAssignmentStatus,
           u.route_assignment_distance_m AS routeAssignmentDistanceM,
           u.route_assigned_at AS routeAssignedAt,
           u.latitude,
           u.longitude,
           u.is_active AS isActive
         FROM waste_service_users u
         INNER JOIN villages v
           ON v.id = u.village_id
         LEFT JOIN waste_routes r
           ON r.id = u.route_id
         ${
           terms.length
             ? `WHERE ${terms.join(" AND ")}`
             : ""
         }
         ORDER BY
           u.is_active DESC,
           v.village_no,
           u.house_no`,
        values,
      );

    return rows.map((row) => ({
      ...row,
      isActive:
        asBoolean(row.isActive),
    }));
  }

  async findById(
    id,
    {
      database = this.database,
      lock = false,
    } = {},
  ) {
    const [rows] =
      await database.execute(
        `SELECT
           u.id,
           u.service_no AS serviceNo,
           u.full_name AS fullName,
           u.phone,
           u.house_no AS houseNo,
           u.village_id AS villageId,
           v.village_no AS villageNo,
           v.name_th AS villageName,
           u.address_detail AS addressDetail,
           u.line_user_id AS lineUserId,
           u.route_id AS routeId,
           r.route_name AS routeName,
           u.route_assignment_status AS routeAssignmentStatus,
           u.route_assignment_distance_m AS routeAssignmentDistanceM,
           u.route_assigned_at AS routeAssignedAt,
           u.latitude,
           u.longitude,
           u.is_active AS isActive
         FROM waste_service_users u
         INNER JOIN villages v
           ON v.id = u.village_id
         LEFT JOIN waste_routes r
           ON r.id = u.route_id
         WHERE u.id = ?
         LIMIT 1
         ${lock ? "FOR UPDATE" : ""}`,
        [id],
      );

    if (!rows[0]) return null;

    return {
      ...rows[0],
      isActive:
        asBoolean(rows[0].isActive),
    };
  }

  async create(database, user) {
    await database.execute(
      `INSERT INTO waste_service_users
        (
          id,
          service_no,
          full_name,
          phone,
          house_no,
          village_id,
          address_detail,
          line_user_id,
          route_id,
          route_assignment_status,
          route_assigned_at,
          route_assigned_by,
          latitude,
          longitude,
          is_active
        )
       VALUES (
         ?, ?, ?, ?, ?, ?, ?, ?,
         NULL,
         'UNASSIGNED',
         NULL,
         NULL,
         ?, ?, ?
       )`,
      [
        user.id,
        user.serviceNo,
        user.fullName,
        user.phone,
        user.houseNo,
        user.villageId,
        user.addressDetail,
        user.lineUserId,
        user.latitude,
        user.longitude,
        user.isActive,
      ],
    );

    return user;
  }

  async update(
    database,
    id,
    changes,
  ) {
    const entries =
      Object.entries(changes).filter(
        ([key]) =>
          UPDATE_FIELDS[key],
      );

    if (!entries.length) {
      return false;
    }

    const values = [];

    const sets =
      entries.map(
        ([key, value]) => {
          values.push(value);

          return `${
            UPDATE_FIELDS[key]
          } = ?`;
        },
      );

    values.push(id);

    const [result] =
      await database.execute(
        `UPDATE waste_service_users
         SET ${sets.join(", ")}
         WHERE id = ?`,
        values,
      );

    return result.affectedRows > 0;
  }

  async syncRouteStop(
    database,
    serviceUserId,
  ) {
    const [rows] =
      await database.execute(
        `SELECT
           id,
           route_id AS routeId,
           full_name AS fullName,
           house_no AS houseNo,
           latitude,
           longitude,
           is_active AS isActive
         FROM waste_service_users
         WHERE id = ?
         FOR UPDATE`,
        [serviceUserId],
      );

    const user = rows[0];

    if (!user) return;

    const [existingRows] =
      await database.execute(
        `SELECT
           id,
           route_id AS routeId
         FROM waste_route_stops
         WHERE service_user_id = ?
           AND is_active = 1
         FOR UPDATE`,
        [serviceUserId],
      );

    const existing =
      existingRows[0];

    if (
      !user.routeId ||
      !asBoolean(user.isActive)
    ) {
      if (existing) {
        await database.execute(
          `UPDATE waste_route_stops
           SET is_active = 0
           WHERE id = ?`,
          [existing.id],
        );
      }

      return;
    }

    if (
      existing?.routeId ===
      user.routeId
    ) {
      await database.execute(
        `UPDATE waste_route_stops
         SET
           stop_name = ?,
           latitude = ?,
           longitude = ?,
           is_active = 1
         WHERE id = ?`,
        [
          `บ้าน ${user.houseNo} · ${user.fullName}`,
          user.latitude,
          user.longitude,
          existing.id,
        ],
      );

      return;
    }

    if (existing) {
      await database.execute(
        `UPDATE waste_route_stops
         SET is_active = 0
         WHERE id = ?`,
        [existing.id],
      );
    }

    const [[sequence]] =
      await database.execute(
        `SELECT
           COALESCE(
             MAX(sequence_no),
             0
           ) + 1 AS nextSequence
         FROM waste_route_stops
         WHERE route_id = ?`,
        [user.routeId],
      );

    await database.execute(
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
        user.routeId,
        serviceUserId,
        Number(
          sequence.nextSequence || 1,
        ),
        `บ้าน ${user.houseNo} · ${user.fullName}`,
        user.latitude,
        user.longitude,
      ],
    );
  }

  async removeCitizenLineSession(
    database,
    lineUserId,
  ) {
    if (!lineUserId) return;

    await database.execute(
      `DELETE FROM waste_line_sessions
       WHERE channel_type = 'CITIZEN'
         AND line_user_id = ?`,
      [lineUserId],
    );
  }

  async loadRouteGeojson(
    database,
    routeId,
  ) {
    if (!routeId) return null;

    const [rows] =
      await database.execute(
        `SELECT
           CAST(
             route_geojson AS CHAR
           ) AS routeGeojson
         FROM waste_routes
         WHERE id = ?
         FOR UPDATE`,
        [routeId],
      );

    return parseJson(
      rows[0]?.routeGeojson,
    );
  }

  async saveRouteGeojson(
    database,
    routeId,
    routeGeojson,
  ) {
    if (!routeId || !routeGeojson) {
      return;
    }

    await database.execute(
      `UPDATE waste_routes
       SET route_geojson = ?
       WHERE id = ?`,
      [
        JSON.stringify(routeGeojson),
        routeId,
      ],
    );
  }

  async historyCounts(
    database,
    id,
  ) {
    const [[row]] =
      await database.execute(
        `SELECT
           (
             SELECT COUNT(*)
             FROM waste_service_charges
             WHERE service_user_id = u.id
           ) AS chargeCount,
           (
             SELECT COUNT(*)
             FROM waste_stop_confirmations c
             INNER JOIN waste_route_stops s
               ON s.id = c.stop_id
             WHERE s.service_user_id = u.id
           ) AS confirmationCount
         FROM waste_service_users u
         WHERE u.id = ?`,
        [id],
      );

    return {
      chargeCount:
        Number(row?.chargeCount || 0),
      confirmationCount:
        Number(
          row?.confirmationCount || 0,
        ),
    };
  }

  async deleteRouteStops(
    database,
    id,
  ) {
    await database.execute(
      `DELETE FROM waste_route_stops
       WHERE service_user_id = ?`,
      [id],
    );
  }

  async remove(database, id) {
    const [result] =
      await database.execute(
        `DELETE FROM waste_service_users
         WHERE id = ?`,
        [id],
      );

    return result.affectedRows > 0;
  }

  async listActiveRoutesForSuggestions() {
    const [rows] =
      await this.database.execute(
        `SELECT
           id,
           route_code AS routeCode,
           route_name AS routeName,
           CAST(
             route_geojson AS CHAR
           ) AS routeGeojson
         FROM waste_routes
         WHERE is_active = 1
         ORDER BY route_code`,
      );

    return rows.map((row) => ({
      ...row,
      routeGeojson:
        parseJson(row.routeGeojson),
    }));
  }
}
