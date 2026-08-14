const UPDATE_FIELDS = Object.freeze({
  vehicleCode: "vehicle_code",
  registrationNo: "registration_no",
  vehicleType: "vehicle_type",
  capacityKg: "capacity_kg",
  status: "status",
  note: "note",
});

export class MariaDbWasteVehicleRepository {
  constructor({ database }) {
    if (!database) {
      throw new TypeError(
        "MariaDbWasteVehicleRepository requires database",
      );
    }

    this.database = database;
  }

  async list({ status = null, search = null } = {}) {
    const terms = [];
    const values = [];

    if (status) {
      terms.push("status = ?");
      values.push(status);
    }

    if (search) {
      terms.push(
        "(vehicle_code LIKE ? OR registration_no LIKE ? OR vehicle_type LIKE ?)",
      );

      values.push(
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
      );
    }

    const [rows] = await this.database.execute(
      `SELECT id,
              vehicle_code AS vehicleCode,
              registration_no AS registrationNo,
              vehicle_type AS vehicleType,
              capacity_kg AS capacityKg,
              status,
              last_latitude AS lastLatitude,
              last_longitude AS lastLongitude,
              last_gps_at AS lastGpsAt,
              note
       FROM waste_vehicles
       ${terms.length ? `WHERE ${terms.join(" AND ")}` : ""}
       ORDER BY vehicle_code`,
      values,
    );

    return rows;
  }

  async findById(id) {
    const [rows] = await this.database.execute(
      `SELECT id,
              vehicle_code AS vehicleCode,
              registration_no AS registrationNo,
              vehicle_type AS vehicleType,
              capacity_kg AS capacityKg,
              status,
              last_latitude AS lastLatitude,
              last_longitude AS lastLongitude,
              last_gps_at AS lastGpsAt,
              note
       FROM waste_vehicles
       WHERE id = ?
       LIMIT 1`,
      [id],
    );

    return rows[0] || null;
  }

  async create(vehicle) {
    await this.database.execute(
      `INSERT INTO waste_vehicles
        (
          id,
          vehicle_code,
          registration_no,
          vehicle_type,
          capacity_kg,
          status,
          note
        )
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        vehicle.id,
        vehicle.vehicleCode,
        vehicle.registrationNo,
        vehicle.vehicleType,
        vehicle.capacityKg,
        vehicle.status,
        vehicle.note,
      ],
    );

    return vehicle;
  }

  async update(id, changes) {
    const entries = Object.entries(changes)
      .filter(([key]) => UPDATE_FIELDS[key]);

    if (!entries.length) {
      return false;
    }

    const values = [];

    const sets = entries.map(([key, value]) => {
      values.push(value);
      return `${UPDATE_FIELDS[key]} = ?`;
    });

    values.push(id);

    const [result] = await this.database.execute(
      `UPDATE waste_vehicles
       SET ${sets.join(", ")}
       WHERE id = ?`,
      values,
    );

    return result.affectedRows > 0;
  }

  async countUsage(id) {
    const [[row]] = await this.database.execute(
      `SELECT
         (
           SELECT COUNT(*)
           FROM waste_operation_plans
           WHERE vehicle_id = ?
         ) +
         (
           SELECT COUNT(*)
           FROM waste_incidents
           WHERE vehicle_id = ?
              OR replacement_vehicle_id = ?
         ) AS usageCount`,
      [id, id, id],
    );

    return Number(row?.usageCount || 0);
  }

  async remove(id) {
    const [result] = await this.database.execute(
      `DELETE FROM waste_vehicles WHERE id = ?`,
      [id],
    );

    return result.affectedRows > 0;
  }
}