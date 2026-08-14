import crypto from "node:crypto";

export class MariaDbAuditLogRepository {
  constructor({ database }) {
    if (!database) {
      throw new TypeError(
        "MariaDbAuditLogRepository requires database",
      );
    }

    this.database = database;
  }

  async record({
    userId,
    action,
    entityType,
    entityId,
    nextValue = null,
    ipAddress = null,
  }) {
    await this.database.execute(
      `INSERT INTO audit_logs
        (
          id,
          user_id,
          action,
          entity_type,
          entity_id,
          new_value,
          ip_address
        )
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        userId,
        action,
        entityType,
        entityId,
        JSON.stringify(nextValue),
        ipAddress || null,
      ],
    );
  }
}