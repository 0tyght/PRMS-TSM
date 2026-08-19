function asDateTime(value) {
  return value
    ? new Date(value)
    : null;
}

function asBoolean(value) {
  return Boolean(Number(value));
}

const UPDATE_FIELDS =
  Object.freeze({
    planNo: "plan_no",
    scheduledDate:
      "scheduled_date",
    routeId: "route_id",
    vehicleId:
      "vehicle_id",
    driverId:
      "driver_id",
    scheduledStartAt:
      "scheduled_start_at",
    scheduledEndAt:
      "scheduled_end_at",
    note: "note",
  });

const NUMERIC_FIELDS =
  Object.freeze([
    "publicationVersion",
    "stopTotal",
    "collectedStops",
    "lineRecipientCount",
    "lineSentCount",
    "linePendingCount",
    "lineFailedCount",
  ]);

function mapPlan(row) {
  if (!row) return null;

  const mapped = {
    ...row,
  };

  for (
    const field of NUMERIC_FIELDS
  ) {
    mapped[field] =
      Number(
        row[field] || 0,
      );
  }

  return mapped;
}

export class MariaDbWastePlanAdminRepository {
  constructor({ database }) {
    if (!database) {
      throw new TypeError(
        "MariaDbWastePlanAdminRepository requires database",
      );
    }

    this.database = database;
  }

  transaction(work) {
    return this.database.transaction(
      work,
    );
  }

  async list({
    date = null,
  } = {}) {
    const [rows] =
      await this.database.execute(
        `SELECT
           p.id,
           p.plan_no AS planNo,
           DATE_FORMAT(
             p.scheduled_date,
             '%Y-%m-%d'
           ) AS scheduledDate,
           p.status,
           p.publication_status AS publicationStatus,
           p.publication_version AS publicationVersion,
           p.public_note AS publicNote,
           p.readiness_confirmed_at AS readinessConfirmedAt,
           p.readiness_confirmed_by AS readinessConfirmedBy,
           p.published_at AS publishedAt,
           p.withdrawn_at AS withdrawnAt,
           p.scheduled_start_at AS scheduledStartAt,
           p.scheduled_end_at AS scheduledEndAt,
           p.actual_start_at AS actualStartAt,
           p.actual_end_at AS actualEndAt,
           p.note,
           r.id AS routeId,
           r.route_name AS routeName,
           v.id AS vehicleId,
           v.vehicle_code AS vehicleCode,
           d.id AS driverId,
           d.full_name AS driverName,

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
           ) AS collectedStops,

           (
             SELECT COUNT(*)
             FROM waste_service_users u
             WHERE u.route_id = p.route_id
               AND u.is_active = 1
               AND u.line_user_id IS NOT NULL
               AND u.line_user_id <> ''
           ) AS lineRecipientCount,

           (
             SELECT COUNT(*)
             FROM waste_line_notifications n
             WHERE n.plan_id = p.id
               AND n.notification_type =
                 'SCHEDULE_PUBLISHED'
               AND n.delivery_status =
                 'SENT'
           ) AS lineSentCount,

           (
             SELECT COUNT(*)
             FROM waste_line_notifications n
             WHERE n.plan_id = p.id
               AND n.notification_type =
                 'SCHEDULE_PUBLISHED'
               AND n.delivery_status IN (
                 'PENDING',
                 'PROCESSING'
               )
           ) AS linePendingCount,

           (
             SELECT COUNT(*)
             FROM waste_line_notifications n
             WHERE n.plan_id = p.id
               AND n.notification_type =
                 'SCHEDULE_PUBLISHED'
               AND n.delivery_status =
                 'FAILED'
           ) AS lineFailedCount

         FROM waste_operation_plans p

         INNER JOIN waste_routes r
           ON r.id = p.route_id

         INNER JOIN waste_vehicles v
           ON v.id = p.vehicle_id

         INNER JOIN waste_drivers d
           ON d.id = p.driver_id

         ${
           date
             ? "WHERE p.scheduled_date = ?"
             : ""
         }

         ORDER BY
           p.scheduled_date DESC,
           p.scheduled_start_at,
           p.created_at DESC`,
        date
          ? [date]
          : [],
      );

    return rows.map(mapPlan);
  }

