export class MariaDbWasteDriverLinkRepository {
  constructor({ database }) {
    if (!database) {
      throw new TypeError(
        "MariaDbWasteDriverLinkRepository requires database",
      );
    }

    this.database =
      database;
  }

  transaction(work) {
    return this.database
      .transaction(work);
  }

  async findDriver(id) {
    const [rows] =
      await this.database.execute(
        `SELECT
           id,
           full_name AS fullName,
           is_active AS isActive
         FROM waste_drivers
         WHERE id = ?
         LIMIT 1`,
        [id],
      );

    if (!rows[0]) {
      return null;
    }

    return {
      ...rows[0],
      isActive:
        Boolean(
          Number(
            rows[0].isActive,
          ),
        ),
    };
  }

  async activeCodeExists(
    codeHash,
  ) {
    const [rows] =
      await this.database.execute(
        `SELECT id
         FROM waste_driver_link_codes
         WHERE code_hash = ?
           AND used_at IS NULL
           AND expires_at > NOW()
         LIMIT 1`,
        [codeHash],
      );

    return Boolean(
      rows.length,
    );
  }

  async replaceActiveCode(
    database,
    {
      id,
      driverId,
      codeHash,
      expiresInMinutes,
      createdBy,
    },
  ) {
    await database.execute(
      `UPDATE waste_driver_link_codes
       SET used_at = NOW()
       WHERE driver_id = ?
         AND used_at IS NULL`,
      [driverId],
    );

    await database.execute(
      `INSERT INTO waste_driver_link_codes
        (
          id,
          driver_id,
          code_hash,
          expires_at,
          created_by
        )
       VALUES (
         ?, ?, ?,
         DATE_ADD(
           NOW(),
           INTERVAL ? MINUTE
         ),
         ?
       )`,
      [
        id,
        driverId,
        codeHash,
        expiresInMinutes,
        createdBy,
      ],
    );
  }
}
