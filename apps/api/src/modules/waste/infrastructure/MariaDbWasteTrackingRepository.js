function parseJson(value) {
  if (!value) return null;

  return typeof value === "string"
    ? JSON.parse(value)
    : value;
}

export class MariaDbWasteTrackingRepository {
  constructor({ database }) {
    if (!database) {
      throw new TypeError(
        "MariaDbWasteTrackingRepository requires database",
      );
    }

    this.database = database;
  }

  transaction(work) {
    return this.database.transaction(
      work,
    );
  }

  async findPlanForClaims(
    claims,
    {
      database = this.database,
      lock = false,
    } = {},
  ) {
    const [rows] =
      await database.execute(
        `SELECT
           p.id,
           p.plan_no AS planNo,
           p.status,
           p.vehicle_id AS vehicleId,
           p.driver_id AS driverId,
           DATE_FORMAT(
             p.scheduled_date,
             '%Y-%m-%d'
           ) AS scheduledDate,
           p.scheduled_start_at AS scheduledStartAt,
           p.scheduled_end_at AS scheduledEndAt,
           r.route_code AS routeCode,
           r.route_name AS routeName,
           CAST(
             r.route_geojson AS CHAR
           ) AS routeGeojson,
           v.vehicle_code AS vehicleCode,
           v.registration_no AS registrationNo,
           v.last_latitude AS lastLatitude,
           v.last_longitude AS lastLongitude,
           v.last_gps_at AS lastGpsAt,
           d.full_name AS driverName
         FROM waste_operation_plans p
         INNER JOIN waste_routes r
           ON r.id = p.route_id
         INNER JOIN waste_vehicles v
           ON v.id = p.vehicle_id
         INNER JOIN waste_drivers d
           ON d.id = p.driver_id
         WHERE p.id = ?
           AND p.driver_id = ?
           AND d.line_user_id = ?
         LIMIT 1
         ${lock ? "FOR UPDATE" : ""}`,
        [
          claims.planId,
          claims.driverId,
          claims.lineUserId,
        ],
      );

    if (!rows[0]) {
      return null;
    }

    return {
      ...rows[0],
      routeGeojson:
        parseJson(
          rows[0].routeGeojson,
        ),
    };
  }

  async findLatestLocation(
    database,
    planId,
  ) {
    const [rows] =
      await database.execute(
        `SELECT
           recorded_at AS recordedAt
         FROM waste_location_logs
         WHERE plan_id = ?
         ORDER BY recorded_at DESC
         LIMIT 1`,
        [planId],
      );

    return rows[0] || null;
  }

  async insertLocation(
    database,
    {
      planId,
      latitude,
      longitude,
      accuracyM = null,
      speedKph = null,
      recordedAt,
    },
  ) {
    await database.execute(
      `INSERT INTO waste_location_logs
        (
          plan_id,
          latitude,
          longitude,
          accuracy_m,
          speed_kph,
          recorded_at,
          source
        )
       VALUES (
         ?, ?, ?, ?, ?, ?, 'LINE'
       )`,
      [
        planId,
        latitude,
        longitude,
        accuracyM,
        speedKph,
        recordedAt,
      ],
    );
  }

  async updateVehicleLocation(
    database,
    {
      vehicleId,
      latitude,
      longitude,
      recordedAt,
    },
  ) {
    await database.execute(
      `UPDATE waste_vehicles
       SET
         last_latitude = ?,
         last_longitude = ?,
         last_gps_at = ?
       WHERE id = ?`,
      [
        latitude,
        longitude,
        recordedAt,
        vehicleId,
      ],
    );
  }

  async getPlanTracking(planId) {
    const [
      [planRows],
      [locations],
      [stops],
    ] = await Promise.all([
      this.database.execute(
        `SELECT
           p.id,
           p.plan_no AS planNo,
           p.status,
           r.route_name AS routeName,
           CAST(
             r.route_geojson AS CHAR
           ) AS routeGeojson,
           v.vehicle_code AS vehicleCode,
           v.last_latitude AS latitude,
           v.last_longitude AS longitude,
           v.last_gps_at AS lastGpsAt
         FROM waste_operation_plans p
         INNER JOIN waste_routes r
           ON r.id = p.route_id
         INNER JOIN waste_vehicles v
           ON v.id = p.vehicle_id
         WHERE p.id = ?`,
        [planId],
      ),

      this.database.execute(
        `SELECT
           latitude,
           longitude,
           accuracy_m AS accuracyM,
           speed_kph AS speedKph,
           recorded_at AS recordedAt,
           source
         FROM waste_location_logs
         WHERE plan_id = ?
         ORDER BY recorded_at DESC
         LIMIT 500`,
        [planId],
      ),

      this.database.execute(
        `SELECT
           s.id,
           s.sequence_no AS sequenceNo,
           s.stop_name AS stopName,
           s.latitude,
           s.longitude,
           c.status AS confirmationStatus,
           c.confirmed_at AS confirmedAt
         FROM waste_route_stops s
         INNER JOIN waste_operation_plans p
           ON p.route_id = s.route_id
         LEFT JOIN waste_stop_confirmations c
           ON c.stop_id = s.id
          AND c.plan_id = p.id
         WHERE p.id = ?
           AND s.is_active = 1
         ORDER BY s.sequence_no`,
        [planId],
      ),
    ]);

    if (!planRows[0]) {
      return null;
    }

    return {
      ...planRows[0],
      routeGeojson:
        parseJson(
          planRows[0].routeGeojson,
        ),
      locations:
        locations.reverse(),
      stops,
    };
  }
}
