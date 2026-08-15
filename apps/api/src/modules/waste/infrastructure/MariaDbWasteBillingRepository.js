function asBoolean(value) {
  return Boolean(Number(value));
}

const FEE_RATE_UPDATE_FIELDS =
  Object.freeze({
    rateName:
      "rate_name",
    amount:
      "amount",
    billingCycle:
      "billing_cycle",
    isActive:
      "is_active",
  });

export class MariaDbWasteBillingRepository {
  constructor({ database }) {
    if (!database) {
      throw new TypeError(
        "MariaDbWasteBillingRepository requires database",
      );
    }

    this.database =
      database;
  }

  transaction(work) {
    return this.database
      .transaction(work);
  }

  async listFeeRates() {
    const [rows] =
      await this.database.execute(
        `SELECT
           id,
           rate_name AS rateName,
           amount,
           billing_cycle AS billingCycle,
           is_active AS isActive
         FROM waste_fee_rates
         ORDER BY
           is_active DESC,
           rate_name`,
      );

    return rows.map(
      (row) => ({
        ...row,
        amount:
          Number(row.amount),
        isActive:
          asBoolean(
            row.isActive,
          ),
      }),
    );
  }

  async findFeeRate(id) {
    const [rows] =
      await this.database.execute(
        `SELECT
           id,
           rate_name AS rateName,
           amount,
           billing_cycle AS billingCycle,
           is_active AS isActive
         FROM waste_fee_rates
         WHERE id = ?
         LIMIT 1`,
        [id],
      );

    if (!rows[0]) {
      return null;
    }

    return {
      ...rows[0],
      amount:
        Number(
          rows[0].amount,
        ),
      isActive:
        asBoolean(
          rows[0].isActive,
        ),
    };
  }

  async createFeeRate(
    feeRate,
  ) {
    await this.database.execute(
      `INSERT INTO waste_fee_rates
        (
          id,
          rate_name,
          amount,
          billing_cycle,
          is_active
        )
       VALUES (?, ?, ?, ?, ?)`,
      [
        feeRate.id,
        feeRate.rateName,
        feeRate.amount,
        feeRate.billingCycle,
        feeRate.isActive,
      ],
    );
  }

  async updateFeeRate(
    id,
    changes,
  ) {
    const entries =
      Object.entries(changes)
        .filter(
          ([key]) =>
            FEE_RATE_UPDATE_FIELDS[
              key
            ],
        );

    if (!entries.length) {
      return false;
    }

    const values = [];

    const sets =
      entries.map(
        ([key, value]) => {
          values.push(value);

          return `${
            FEE_RATE_UPDATE_FIELDS[
              key
            ]
          } = ?`;
        },
      );

    values.push(id);

    const [result] =
      await this.database.execute(
        `UPDATE waste_fee_rates
         SET ${sets.join(", ")}
         WHERE id = ?`,
        values,
      );

    return (
      result.affectedRows > 0
    );
  }

  async listCharges({
    status = null,
    billingPeriod = null,
  } = {}) {
    const terms = [];
    const values = [];

    if (status) {
      terms.push(
        "c.status = ?",
      );

      values.push(status);
    }

    if (billingPeriod) {
      terms.push(
        "c.billing_period = ?",
      );

      values.push(
        billingPeriod,
      );
    }

    const [rows] =
      await this.database.execute(
        `SELECT
           c.id,
           c.service_user_id AS serviceUserId,
           u.service_no AS serviceNo,
           u.full_name AS fullName,
           u.house_no AS houseNo,
           c.fee_rate_id AS feeRateId,
           f.rate_name AS rateName,
           DATE_FORMAT(
             c.billing_period,
             '%Y-%m-%d'
           ) AS billingPeriod,
           DATE_FORMAT(
             c.due_date,
             '%Y-%m-%d'
           ) AS dueDate,
           c.amount,
           c.status,
           c.paid_at AS paidAt,
           c.notice_requested_at AS noticeRequestedAt,
           (
             SELECT n.delivery_status
             FROM waste_line_notifications n
             WHERE n.charge_id = c.id
               AND n.notification_type = 'CHARGE_NOTICE'
             ORDER BY n.created_at DESC
             LIMIT 1
           ) AS noticeDeliveryStatus,
           (
             SELECT n.sent_at
             FROM waste_line_notifications n
             WHERE n.charge_id = c.id
               AND n.notification_type = 'CHARGE_NOTICE'
             ORDER BY n.created_at DESC
             LIMIT 1
           ) AS noticeSentAt,
           (
             SELECT n.last_error
             FROM waste_line_notifications n
             WHERE n.charge_id = c.id
               AND n.notification_type = 'CHARGE_NOTICE'
             ORDER BY n.created_at DESC
             LIMIT 1
           ) AS noticeLastError
         FROM waste_service_charges c
         INNER JOIN waste_service_users u
           ON u.id =
              c.service_user_id
         LEFT JOIN waste_fee_rates f
           ON f.id =
              c.fee_rate_id
         ${
           terms.length
             ? `WHERE ${terms.join(
                 " AND ",
               )}`
             : ""
         }
         ORDER BY
           c.due_date DESC,
           u.full_name`,
        values,
      );

    return rows.map(
      (row) => ({
        ...row,
        amount:
          Number(row.amount),
      }),
    );
  }

