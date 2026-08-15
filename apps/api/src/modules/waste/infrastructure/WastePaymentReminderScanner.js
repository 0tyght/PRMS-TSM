export class WastePaymentReminderScanner {
  constructor({ database }) {
    if (!database) throw new TypeError("WastePaymentReminderScanner requires database");
    this.database = database;
  }


  async enqueueDueReminders({ daysBefore = 3 } = {}) {
    const safeDays = Math.min(14, Math.max(0, Number(daysBefore) || 0));
    const [result] = await this.database.query(
      `INSERT INTO waste_line_notifications
        (id, line_user_id, service_user_id, charge_id, notification_type, message_text)
       SELECT UUID(), u.line_user_id, u.id, c.id, 'PAYMENT_REMINDER',
         CONCAT(
           'แจ้งเตือนกำหนดชำระค่าบริการเก็บขยะ', CHAR(10),
           'ผู้ใช้บริการ ', u.service_no, ' · ', u.full_name, CHAR(10),
           'ยอดชำระ ', FORMAT(c.amount, 2), ' บาท', CHAR(10),
           'กำหนดชำระ ', DATE_FORMAT(c.due_date, '%d/%m/%Y'), CHAR(10),
           'ตรวจสอบรายละเอียดได้จากเมนูค่าบริการเก็บขยะ'
         )
       FROM waste_service_charges c
       INNER JOIN waste_service_users u ON u.id = c.service_user_id
       WHERE c.status IN ('PENDING','OVERDUE')
         AND c.due_date <= DATE_ADD(CURDATE(), INTERVAL ${safeDays} DAY)
         AND c.due_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
         AND u.is_active = 1
         AND u.line_user_id IS NOT NULL AND u.line_user_id <> ''
         AND NOT EXISTS (
           SELECT 1 FROM waste_line_notifications n
           WHERE n.charge_id = c.id AND n.notification_type = 'PAYMENT_REMINDER'
         )`,
    );
    return { queued: Number(result.affectedRows || 0) };
  }
}