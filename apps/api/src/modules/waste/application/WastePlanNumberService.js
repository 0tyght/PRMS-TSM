export class WastePlanNumberService {
  constructor({ prefix = "WST" } = {}) {
    this.prefix = prefix;
  }

  async next(connection, scheduledDate) {
    const date = String(scheduledDate || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new TypeError("WastePlanNumberService requires a valid scheduled date");
    }

    for (let attempt = 0; attempt < 1_000; attempt += 1) {
      const [result] = await connection.execute(
        `INSERT INTO waste_plan_sequences (plan_date, last_number)
         VALUES (?, LAST_INSERT_ID(1))
         ON DUPLICATE KEY UPDATE last_number = LAST_INSERT_ID(last_number + 1)`,
        [date],
      );
      const sequence = Number(result.insertId || 1);
      const candidate = `${this.prefix}-${date.replaceAll("-", "")}-${String(sequence).padStart(3, "0")}`;
      const [existing] = await connection.execute(
        `SELECT id FROM waste_operation_plans WHERE plan_no = ? LIMIT 1`,
        [candidate],
      );
      if (!existing.length) return candidate;
    }
    throw new Error("WASTE_PLAN_NUMBER_EXHAUSTED");
  }
}
