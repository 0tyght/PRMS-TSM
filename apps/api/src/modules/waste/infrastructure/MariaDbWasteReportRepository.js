export class MariaDbWasteReportRepository {
  constructor({ database }) {
    if (!database) {
      throw new TypeError(
        "MariaDbWasteReportRepository requires database",
      );
    }

    this.database =
      database;
  }

  async operations({
    from = null,
    to = null,
  } = {}) {
    const conditions = [];
    const values = [];

    if (from) {
      conditions.push(
        "p.scheduled_date >= ?",
      );

      values.push(from);
    }

    if (to) {
      conditions.push(
        "p.scheduled_date <= ?",
      );

      values.push(to);
    }

    const [rows] =
      await this.database.execute(
        `SELECT
           p.plan_no AS planNo,
           DATE_FORMAT(
             p.scheduled_date,
             '%Y-%m-%d'
           ) AS scheduledDate,
           r.route_name AS routeName,
           v.vehicle_code AS vehicleCode,
           d.full_name AS driverName,
           p.status,

           (
             SELECT COUNT(*)
             FROM waste_route_stops s
             WHERE
               s.route_id =
                 p.route_id
               AND s.is_active = 1
           ) AS stopTotal,

           (
             SELECT COUNT(*)
             FROM waste_stop_confirmations c
             WHERE
               c.plan_id = p.id
               AND c.status =
                 'COLLECTED'
           ) AS collectedStops

         FROM waste_operation_plans p

         INNER JOIN waste_routes r
           ON r.id = p.route_id

         INNER JOIN waste_vehicles v
           ON v.id = p.vehicle_id

         INNER JOIN waste_drivers d
           ON d.id = p.driver_id

         ${
           conditions.length
             ? `WHERE ${conditions.join(
                 " AND ",
               )}`
             : ""
         }

         ORDER BY
           p.scheduled_date DESC,
           p.plan_no`,
        values,
      );

    return rows.map(
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
    );
  }

  async billing({
    billingPeriod = null,
  } = {}) {
    const [rows] =
      await this.database.execute(
        `SELECT
           DATE_FORMAT(
             c.billing_period,
             '%Y-%m-%d'
           ) AS billingPeriod,
           c.status,
           COUNT(*) AS count,
           COALESCE(
             SUM(c.amount),
             0
           ) AS amount
         FROM waste_service_charges c
         ${
           billingPeriod
             ? "WHERE c.billing_period = ?"
             : ""
         }
         GROUP BY
           c.billing_period,
           c.status
         ORDER BY
           c.billing_period DESC,
           c.status`,
        billingPeriod
          ? [billingPeriod]
          : [],
      );

    return rows.map(
      (row) => ({
        ...row,
        count:
          Number(row.count),
        amount:
          Number(row.amount),
      }),
    );
  }
}