  async findCharge(id) {
    const [rows] =
      await this.database.execute(
        `SELECT
           c.id,
           c.service_user_id AS serviceUserId,
           c.fee_rate_id AS feeRateId,
           DATE_FORMAT(
             c.billing_period,
             '%Y-%m-%d'
           ) AS billingPeriod,
           DATE_FORMAT(
             c.due_date,
             '%Y-%m-%d'
           ) AS dueDate,
           c.amount,
           c.status,
           c.paid_at AS paidAt,
           c.notice_requested_at AS noticeRequestedAt
         FROM waste_service_charges c
         WHERE c.id = ?
         LIMIT 1`,
        [id],
      );

    if (!rows[0]) {
      return null;
    }

    return {
      ...rows[0],
      amount:
        Number(
          rows[0].amount,
        ),
    };
  }

  async createCharge(
    charge,
  ) {
    await this.database.execute(
      `INSERT INTO waste_service_charges
        (
          id,
          service_user_id,
          fee_rate_id,
          billing_period,
          due_date,
          amount
        )
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        charge.id,
        charge.serviceUserId,
        charge.feeRateId,
        charge.billingPeriod,
        charge.dueDate,
        charge.amount,
      ],
    );
  }

  async updateChargeStatus(
    id,
    {
      status,
      paidAt,
    },
  ) {
    const [result] =
      await this.database.execute(
        `UPDATE waste_service_charges
         SET
           status = ?,
           paid_at = ?
         WHERE id = ?`,
        [
          status,
          paidAt,
          id,
        ],
      );

    return (
      result.affectedRows > 0
    );
  }

  async findChargeNoticeContext(
    database,
    id,
    {
      lock = false,
    } = {},
  ) {
    const [rows] =
      await database.execute(
        `SELECT
           c.id,
           c.amount,
           c.due_date AS dueDate,
           c.status,
           u.id AS serviceUserId,
           u.full_name AS fullName,
           u.line_user_id AS lineUserId
         FROM waste_service_charges c
         INNER JOIN waste_service_users u
           ON u.id =
              c.service_user_id
         WHERE c.id = ?
         ${lock ? "FOR UPDATE" : ""}`,
        [id],
      );

    if (!rows[0]) {
      return null;
    }

    return {
      ...rows[0],
      amount:
        Number(
          rows[0].amount,
        ),
    };
  }

  async enqueueChargeNotice(
    database,
    {
      notificationId,
      charge,
      message,
    },
  ) {
    const [existing] =
      await database.execute(
        `SELECT id
         FROM waste_line_notifications
         WHERE charge_id = ?
           AND notification_type = 'CHARGE_NOTICE'
         ORDER BY created_at DESC
         LIMIT 1
         FOR UPDATE`,
        [charge.id],
      );

    if (existing[0]) {
      await database.execute(
        `UPDATE waste_line_notifications
         SET
           line_user_id = ?,
           service_user_id = ?,
           message_text = ?,
           delivery_status = 'PENDING',
           attempts = 0,
           next_attempt_at = NOW(),
           sent_at = NULL,
           last_error = NULL
         WHERE id = ?`,
        [
          charge.lineUserId,
          charge.serviceUserId,
          message,
          existing[0].id,
        ],
      );

      return;
    }

    await database.execute(
      `INSERT INTO waste_line_notifications
        (
          id,
          line_user_id,
          service_user_id,
          charge_id,
          notification_type,
          message_text
        )
       VALUES (
         ?, ?, ?, ?,
         'CHARGE_NOTICE',
         ?
       )`,
      [
        notificationId,
        charge.lineUserId,
        charge.serviceUserId,
        charge.id,
        message,
      ],
    );
  }

  async markNoticeRequested(
    database,
    chargeId,
  ) {
    await database.execute(
      `UPDATE waste_service_charges
       SET notice_requested_at =
         NOW()
       WHERE id = ?`,
      [chargeId],
    );
  }
}
