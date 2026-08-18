import crypto from "node:crypto";

export class MariaDbWastePlanRepository {
  constructor({ database }) {
    if (!database) throw new TypeError("MariaDbWastePlanRepository requires database");
    this.database = database;
  }

  transaction(work) { return this.database.transaction(work); }

  async findPublicationContext(db, planId, { lock = false } = {}) {
    const [rows] = await db.execute(
      `SELECT p.id, p.plan_no AS planNo, DATE_FORMAT(p.scheduled_date, '%Y-%m-%d') AS scheduledDate,
              p.scheduled_start_at AS scheduledStartAt, p.scheduled_end_at AS scheduledEndAt,
              CASE
                WHEN p.scheduled_end_at IS NOT NULL
                  AND p.scheduled_end_at > NOW()
                THEN 1
                ELSE 0
              END AS scheduleWindowOpen,
              p.status, p.publication_status AS publicationStatus,
              p.publication_version AS publicationVersion, p.public_note AS publicNote,
              p.route_id AS routeId, r.route_code AS routeCode, r.route_name AS routeName,
              COUNT(CASE WHEN s.is_active = 1 THEN 1 END) AS activeStopCount
       FROM waste_operation_plans p
       INNER JOIN waste_routes r ON r.id = p.route_id
       LEFT JOIN waste_route_stops s ON s.route_id = p.route_id
       WHERE p.id = ?
       GROUP BY p.id, p.plan_no, p.scheduled_date, p.scheduled_start_at, p.scheduled_end_at,
                p.status, p.publication_status, p.publication_version, p.public_note,
                p.route_id, r.route_code, r.route_name${lock ? " FOR UPDATE" : ""}`,
      [planId],
    );
    return rows[0]
      ? {
          ...rows[0],
          activeStopCount: Number(rows[0].activeStopCount || 0),
          scheduleWindowOpen: Boolean(Number(rows[0].scheduleWindowOpen || 0)),
        }
      : null;
  }

  async countRecipients(db, routeId) {
    const [[row]] = await db.execute(
      `SELECT COUNT(*) AS linkedRecipients
       FROM waste_service_users
       WHERE route_id = ? AND is_active = 1 AND line_user_id IS NOT NULL AND line_user_id <> ''`,
      [routeId],
    );
    return Number(row?.linkedRecipients || 0);
  }

  async markPublished(db, { planId, version, publicNote, officerId }) {
    await db.execute(
      `UPDATE waste_operation_plans
       SET publication_status = 'PUBLISHED', publication_version = ?, public_note = ?,
           published_at = NOW(), published_by = ?, withdrawn_at = NULL, withdrawn_by = NULL
       WHERE id = ?`,
      [version, publicNote || null, officerId, planId],
    );
  }

  async markWithdrawn(db, { planId, officerId }) {
    await db.execute(
      `UPDATE waste_operation_plans
       SET publication_status = 'WITHDRAWN', withdrawn_at = NOW(), withdrawn_by = ?
       WHERE id = ?`,
      [officerId, planId],
    );
  }

  async enqueueRouteNotices(db, { plan, version, type, message }) {
    const [users] = await db.execute(
      `SELECT id, line_user_id AS lineUserId
       FROM waste_service_users
       WHERE route_id = ? AND is_active = 1 AND line_user_id IS NOT NULL AND line_user_id <> ''`,
      [plan.routeId],
    );
    for (const user of users) {
      await db.execute(
        `INSERT IGNORE INTO waste_line_notifications
          (id, line_user_id, service_user_id, plan_id, plan_version, notification_type, message_text)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [crypto.randomUUID(), user.lineUserId, user.id, plan.id, version, type, message],
      );
    }
    return users.length;
  }

  async publicationDeliverySummary(planId) {
    const [rows] = await this.database.execute(
      `SELECT notification_type AS notificationType, delivery_status AS deliveryStatus, COUNT(*) AS total
       FROM waste_line_notifications WHERE plan_id = ?
       GROUP BY notification_type, delivery_status`,
      [planId],
    );
    return rows.map((row) => ({ ...row, total: Number(row.total || 0) }));
  }
}