  async findEditableContext(
    database,
    id,
    {
      lock = false,
    } = {},
  ) {
    const [rows] =
      await database.execute(
        `SELECT
           p.id,
           p.status,
           p.publication_status AS publicationStatus,
           p.publication_version AS publicationVersion,
           p.readiness_confirmed_at AS readinessConfirmedAt,
           p.readiness_confirmed_by AS readinessConfirmedBy,
           p.plan_no AS planNo,
           DATE_FORMAT(
             p.scheduled_date,
             '%Y-%m-%d'
           ) AS scheduledDate,
           p.route_id AS routeId,
           p.vehicle_id AS vehicleId,
           p.driver_id AS driverId,
           p.scheduled_start_at AS scheduledStartAt,
           p.scheduled_end_at AS scheduledEndAt,
           p.note
         FROM waste_operation_plans p
         WHERE p.id = ?
         LIMIT 1
         ${lock ? "FOR UPDATE" : ""}`,
        [id],
      );

    return mapPlan(
      rows[0],
    );
  }

  async create(
    database,
    {
      id,
      planNo,
      scheduledDate,
      routeId,
      vehicleId,
      driverId,
      scheduledStartAt,
      scheduledEndAt,
      note,
      createdBy,
    },
  ) {
    await database.execute(
      `INSERT INTO waste_operation_plans
        (
          id,
          plan_no,
          scheduled_date,
          route_id,
          vehicle_id,
          driver_id,
          scheduled_start_at,
          scheduled_end_at,
          note,
          created_by
        )
       VALUES (
         ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       )`,
      [
        id,
        planNo,
        scheduledDate,
        routeId,
        vehicleId,
        driverId,
        asDateTime(
          scheduledStartAt,
        ),
        asDateTime(
          scheduledEndAt,
        ),
        note,
        createdBy,
      ],
    );
  }

  async update(
    database,
    id,
    changes,
    {
      invalidateReadiness = false,
    } = {},
  ) {
    const entries =
      Object.entries(
        changes,
      ).filter(
        ([key]) =>
          UPDATE_FIELDS[key],
      );

    if (!entries.length) {
      return;
    }

    const values = [];

    const sets =
      entries.map(
        ([key, value]) => {
          const converted =
            [
              "scheduledStartAt",
              "scheduledEndAt",
            ].includes(key)
              ? asDateTime(value)
              : value;

          values.push(
            converted,
          );

          return `${
            UPDATE_FIELDS[key]
          } = ?`;
        },
      );

    if (invalidateReadiness) {
      sets.push(
        "readiness_confirmed_at = NULL",
        "readiness_confirmed_by = NULL",
      );
    }

    values.push(id);

    await database.execute(
      `UPDATE waste_operation_plans
       SET ${sets.join(", ")}
       WHERE id = ?`,
      values,
    );
  }

  async markReadinessConfirmed(
    database,
    { id, officerId },
  ) {
    await database.execute(
      `UPDATE waste_operation_plans
       SET readiness_confirmed_at = NOW(), readiness_confirmed_by = ?
       WHERE id = ?`,
      [officerId, id],
    );
  }

  async findExecutionContext(
    database,
    id,
    {
      lock = false,
    } = {},
  ) {
    const [rows] =
      await database.execute(
        `SELECT
           p.id,
           p.plan_no AS planNo,
           p.status,
           p.publication_status AS publicationStatus,
           p.publication_version AS publicationVersion,
           p.route_id AS routeId,
           r.route_name AS routeName,
           p.vehicle_id AS vehicleId,
           p.driver_id AS driverId
         FROM waste_operation_plans p
         INNER JOIN waste_routes r ON r.id = p.route_id
         WHERE p.id = ?
         LIMIT 1
         ${lock ? "FOR UPDATE" : ""}`,
        [id],
      );

    return mapPlan(
      rows[0],
    );
  }

  async findVehicleState(
    database,
    vehicleId,
  ) {
    const [rows] =
      await database.execute(
        `SELECT
           id,
           status
         FROM waste_vehicles
         WHERE id = ?
         LIMIT 1
         FOR UPDATE`,
        [vehicleId],
      );

    return rows[0] || null;
  }

  async findDriverState(
    database,
    driverId,
  ) {
    const [rows] =
      await database.execute(
        `SELECT
           id,
           is_active AS isActive
         FROM waste_drivers
         WHERE id = ?
         LIMIT 1
         FOR UPDATE`,
        [driverId],
      );

    if (!rows[0]) {
      return null;
    }

    return {
      ...rows[0],
      isActive:
        asBoolean(
          rows[0].isActive,
        ),
    };
  }

