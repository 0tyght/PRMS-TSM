export class MariaDbWasteIncidentRepository {
  constructor({ database }) {
    if (!database) {
      throw new TypeError(
        "MariaDbWasteIncidentRepository requires database",
      );
    }

    this.database = database;
  }

  async list({
    status = null,
  } = {}) {
    const [rows] =
      await this.database.execute(
        `SELECT
           i.id,
           i.plan_id AS planId,
           p.plan_no AS planNo,
           i.vehicle_id AS vehicleId,
           v.vehicle_code AS vehicleCode,
           i.replacement_vehicle_id AS replacementVehicleId,
           rv.vehicle_code AS replacementVehicleCode,
           i.driver_id AS driverId,
           d.full_name AS driverName,
           i.incident_type AS incidentType,
           i.status,
           i.description,
           i.happened_at AS happenedAt,
           i.resolved_at AS resolvedAt,
           i.resolution_note AS resolutionNote
         FROM waste_incidents i
         LEFT JOIN waste_operation_plans p
           ON p.id = i.plan_id
         LEFT JOIN waste_vehicles v
           ON v.id = i.vehicle_id
         LEFT JOIN waste_vehicles rv
           ON rv.id =
              i.replacement_vehicle_id
         LEFT JOIN waste_drivers d
           ON d.id = i.driver_id
         ${
           status
             ? "WHERE i.status = ?"
             : ""
         }
         ORDER BY i.happened_at DESC`,
        status ? [status] : [],
      );

    return rows;
  }

  async findById(id) {
    const [rows] =
      await this.database.execute(
        `SELECT
           i.id,
           i.plan_id AS planId,
           p.plan_no AS planNo,
           i.vehicle_id AS vehicleId,
           v.vehicle_code AS vehicleCode,
           i.replacement_vehicle_id AS replacementVehicleId,
           rv.vehicle_code AS replacementVehicleCode,
           i.driver_id AS driverId,
           d.full_name AS driverName,
           i.incident_type AS incidentType,
           i.status,
           i.description,
           i.happened_at AS happenedAt,
           i.resolved_at AS resolvedAt,
           i.resolution_note AS resolutionNote
         FROM waste_incidents i
         LEFT JOIN waste_operation_plans p
           ON p.id = i.plan_id
         LEFT JOIN waste_vehicles v
           ON v.id = i.vehicle_id
         LEFT JOIN waste_vehicles rv
           ON rv.id =
              i.replacement_vehicle_id
         LEFT JOIN waste_drivers d
           ON d.id = i.driver_id
         WHERE i.id = ?
         LIMIT 1`,
        [id],
      );

    return rows[0] || null;
  }

  async create(incident) {
    await this.database.execute(
      `INSERT INTO waste_incidents
        (
          id,
          plan_id,
          vehicle_id,
          driver_id,
          incident_type,
          description,
          happened_at
        )
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        incident.id,
        incident.planId,
        incident.vehicleId,
        incident.driverId,
        incident.incidentType,
        incident.description,
        incident.happenedAt,
      ],
    );

    return incident;
  }

  async update(id, changes) {
    const [result] =
      await this.database.execute(
        `UPDATE waste_incidents
         SET
           status = ?,
           replacement_vehicle_id = ?,
           resolution_note = ?,
           resolved_at =
             CASE
               WHEN ? = 'RESOLVED'
               THEN NOW()
               ELSE resolved_at
             END
         WHERE id = ?`,
        [
          changes.status,
          changes.replacementVehicleId,
          changes.resolutionNote,
          changes.status,
          id,
        ],
      );

    return result.affectedRows > 0;
  }
}
