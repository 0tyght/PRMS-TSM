function parseJson(value) {
  if (!value) {
    return null;
  }

  return typeof value ===
    "string"
      ? JSON.parse(value)
      : value;
}

function asBoolean(value) {
  return Boolean(Number(value));
}

export class MariaDbWasteDashboardRepository {
  constructor({ database }) {
    if (!database) {
      throw new TypeError(
        "MariaDbWasteDashboardRepository requires database",
      );
    }

    this.database = database;
  }

  async load(date) {
    const [
      [summaryRows],
      [activePlans],
      [incidents],
      [overdueRows],
      [routes],
    ] = await Promise.all([
      this.database.execute(
        `SELECT
           (
             SELECT COUNT(*)
             FROM waste_vehicles
             WHERE status = 'AVAILABLE'
           ) AS availableVehicles,

           (
             SELECT COUNT(*)
             FROM waste_vehicles
             WHERE status = 'MAINTENANCE'
           ) AS maintenanceVehicles,

           (
             SELECT COUNT(*)
             FROM waste_operation_plans
             WHERE scheduled_date = ?
               AND status = 'SCHEDULED'
           ) AS scheduledPlans,

           (
             SELECT COUNT(*)
             FROM waste_operation_plans
             WHERE scheduled_date = ?
               AND status = 'IN_PROGRESS'
           ) AS operatingPlans,

           (
             SELECT COUNT(*)
             FROM waste_operation_plans
             WHERE scheduled_date = ?
               AND status = 'COMPLETED'
           ) AS completedPlans,

           (
             SELECT COUNT(*)
             FROM waste_service_users
             WHERE is_active = 1
               AND route_id IS NULL
           ) AS unassignedServiceUsers,

           (
             SELECT COUNT(*)
             FROM waste_service_users
             WHERE is_active = 1
               AND (
                 latitude IS NULL
               OR longitude IS NULL
               )
           ) AS serviceUsersWithoutLocation,

           (
             SELECT COALESCE(SUM(
               (
                 SELECT COUNT(*)
                 FROM waste_route_stops s
                 WHERE s.route_id = p.route_id
                   AND s.is_active = 1
               )
             ), 0)
             FROM waste_operation_plans p
             WHERE p.scheduled_date = ?
               AND p.status <> 'CANCELLED'
           ) AS collectionStopTotal,

           (
             SELECT COUNT(*)
             FROM waste_stop_confirmations c
             INNER JOIN waste_operation_plans p
               ON p.id = c.plan_id
             WHERE p.scheduled_date = ?
               AND p.status <> 'CANCELLED'
               AND c.status = 'COLLECTED'
           ) AS collectedCollectionStops,

           (
             SELECT COUNT(*)
             FROM waste_incidents
             WHERE status <> 'RESOLVED'
           ) AS openIncidents`,
        [
          date,
          date,
          date,
          date,
          date,
        ],
      ),

      this.database.execute(
        `SELECT
           p.id,
           p.plan_no AS planNo,
           p.status,
           DATE_FORMAT(
             p.scheduled_date,
             '%Y-%m-%d'
           ) AS scheduledDate,
           r.id AS routeId,
           r.route_name AS routeName,
           v.vehicle_code AS vehicleCode,
           v.registration_no AS registrationNo,
           d.full_name AS driverName,
           v.last_latitude AS latitude,
           v.last_longitude AS longitude,
           v.last_gps_at AS lastGpsAt,

           (
             SELECT COUNT(*)
             FROM waste_route_stops s
             WHERE s.route_id = p.route_id
               AND s.is_active = 1
           ) AS stopTotal,

           (
             SELECT COUNT(*)
             FROM waste_stop_confirmations c
             WHERE c.plan_id = p.id
               AND c.status = 'COLLECTED'
           ) AS collectedStops

         FROM waste_operation_plans p

         INNER JOIN waste_routes r
           ON r.id = p.route_id

         INNER JOIN waste_vehicles v
           ON v.id = p.vehicle_id

         INNER JOIN waste_drivers d
           ON d.id = p.driver_id

         WHERE p.scheduled_date = ?

           AND p.status IN (
             'SCHEDULED',
             'IN_PROGRESS',
             'INTERRUPTED'
           )

         ORDER BY
           FIELD(
             p.status,
             'IN_PROGRESS',
             'INTERRUPTED',
             'SCHEDULED'
           ),
           p.scheduled_start_at,
           p.created_at`,
        [date],
      ),

      this.database.execute(
        `SELECT
           i.id,
           i.incident_type AS incidentType,
           i.status,
           i.description,
           i.happened_at AS happenedAt,
           p.plan_no AS planNo,
           v.vehicle_code AS vehicleCode
         FROM waste_incidents i
         LEFT JOIN waste_operation_plans p
           ON p.id = i.plan_id
         LEFT JOIN waste_vehicles v
           ON v.id = i.vehicle_id
         WHERE i.status <> 'RESOLVED'
         ORDER BY i.happened_at DESC
         LIMIT 6`,
      ),

      this.database.execute(
        `SELECT
           COUNT(*) AS total,
           COALESCE(
             SUM(amount),
             0
           ) AS amount
         FROM waste_service_charges
         WHERE status IN (
           'PENDING',
           'OVERDUE'
         )
           AND due_date < CURDATE()`,
      ),

      this.database.execute(
        `SELECT
           r.id,
           r.route_code AS routeCode,
           r.route_name AS routeName,
           r.description,
           CAST(
             r.route_geojson AS CHAR
           ) AS routeGeojson,
           r.is_active AS isActive,

           COUNT(
             DISTINCT s.id
           ) AS stopCount,

           COUNT(
             DISTINCT u.id
           ) AS serviceUserCount

         FROM waste_routes r

         LEFT JOIN waste_route_stops s
           ON s.route_id = r.id
          AND s.is_active = 1

         LEFT JOIN waste_service_users u
           ON u.route_id = r.id
          AND u.is_active = 1

         WHERE r.is_active = 1

         GROUP BY
           r.id,
           r.route_code,
           r.route_name,
           r.description,
           r.route_geojson,
           r.is_active

         ORDER BY r.route_code`,
      ),
    ]);

    const summary =
      summaryRows[0] || {};

    const overdue =
      overdueRows[0] || {};

    return {
      date,

      summary: {
        availableVehicles:
          Number(
            summary.availableVehicles ||
            0,
          ),

        maintenanceVehicles:
          Number(
            summary.maintenanceVehicles ||
            0,
          ),

        scheduledPlans:
          Number(
            summary.scheduledPlans ||
            0,
          ),

        operatingPlans:
          Number(
            summary.operatingPlans ||
            0,
          ),

        completedPlans:
          Number(
            summary.completedPlans ||
            0,
          ),

        unassignedServiceUsers:
          Number(
            summary.unassignedServiceUsers ||
            0,
          ),

        serviceUsersWithoutLocation:
          Number(
            summary.serviceUsersWithoutLocation ||
            0,
          ),

        collectionStopTotal:
          Number(
            summary.collectionStopTotal ||
            0,
          ),

        collectedCollectionStops:
          Number(
            summary.collectedCollectionStops ||
            0,
          ),

        openIncidents:
          Number(
            summary.openIncidents ||
            0,
          ),

        overdueCharges:
          Number(
            overdue.total || 0,
          ),

        overdueAmount:
          Number(
            overdue.amount || 0,
          ),
      },

      activePlans:
        activePlans.map(
          (row) => ({
            ...row,
            stopTotal:
              Number(
                row.stopTotal ||
                0,
              ),
            collectedStops:
              Number(
                row.collectedStops ||
                0,
              ),
          }),
        ),

      routes:
        routes.map(
          (row) => ({
            id: row.id,
            routeCode:
              row.routeCode,
            routeName:
              row.routeName,
            description:
              row.description,
            routeGeojson:
              parseJson(
                row.routeGeojson,
              ),
            isActive:
              asBoolean(
                row.isActive,
              ),
            stopCount:
              Number(
                row.stopCount ||
                0,
              ),
            serviceUserCount:
              Number(
                row.serviceUserCount ||
                0,
              ),
          }),
        ),

      incidents,
    };
  }
}
