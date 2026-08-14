export class MariaDbWastePlanResourceRepository {
  constructor({ database }) {
    if (!database) {
      throw new TypeError(
        "MariaDbWastePlanResourceRepository requires database",
      );
    }

    this.database = database;
  }

  async findRouteContext(routeId) {
    const [rows] = await this.database.execute(
      `SELECT r.id,
              r.is_active AS isActive,
              CAST(r.route_geojson AS CHAR) AS routeGeojson,
              COUNT(CASE WHEN s.is_active = 1 THEN 1 END) AS activeStopCount
       FROM waste_routes r
       LEFT JOIN waste_route_stops s ON s.route_id = r.id
       WHERE r.id = ?
       GROUP BY r.id, r.is_active, r.route_geojson`,
      [routeId],
    );

    const row = rows[0];
    if (!row) return null;

    return {
      ...row,
      routeGeojson: row.routeGeojson
        ? JSON.parse(row.routeGeojson)
        : null,
      activeStopCount: Number(row.activeStopCount || 0),
    };
  }

  async findVehicle(vehicleId) {
    const [rows] = await this.database.execute(
      `SELECT id, status
       FROM waste_vehicles
       WHERE id = ?`,
      [vehicleId],
    );

    return rows[0] || null;
  }

  async findDriver(driverId) {
    const [rows] = await this.database.execute(
      `SELECT id, is_active AS isActive
       FROM waste_drivers
       WHERE id = ?`,
      [driverId],
    );

    return rows[0] || null;
  }

  async listVehicles() {
    const [rows] = await this.database.execute(
      `SELECT id,
              vehicle_code AS vehicleCode,
              registration_no AS registrationNo,
              vehicle_type AS vehicleType,
              status
       FROM waste_vehicles
       ORDER BY vehicle_code`,
    );

    return rows;
  }

  async listDrivers() {
    const [rows] = await this.database.execute(
      `SELECT id,
              full_name AS fullName,
              is_active AS isActive
       FROM waste_drivers
       ORDER BY is_active DESC, full_name`,
    );

    return rows;
  }

  async findConflicts({
    scheduledDate,
    startAt,
    endAt,
    excludePlanId = null,
    statuses,
  }) {
    const placeholders = statuses.map(() => "?").join(",");

    const [rows] = await this.database.execute(
      `SELECT p.id,
              p.plan_no AS planNo,
              p.vehicle_id AS vehicleId,
              p.driver_id AS driverId,
              DATE_FORMAT(p.scheduled_start_at, '%H:%i') AS startTime,
              DATE_FORMAT(p.scheduled_end_at, '%H:%i') AS endTime
       FROM waste_operation_plans p
       WHERE p.scheduled_date = ?
         AND p.status IN (${placeholders})
         AND (? IS NULL OR p.id <> ?)
         AND (
           ? IS NULL
           OR ? IS NULL
           OR p.scheduled_start_at IS NULL
           OR p.scheduled_end_at IS NULL
           OR (? < p.scheduled_end_at AND ? > p.scheduled_start_at)
         )
       ORDER BY p.scheduled_start_at, p.plan_no`,
      [
        scheduledDate,
        ...statuses,
        excludePlanId,
        excludePlanId,
        startAt,
        endAt,
        startAt,
        endAt,
      ],
    );

    return rows;
  }

  async findAssignmentConflict({
    scheduledDate,
    vehicleId,
    driverId,
    startAt,
    endAt,
    excludePlanId = null,
    statuses,
  }) {
    const placeholders = statuses.map(() => "?").join(",");

    const [rows] = await this.database.execute(
      `SELECT p.id,
              p.plan_no AS planNo,
              CASE
                WHEN p.vehicle_id = ? THEN 'VEHICLE'
                ELSE 'DRIVER'
              END AS conflictType
       FROM waste_operation_plans p
       WHERE p.scheduled_date = ?
         AND p.status IN (${placeholders})
         AND (? IS NULL OR p.id <> ?)
         AND (p.vehicle_id = ? OR p.driver_id = ?)
         AND (
           ? IS NULL
           OR ? IS NULL
           OR p.scheduled_start_at IS NULL
           OR p.scheduled_end_at IS NULL
           OR (? < p.scheduled_end_at AND ? > p.scheduled_start_at)
         )
       LIMIT 1`,
      [
        vehicleId,
        scheduledDate,
        ...statuses,
        excludePlanId,
        excludePlanId,
        vehicleId,
        driverId,
        startAt,
        endAt,
        startAt,
        endAt,
      ],
    );

    return rows[0] || null;
  }
}