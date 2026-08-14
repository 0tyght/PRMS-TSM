const UPDATE_FIELDS = Object.freeze({
  fullName: "full_name",
  phone: "phone",
  lineUserId: "line_user_id",
  isActive: "is_active",
});

export class MariaDbWasteDriverRepository {
  constructor({ database }) {
    if (!database) {
      throw new TypeError(
        "MariaDbWasteDriverRepository requires database",
      );
    }

    this.database = database;
  }

  async list() {
    const [rows] = await this.database.execute(
      `SELECT id,
              full_name AS fullName,
              phone,
              line_user_id AS lineUserId,
              is_active AS isActive
       FROM waste_drivers
       ORDER BY is_active DESC, full_name`,
    );

    return rows;
  }

  async findById(id) {
    const [rows] = await this.database.execute(
      `SELECT id,
              full_name AS fullName,
              phone,
              line_user_id AS lineUserId,
              is_active AS isActive
       FROM waste_drivers
       WHERE id = ?
       LIMIT 1`,
      [id],
    );

    return rows[0] || null;
  }

  async create(driver) {
    await this.database.execute(
      `INSERT INTO waste_drivers
        (
          id,
          full_name,
          phone,
          line_user_id,
          is_active
        )
       VALUES (?, ?, ?, ?, ?)`,
      [
        driver.id,
        driver.fullName,
        driver.phone,
        driver.lineUserId,
        driver.isActive,
      ],
    );

    return driver;
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
      `UPDATE waste_drivers
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
           WHERE driver_id = ?
         ) +
         (
           SELECT COUNT(*)
           FROM waste_incidents
           WHERE driver_id = ?
         ) AS usageCount`,
      [id, id],
    );

    return Number(row?.usageCount || 0);
  }

  async remove(id) {
    const [result] = await this.database.execute(
      `DELETE FROM waste_drivers WHERE id = ?`,
      [id],
    );

    return result.affectedRows > 0;
  }
}