  async findActiveResourceConflict(
    database,
    {
      planId,
      vehicleId,
      driverId,
    },
  ) {
    const [rows] =
      await database.execute(
        `SELECT
           plan_no AS planNo,

           CASE
             WHEN vehicle_id = ?
             THEN 'VEHICLE'
             ELSE 'DRIVER'
           END AS conflictType

         FROM waste_operation_plans

         WHERE id <> ?

           AND status IN (
             'IN_PROGRESS',
             'INTERRUPTED'
           )

           AND (
             vehicle_id = ?
             OR driver_id = ?
           )

         LIMIT 1`,
        [
          vehicleId,
          planId,
          vehicleId,
          driverId,
        ],
      );

    return rows[0] || null;
  }

  async enqueueCollectionStatusNotices(database, { plan, status }) {
    if (plan.publicationStatus !== "PUBLISHED" || status !== "IN_PROGRESS") return 0;
    const statusLabel = "กำลังปฏิบัติงาน";
    const message = [
      "สถานะการดำเนินการตามแผนปฏิบัติงานเก็บขยะ",
      statusLabel,
      plan.routeName,
      `เลขที่แผน ${plan.planNo}`,
      "ตรวจสอบตำแหน่งรถได้จากเมนู “ตำแหน่งรถ”",
    ].join("\n");


    const [users] = await database.execute(
      `SELECT id, line_user_id AS lineUserId FROM waste_service_users
       WHERE route_id = ? AND is_active = 1 AND line_user_id IS NOT NULL AND line_user_id <> ''`,
      [plan.routeId],
    );


    let queued = 0;
    for (const user of users) {
      const [existing] = await database.execute(
        `SELECT id FROM waste_line_notifications
         WHERE plan_id = ? AND service_user_id = ? AND notification_type = 'COLLECTION_STATUS' AND message_text = ? LIMIT 1`,
        [plan.id, user.id, message],
      );
      if (existing.length) continue;
      await database.execute(
        `INSERT INTO waste_line_notifications
          (id, line_user_id, service_user_id, plan_id, plan_version, notification_type, message_text)
         VALUES (UUID(), ?, ?, ?, ?, 'COLLECTION_STATUS', ?)`,
        [user.lineUserId, user.id, plan.id, plan.publicationVersion, message],
      );
      queued += 1;
    }
    return queued;
  }

  async updateStatus(
    database,
    {
      id,
      status,
      note,
    },
  ) {
    let actualTimeSql = "";

    if (
      status ===
      "IN_PROGRESS"
    ) {
      actualTimeSql =
        `, actual_start_at =
          COALESCE(
            actual_start_at,
            NOW()
          )`;
    }

    if (
      status ===
      "COMPLETED"
    ) {
      actualTimeSql =
        ", actual_end_at = NOW()";
    }

    await database.execute(
      `UPDATE waste_operation_plans
       SET
         status = ?,
         note = COALESCE(?, note)
         ${actualTimeSql}
       WHERE id = ?`,
      [
        status,
        note,
        id,
      ],
    );
  }

  async markVehicleInService(
    database,
    vehicleId,
  ) {
    await database.execute(
      `UPDATE waste_vehicles
       SET status = 'IN_SERVICE'
       WHERE id = ?`,
      [vehicleId],
    );
  }

  async setVehicleStatus(
    database,
    vehicleId,
    status,
  ) {
    await database.execute(
      `UPDATE waste_vehicles
       SET status = ?
       WHERE id = ?`,
      [
        status,
        vehicleId,
      ],
    );
  }

  async replaceExecutionResources(
    database,
    {
      id,
      vehicleId,
      driverId,
      resumePlan,
    },
  ) {
    await database.execute(
      `UPDATE waste_operation_plans
       SET
         vehicle_id = ?,
         driver_id = ?,
         status = CASE
           WHEN ? THEN 'IN_PROGRESS'
           ELSE status
         END,
         actual_start_at = CASE
           WHEN ? THEN COALESCE(actual_start_at, NOW())
           ELSE actual_start_at
         END
       WHERE id = ?`,
      [
        vehicleId,
        driverId,
        resumePlan ? 1 : 0,
        resumePlan ? 1 : 0,
        id,
      ],
    );
  }

  async releaseVehicle(
    database,
    vehicleId,
  ) {
    await database.execute(
      `UPDATE waste_vehicles
       SET status = 'AVAILABLE'
       WHERE id = ?
         AND status = 'IN_SERVICE'`,
      [vehicleId],
    );
  }
}
