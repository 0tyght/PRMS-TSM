const STATUS_LABELS = Object.freeze({
  SCHEDULED: "ตามแผน",
  IN_PROGRESS: "กำลังเก็บขยะ",
  INTERRUPTED: "หยุดชะงักชั่วคราว",
  COMPLETED: "ดำเนินการแล้ว",
});

function formatThaiDate(value, withTime = false) {
  if (!value) return "ไม่ระบุ";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "ไม่ระบุ";
  return new Intl.DateTimeFormat("th-TH", withTime
    ? { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }
    : { dateStyle: "medium", timeZone: "Asia/Bangkok" }).format(date);
}

export class WasteCitizenScheduleService {
  constructor({ database }) {
    if (!database) throw new TypeError("WasteCitizenScheduleService requires database");
    this.database = database;
  }

  async upcomingFor(citizen) {
    if (!citizen) return { state: "UNREGISTERED", schedules: [] };
    if (!citizen.routeId) return { state: "UNASSIGNED", schedules: [] };

    const [rows] = await this.database.execute(
      `SELECT p.plan_no AS planNo,
              DATE_FORMAT(p.scheduled_date, '%Y-%m-%d') AS scheduledDate,
              p.scheduled_start_at AS scheduledStartAt,
              p.scheduled_end_at AS scheduledEndAt,
              p.status, r.route_code AS routeCode, r.route_name AS routeName
       FROM waste_operation_plans p
       INNER JOIN waste_routes r ON r.id = p.route_id
       WHERE p.route_id = ?
         AND p.scheduled_date >= CURDATE()
         AND p.status <> 'CANCELLED'
       ORDER BY p.scheduled_date, p.scheduled_start_at, p.plan_no
       LIMIT 5`,
      [citizen.routeId],
    );
    return { state: rows.length ? "READY" : "EMPTY", schedules: rows };
  }

  toLineText(result) {
    if (result.state === "UNREGISTERED") {
      return "ยังไม่พบทะเบียนผู้ใช้บริการ กรุณาลงทะเบียนก่อน";
    }
    if (result.state === "UNASSIGNED") {
      return "เทศบาลยังไม่ได้กำหนดเส้นทางรับผิดชอบให้ทะเบียนนี้ กรุณาติดต่อเจ้าหน้าที่เทศบาลท่าโพธ์";
    }
    if (result.state === "EMPTY") {
      return "ยังไม่มีกำหนดการเก็บขยะรอบถัดไปสำหรับพื้นที่ของคุณ";
    }

    const lines = result.schedules.map((row, index) => {
      const start = row.scheduledStartAt
        ? formatThaiDate(row.scheduledStartAt, true).split(" ").at(-1)
        : "ไม่ระบุเวลา";
      const status = STATUS_LABELS[row.status] || row.status;
      return `${index + 1}. ${formatThaiDate(row.scheduledDate)} · ${start}\n   ${row.routeCode} ${row.routeName}\n   สถานะ: ${status}`;
    });
    return `กำหนดเก็บขยะประจำพื้นที่ของคุณ\n${lines.join("\n")}`;
  }
}
