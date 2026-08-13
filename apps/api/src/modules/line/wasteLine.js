import crypto from "node:crypto";

import { config } from "../../core/config.js";
import { pool, withTransaction } from "../../core/db.js";
import { WasteCitizenScheduleService } from "../waste/application/WasteCitizenScheduleService.js";
import { wasteLineShortcuts } from "../waste/application/WasteLineShortcutCatalog.js";
import { WasteTrackingTokenService } from "../waste/application/WasteTrackingTokenService.js";

const SESSION_MINUTES = 30;
const citizenScheduleService = new WasteCitizenScheduleService({ database: pool });
const trackingTokenService = new WasteTrackingTokenService({ secret: config.jwtSecret });

function textMessage(text, quickReplyItems = []) {
  const actions = wasteLineShortcuts.normalize(quickReplyItems);
  return {
    type: "text",
    text: String(text || "").slice(0, 5000),
    ...(actions.length ? { quickReply: { items: actions.map((action) => ({ type: "action", action })) } } : {}),
  };
}

function postbackAction(label, data, displayText = label) {
  return wasteLineShortcuts.postback(label, data, displayText);
}

function uriAction(label, uri) {
  return wasteLineShortcuts.uri(label, uri);
}

function trackingUrl(plan, lineUserId, driverId) {
  const token = trackingTokenService.issue({ planId: plan.id, driverId, lineUserId });
  return `${config.wasteDriverTrackingUrl.replace(/\/+$/, "")}/#/driver-gps?token=${encodeURIComponent(token)}`;
}

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function parsePostback(value) {
  return Object.fromEntries(new URLSearchParams(String(value || "")));
}

function hashCode(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function formatThaiDate(value, withTime = false) {
  if (!value) return "ไม่ระบุ";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "ไม่ระบุ";
  return new Intl.DateTimeFormat("th-TH", withTime
    ? { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }
    : { dateStyle: "medium", timeZone: "Asia/Bangkok" }).format(date);
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("th-TH", { style: "currency", currency: "THB" });
}

async function getSession(lineUserId) {
  const [rows] = await pool.execute(
    `SELECT actor_type AS actorType, flow_type AS flowType, current_step AS currentStep,
            CAST(draft_json AS CHAR) AS draftJson
     FROM waste_line_sessions WHERE line_user_id = ? AND expires_at > NOW()`,
    [lineUserId],
  );
  if (!rows[0]) return null;
  return { ...rows[0], draft: rows[0].draftJson ? JSON.parse(rows[0].draftJson) : {} };
}

async function saveSession(lineUserId, actorType, flowType, currentStep, draft = {}) {
  await pool.execute(
    `INSERT INTO waste_line_sessions
      (line_user_id, actor_type, flow_type, current_step, draft_json, expires_at)
     VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))
     ON DUPLICATE KEY UPDATE actor_type = VALUES(actor_type), flow_type = VALUES(flow_type),
       current_step = VALUES(current_step), draft_json = VALUES(draft_json),
       expires_at = VALUES(expires_at)`,
    [lineUserId, actorType, flowType, currentStep, JSON.stringify(draft), SESSION_MINUTES],
  );
}

async function clearSession(lineUserId) {
  await pool.execute(`DELETE FROM waste_line_sessions WHERE line_user_id = ?`, [lineUserId]);
}

async function loadActors(lineUserId) {
  const [[drivers], [citizens]] = await Promise.all([
    pool.execute(`SELECT id, full_name AS fullName FROM waste_drivers WHERE line_user_id = ? AND is_active = 1 LIMIT 1`, [lineUserId]),
    pool.execute(`SELECT id, service_no AS serviceNo, full_name AS fullName, route_id AS routeId FROM waste_service_users WHERE line_user_id = ? AND is_active = 1 LIMIT 1`, [lineUserId]),
  ]);
  return { driver: drivers[0] || null, citizen: citizens[0] || null };
}

function wasteMenu(actors) {
  return textMessage(
    `บริการเก็บขยะ Smart Tha Pho\n${actors.citizen ? `ผู้ใช้บริการ: ${actors.citizen.fullName}` : "ยังไม่ได้ลงทะเบียนผู้ใช้บริการ"}${actors.driver ? `\nคนขับรถ: ${actors.driver.fullName}` : ""}\nเลือกเมนูที่ต้องการ`,
    wasteLineShortcuts.menu(actors),
  );
}

async function citizenSchedule(citizen) {
  const result = await citizenScheduleService.upcomingFor(citizen);
  const actions = result.state === "UNREGISTERED" ? wasteLineShortcuts.unregistered() : wasteLineShortcuts.citizen();
  return textMessage(citizenScheduleService.toLineText(result), actions);
}

async function citizenLocation(citizen) {
  if (!citizen) return textMessage("ยังไม่พบทะเบียนผู้ใช้บริการ กรุณาลงทะเบียนก่อน", wasteLineShortcuts.unregistered());
  if (!citizen.routeId) return textMessage("ยังไม่พบเส้นทางรับผิดชอบของทะเบียนนี้", wasteLineShortcuts.citizen());
  const [rows] = await pool.execute(
    `SELECT v.vehicle_code AS vehicleCode, v.last_latitude AS latitude, v.last_longitude AS longitude,
            v.last_gps_at AS lastGpsAt, r.route_name AS routeName
     FROM waste_operation_plans p
     INNER JOIN waste_vehicles v ON v.id = p.vehicle_id
     INNER JOIN waste_routes r ON r.id = p.route_id
     WHERE p.route_id = ? AND p.scheduled_date = CURDATE() AND p.status = 'IN_PROGRESS'
     ORDER BY p.actual_start_at DESC LIMIT 1`,
    [citizen.routeId],
  );
  const vehicle = rows[0];
  if (!vehicle) return textMessage("ขณะนี้ยังไม่มีรถเก็บขยะกำลังปฏิบัติงานในเส้นทางของคุณ", wasteLineShortcuts.citizen());
  if (vehicle.latitude == null || vehicle.longitude == null) return textMessage(`รถ ${vehicle.vehicleCode} กำลังปฏิบัติงาน แต่ยังไม่ได้รับตำแหน่งล่าสุดจากคนขับ`, wasteLineShortcuts.citizen());
  return [
    {
      type: "location",
      title: `รถ ${vehicle.vehicleCode} · ${vehicle.routeName}`.slice(0, 100),
      address: `อัปเดตล่าสุด ${formatThaiDate(vehicle.lastGpsAt, true)}`.slice(0, 100),
      latitude: Number(vehicle.latitude),
      longitude: Number(vehicle.longitude),
    },
    textMessage("เลือกบริการที่ต้องการต่อได้ด้านล่าง", wasteLineShortcuts.citizen()),
  ];
}

async function citizenCharges(citizen) {
  if (!citizen) return textMessage("ยังไม่พบทะเบียนผู้ใช้บริการ กรุณาลงทะเบียนก่อน", wasteLineShortcuts.unregistered());
  const [rows] = await pool.execute(
    `SELECT billing_period AS billingPeriod, due_date AS dueDate, amount, status, paid_at AS paidAt
     FROM waste_service_charges WHERE service_user_id = ?
     ORDER BY billing_period DESC LIMIT 6`,
    [citizen.id],
  );
  if (!rows.length) return textMessage("ยังไม่มีรายการค่าบริการเก็บขยะในทะเบียนของคุณ", wasteLineShortcuts.citizen());
  const labels = { PENDING: "รอชำระ", PAID: "ชำระแล้ว", OVERDUE: "ค้างชำระ", VOID: "ยกเลิก" };
  const lines = rows.map((row) => `• รอบ ${formatThaiDate(row.billingPeriod)} · ${formatMoney(row.amount)}\n  ${labels[row.status] || row.status}${["PENDING", "OVERDUE"].includes(row.status) ? ` · กำหนด ${formatThaiDate(row.dueDate)}` : ""}`);
  return textMessage(`ค่าบริการเก็บขยะ\n${lines.join("\n")}`, wasteLineShortcuts.citizen());
}

export function buildDriverJobsMessage(plans) {
  const lines = plans.map((plan, index) => {
    const status = { SCHEDULED: "รอเริ่มงาน", IN_PROGRESS: "กำลังปฏิบัติงาน", INTERRUPTED: "หยุดชะงัก", COMPLETED: "เสร็จสิ้น" }[plan.status] || plan.status;
    return `${index + 1}. ${plan.planNo} · ${status}\n${formatThaiDate(plan.scheduledDate)} · ${plan.routeName}\nรถ ${plan.vehicleCode}`;
  });
  return textMessage(`งานเก็บขยะของฉันใน 7 วัน\n\n${lines.join("\n\n")}`, wasteLineShortcuts.jobs(plans));
}

async function driverJobs(driver, lineUserId) {
  if (!driver) return textMessage("บัญชี LINE นี้ยังไม่ได้เชื่อมกับข้อมูลคนขับ", wasteLineShortcuts.menu({}));
  const [rows] = await pool.execute(
    `SELECT p.id, p.plan_no AS planNo, p.scheduled_date AS scheduledDate, p.status,
            p.scheduled_start_at AS scheduledStartAt, r.route_name AS routeName,
            v.vehicle_code AS vehicleCode
     FROM waste_operation_plans p
     INNER JOIN waste_routes r ON r.id = p.route_id
     INNER JOIN waste_vehicles v ON v.id = p.vehicle_id
     WHERE p.driver_id = ? AND p.scheduled_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)
       AND p.status <> 'CANCELLED'
     ORDER BY FIELD(p.status, 'IN_PROGRESS', 'INTERRUPTED', 'SCHEDULED', 'COMPLETED'), p.scheduled_date, p.scheduled_start_at LIMIT 8`,
    [driver.id],
  );
  if (!rows.length) return textMessage("ยังไม่มีงานเก็บขยะที่ได้รับมอบหมายใน 7 วันข้างหน้า", wasteLineShortcuts.driverMenu());
  return buildDriverJobsMessage(rows);
}

async function ensureDriverPlan(driver, planId, statuses) {
  if (!driver) throw new Error("บัญชี LINE นี้ยังไม่ได้เชื่อมกับข้อมูลคนขับ");
  const placeholders = statuses.map(() => "?").join(",");
  const [rows] = await pool.execute(
    `SELECT p.id, p.plan_no AS planNo, p.status, p.vehicle_id AS vehicleId, p.route_id AS routeId
     FROM waste_operation_plans p WHERE p.id = ? AND p.driver_id = ? AND p.status IN (${placeholders})`,
    [planId, driver.id, ...statuses],
  );
  if (!rows[0]) throw new Error("ไม่พบงานนี้ หรือสถานะงานไม่อนุญาตให้ดำเนินการ");
  return rows[0];
}

async function beginRegistration(lineUserId) {
  await saveSession(lineUserId, "CITIZEN", "REGISTER", "FULL_NAME", {});
  return textMessage("ลงทะเบียนผู้ใช้บริการเก็บขยะ\nกรุณาพิมพ์ชื่อ-นามสกุล", wasteLineShortcuts.registration("FULL_NAME"));
}

async function handleRegistrationStep(event, lineUserId, session) {
  const text = normalizeText(event.message?.text);
  const draft = { ...session.draft };
  if (event.type === "message" && event.message?.type === "location" && session.currentStep === "LOCATION") {
    draft.latitude = Number(event.message.latitude);
    draft.longitude = Number(event.message.longitude);
    await saveSession(lineUserId, "CITIZEN", "REGISTER", "CONFIRM", draft);
    return textMessage(`ตรวจสอบข้อมูล\nชื่อ ${draft.fullName}\nโทรศัพท์ ${draft.phone}\nบ้านเลขที่ ${draft.houseNo} หมู่ ${draft.villageNo}\n${draft.addressDetail ? `${draft.addressDetail}\n` : ""}ได้รับตำแหน่งแล้ว\n\nกด “ยืนยัน” เพื่อส่งข้อมูลขึ้นทะเบียน`, wasteLineShortcuts.registration("CONFIRM"));
  }
  if (event.message?.type !== "text") return textMessage("กรุณาส่งข้อมูลตามขั้นตอนที่ระบุ", wasteLineShortcuts.registration(session.currentStep));

  if (session.currentStep === "FULL_NAME") {
    if (text.length < 2) return textMessage("กรุณาระบุชื่อ-นามสกุลอย่างน้อย 2 ตัวอักษร", wasteLineShortcuts.registration("FULL_NAME"));
    draft.fullName = text;
    await saveSession(lineUserId, "CITIZEN", "REGISTER", "PHONE", draft);
    return textMessage("กรุณาพิมพ์หมายเลขโทรศัพท์ 10 หลัก", wasteLineShortcuts.registration("PHONE"));
  }
  if (session.currentStep === "PHONE") {
    const phone = text.replace(/\D/g, "");
    if (!/^0\d{9}$/.test(phone)) return textMessage("หมายเลขโทรศัพท์ต้องมี 10 หลักและขึ้นต้นด้วย 0", wasteLineShortcuts.registration("PHONE"));
    draft.phone = phone;
    await saveSession(lineUserId, "CITIZEN", "REGISTER", "HOUSE_NO", draft);
    return textMessage("กรุณาพิมพ์บ้านเลขที่", wasteLineShortcuts.registration("HOUSE_NO"));
  }
  if (session.currentStep === "HOUSE_NO") {
    if (!text) return textMessage("กรุณาระบุบ้านเลขที่", wasteLineShortcuts.registration("HOUSE_NO"));
    draft.houseNo = text;
    await saveSession(lineUserId, "CITIZEN", "REGISTER", "VILLAGE_NO", draft);
    return textMessage("กรุณาพิมพ์เลขหมู่บ้านในเขตเทศบาลท่าโพธ์", wasteLineShortcuts.registration("VILLAGE_NO"));
  }
  if (session.currentStep === "VILLAGE_NO") {
    const villageNo = Number(text.replace(/\D/g, ""));
    const [rows] = await pool.execute(`SELECT id, village_no AS villageNo, name_th AS name FROM villages WHERE village_no = ? LIMIT 1`, [villageNo]);
    if (!rows[0]) return textMessage("ไม่พบหมู่บ้านนี้ในเขตเทศบาลท่าโพธ์ กรุณาตรวจสอบเลขหมู่บ้านอีกครั้ง", wasteLineShortcuts.registration("VILLAGE_NO"));
    draft.villageId = rows[0].id;
    draft.villageNo = rows[0].villageNo;
    draft.villageName = rows[0].name;
    await saveSession(lineUserId, "CITIZEN", "REGISTER", "ADDRESS", draft);
    return textMessage("พิมพ์รายละเอียดที่อยู่หรือจุดสังเกต หากไม่มีให้กด “ข้าม”", wasteLineShortcuts.registration("ADDRESS"));
  }
  if (session.currentStep === "ADDRESS") {
    draft.addressDetail = text === "ข้าม" ? null : text;
    await saveSession(lineUserId, "CITIZEN", "REGISTER", "LOCATION", draft);
    return textMessage("กรุณาส่งตำแหน่งบ้าน เพื่อให้เจ้าหน้าที่กำหนดเส้นทางเก็บขยะได้ถูกต้อง", wasteLineShortcuts.registration("LOCATION"));
  }
  if (session.currentStep === "CONFIRM") {
    if (text !== "ยืนยัน") return textMessage("หากข้อมูลถูกต้องให้กด “ยืนยัน” หรือกด “ยกเลิก” เพื่อเริ่มใหม่", wasteLineShortcuts.registration("CONFIRM"));
    let serviceNo;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = `WU-${new Date().toISOString().slice(2, 10).replaceAll("-", "")}-${crypto.randomInt(1000, 10000)}`;
      const [existing] = await pool.execute(`SELECT id FROM waste_service_users WHERE service_no = ?`, [candidate]);
      if (!existing.length) { serviceNo = candidate; break; }
    }
    if (!serviceNo) throw new Error("ไม่สามารถออกเลขผู้ใช้บริการได้ กรุณาลองใหม่");
    const id = crypto.randomUUID();
    await withTransaction(async (db) => {
      await db.execute(
        `INSERT INTO waste_service_users
          (id, service_no, full_name, phone, house_no, village_id, address_detail, line_user_id, latitude, longitude, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [id, serviceNo, draft.fullName, draft.phone, draft.houseNo, draft.villageId, draft.addressDetail, lineUserId, draft.latitude, draft.longitude],
      );
      await db.execute(`DELETE FROM waste_line_sessions WHERE line_user_id = ?`, [lineUserId]);
    });
    return textMessage(`ลงทะเบียนสำเร็จ\nเลขผู้ใช้บริการ ${serviceNo}\nเจ้าหน้าที่จะตรวจสอบและกำหนดเส้นทางรับผิดชอบให้ต่อไป`, [postbackAction("เมนูขยะ", "waste=menu", "เปิดเมนูบริการเก็บขยะ")]);
  }
  return textMessage("ไม่พบขั้นตอนลงทะเบียน กรุณายกเลิกรายการแล้วเริ่มใหม่", wasteLineShortcuts.cancelFlow());
}

async function handleDriverSession(event, lineUserId, session, actors) {
  if (session.flowType === "DRIVER_LINK") {
    if (event.message?.type !== "text") return textMessage("กรุณาพิมพ์รหัสเชื่อมบัญชี 6 หลัก", wasteLineShortcuts.cancelFlow());
    const code = normalizeText(event.message.text).replace(/\D/g, "");
    if (!/^\d{6}$/.test(code)) return textMessage("รหัสเชื่อมบัญชีต้องเป็นตัวเลข 6 หลัก", wasteLineShortcuts.cancelFlow());
    await withTransaction(async (db) => {
      const [rows] = await db.execute(
        `SELECT c.id, c.driver_id AS driverId, d.full_name AS fullName
         FROM waste_driver_link_codes c INNER JOIN waste_drivers d ON d.id = c.driver_id
         WHERE c.code_hash = ? AND c.used_at IS NULL AND c.expires_at > NOW() FOR UPDATE`,
        [hashCode(code)],
      );
      if (!rows[0]) throw new Error("รหัสไม่ถูกต้องหรือหมดอายุแล้ว กรุณาขอรหัสใหม่จากเจ้าหน้าที่");
      const [used] = await db.execute(`SELECT id FROM waste_drivers WHERE line_user_id = ? AND id <> ?`, [lineUserId, rows[0].driverId]);
      if (used.length) throw new Error("บัญชี LINE นี้เชื่อมกับคนขับรายอื่นแล้ว");
      await db.execute(`UPDATE waste_drivers SET line_user_id = ? WHERE id = ?`, [lineUserId, rows[0].driverId]);
      await db.execute(`UPDATE waste_driver_link_codes SET used_at = NOW() WHERE id = ?`, [rows[0].id]);
      await db.execute(`DELETE FROM waste_line_sessions WHERE line_user_id = ?`, [lineUserId]);
    });
    const nextActors = await loadActors(lineUserId);
    return [textMessage(`เชื่อมบัญชีคนขับสำเร็จ\n${nextActors.driver.fullName}`), wasteMenu(nextActors)];
  }

  const plan = await ensureDriverPlan(actors.driver, session.draft.planId, ["IN_PROGRESS", "INTERRUPTED"]);
  if (session.flowType === "DRIVER_LOCATION") {
    if (event.message?.type !== "location") return textMessage("กรุณากดปุ่ม “ส่งตำแหน่งรถ” ด้านล่าง", wasteLineShortcuts.driverLocation());
    const latitude = Number(event.message.latitude);
    const longitude = Number(event.message.longitude);
    await withTransaction(async (db) => {
      await db.execute(
        `INSERT INTO waste_location_logs (plan_id, latitude, longitude, accuracy_m, recorded_at, source)
         VALUES (?, ?, ?, ?, NOW(), 'LINE')`,
        [plan.id, latitude, longitude, event.message.accuracy || null],
      );
      await db.execute(`UPDATE waste_vehicles SET last_latitude = ?, last_longitude = ?, last_gps_at = NOW() WHERE id = ?`, [latitude, longitude, plan.vehicleId]);
      await db.execute(`DELETE FROM waste_line_sessions WHERE line_user_id = ?`, [lineUserId]);
    });
    return textMessage(`บันทึกตำแหน่งรถสำหรับ ${plan.planNo} แล้ว`, wasteLineShortcuts.activePlan(plan));
  }
  if (session.flowType === "DRIVER_INCIDENT") {
    if (event.message?.type !== "text" || normalizeText(event.message.text).length < 4) return textMessage("กรุณาพิมพ์รายละเอียดเหตุที่เกิดขึ้นอย่างน้อย 4 ตัวอักษร", wasteLineShortcuts.cancelFlow());
    await withTransaction(async (db) => {
      await db.execute(
        `INSERT INTO waste_incidents (id, plan_id, vehicle_id, driver_id, incident_type, description, happened_at)
         VALUES (?, ?, ?, ?, 'OTHER', ?, NOW())`,
        [crypto.randomUUID(), plan.id, plan.vehicleId, actors.driver.id, normalizeText(event.message.text)],
      );
      await db.execute(`UPDATE waste_operation_plans SET status = 'INTERRUPTED' WHERE id = ?`, [plan.id]);
      await db.execute(`DELETE FROM waste_line_sessions WHERE line_user_id = ?`, [lineUserId]);
    });
    return textMessage(`ส่งเหตุของงาน ${plan.planNo} ให้เจ้าหน้าที่แล้ว\nสถานะงานเปลี่ยนเป็น “หยุดชะงัก”`, wasteLineShortcuts.activePlan(plan));
  }
  return textMessage("ไม่พบขั้นตอนงานคนขับ กรุณายกเลิกรายการแล้วเปิดงานของฉันใหม่", wasteLineShortcuts.cancelFlow());
}

async function handleWasteAction(params, lineUserId, actors) {
  if (params.waste === "menu") return wasteMenu(actors);
  if (params.waste === "register") return beginRegistration(lineUserId);
  if (params.waste === "citizen_schedule") return citizenSchedule(actors.citizen);
  if (params.waste === "citizen_location") return citizenLocation(actors.citizen);
  if (params.waste === "citizen_charges") return citizenCharges(actors.citizen);
  if (params.waste === "driver_link") {
    await saveSession(lineUserId, "DRIVER", "DRIVER_LINK", "CODE", {});
    return textMessage("กรุณาพิมพ์รหัสเชื่อมบัญชีคนขับ 6 หลักที่ได้รับจากเจ้าหน้าที่เทศบาล\nรหัสมีอายุ 15 นาที", wasteLineShortcuts.cancelFlow());
  }
  if (params.waste === "driver_jobs") return driverJobs(actors.driver, lineUserId);
  if (params.waste === "driver_plan") {
    const plan = await ensureDriverPlan(actors.driver, params.planId, ["SCHEDULED", "IN_PROGRESS", "INTERRUPTED", "COMPLETED"]);
    if (plan.status === "SCHEDULED") {
      return textMessage(`งาน ${plan.planNo}\nสถานะ: รอเริ่มปฏิบัติงาน`, wasteLineShortcuts.normalize([postbackAction("เริ่มงาน", `waste=driver_start&planId=${plan.id}`, `เริ่มงาน ${plan.planNo}`), ...wasteLineShortcuts.driverMenu()]));
    }
    if (["IN_PROGRESS", "INTERRUPTED"].includes(plan.status)) {
      return textMessage(`งาน ${plan.planNo}\nสถานะ: ${plan.status === "IN_PROGRESS" ? "กำลังปฏิบัติงาน" : "หยุดชะงัก"}`, [uriAction("เปิด GPS ต่อเนื่อง", trackingUrl(plan, lineUserId, actors.driver.id)), ...wasteLineShortcuts.activePlan(plan).filter((action) => !String(action.data || "").startsWith("waste=driver_gps"))]);
    }
    return textMessage(`งาน ${plan.planNo}\nสถานะ: เสร็จสิ้นแล้ว`, wasteLineShortcuts.driverMenu());
  }
  if (params.waste === "driver_start") {
    const plan = await ensureDriverPlan(actors.driver, params.planId, ["SCHEDULED"]);
    await withTransaction(async (db) => {
      await db.execute(`UPDATE waste_operation_plans SET status = 'IN_PROGRESS', actual_start_at = COALESCE(actual_start_at, NOW()) WHERE id = ?`, [plan.id]);
      await db.execute(`UPDATE waste_vehicles SET status = 'IN_SERVICE' WHERE id = ?`, [plan.vehicleId]);
    });
    return textMessage(`เริ่มปฏิบัติงาน ${plan.planNo} แล้ว\nกด “เปิด GPS ต่อเนื่อง” และอนุญาตตำแหน่ง โดยคงหน้าติดตามไว้ระหว่างปฏิบัติงาน`, [uriAction("เปิด GPS ต่อเนื่อง", trackingUrl(plan, lineUserId, actors.driver.id)), ...wasteLineShortcuts.activePlan(plan).filter((action) => !String(action.data || "").startsWith("waste=driver_gps"))]);
  }
  if (params.waste === "driver_complete") {
    const plan = await ensureDriverPlan(actors.driver, params.planId, ["IN_PROGRESS", "INTERRUPTED"]);
    await withTransaction(async (db) => {
      await db.execute(`UPDATE waste_operation_plans SET status = 'COMPLETED', actual_end_at = NOW() WHERE id = ?`, [plan.id]);
      await db.execute(`UPDATE waste_vehicles SET status = 'AVAILABLE' WHERE id = ?`, [plan.vehicleId]);
    });
    return textMessage(`บันทึกงาน ${plan.planNo} เสร็จสิ้นแล้ว`, wasteLineShortcuts.driverMenu());
  }
  if (params.waste === "driver_gps") {
    const plan = await ensureDriverPlan(actors.driver, params.planId, ["IN_PROGRESS", "INTERRUPTED"]);
    return textMessage(`เปิด GPS ต่อเนื่องสำหรับ ${plan.planNo}\nกดปุ่มด้านล่างและอนุญาตตำแหน่ง`, [uriAction("เปิดหน้า GPS", trackingUrl(plan, lineUserId, actors.driver.id)), ...wasteLineShortcuts.activePlan(plan).filter((action) => !String(action.data || "").startsWith("waste=driver_gps"))]);
  }
  if (params.waste === "driver_location") {
    const plan = await ensureDriverPlan(actors.driver, params.planId, ["IN_PROGRESS", "INTERRUPTED"]);
    await saveSession(lineUserId, "DRIVER", "DRIVER_LOCATION", "LOCATION", { planId: plan.id });
    return textMessage(`ส่งตำแหน่งรถสำหรับ ${plan.planNo}`, wasteLineShortcuts.driverLocation());
  }
  if (params.waste === "driver_incident") {
    const plan = await ensureDriverPlan(actors.driver, params.planId, ["IN_PROGRESS", "INTERRUPTED"]);
    await saveSession(lineUserId, "DRIVER", "DRIVER_INCIDENT", "DESCRIPTION", { planId: plan.id });
    return textMessage(`แจ้งเหตุสำหรับ ${plan.planNo}\nกรุณาพิมพ์รายละเอียดเหตุที่เกิดขึ้น`, wasteLineShortcuts.cancelFlow());
  }
  if (params.waste === "driver_stops") {
    const plan = await ensureDriverPlan(actors.driver, params.planId, ["IN_PROGRESS", "INTERRUPTED"]);
    const [rows] = await pool.execute(
      `SELECT s.id, s.sequence_no AS sequenceNo, s.stop_name AS stopName
       FROM waste_route_stops s
       LEFT JOIN waste_stop_confirmations c ON c.stop_id = s.id AND c.plan_id = ?
       WHERE s.route_id = ? AND s.is_active = 1 AND c.id IS NULL
       ORDER BY s.sequence_no LIMIT 8`,
      [plan.id, plan.routeId],
    );
    if (!rows.length) return textMessage("ยืนยันจุดเก็บครบแล้ว หรือเส้นทางนี้ยังไม่มีจุดเก็บ", wasteLineShortcuts.activePlan(plan));
    return textMessage(`เลือกจุดที่เก็บขยะแล้ว (${plan.planNo})`, wasteLineShortcuts.normalize([...rows.map((stop) => postbackAction(`${stop.sequenceNo}. ${stop.stopName}`.slice(0, 20), `waste=driver_confirm_stop&planId=${plan.id}&stopId=${stop.id}`, `ยืนยันจุด ${stop.sequenceNo} ${stop.stopName}`)), ...wasteLineShortcuts.activePlan(plan)]));
  }
  if (params.waste === "driver_confirm_stop") {
    const plan = await ensureDriverPlan(actors.driver, params.planId, ["IN_PROGRESS", "INTERRUPTED"]);
    const [stops] = await pool.execute(`SELECT id, stop_name AS stopName FROM waste_route_stops WHERE id = ? AND route_id = ? AND is_active = 1`, [params.stopId, plan.routeId]);
    if (!stops[0]) throw new Error("ไม่พบจุดเก็บในเส้นทางนี้");
    await pool.execute(
      `INSERT INTO waste_stop_confirmations (id, plan_id, stop_id, status, confirmed_at)
       VALUES (?, ?, ?, 'COLLECTED', NOW())
       ON DUPLICATE KEY UPDATE status = 'COLLECTED', confirmed_at = NOW()`,
      [crypto.randomUUID(), plan.id, params.stopId],
    );
    return textMessage(`ยืนยันเก็บขยะแล้ว\n${stops[0].stopName}`, wasteLineShortcuts.normalize([postbackAction("จุดถัดไป", `waste=driver_stops&planId=${plan.id}`, `ดูจุดเก็บถัดไป ${plan.planNo}`), ...wasteLineShortcuts.activePlan(plan)]));
  }
  return wasteMenu(actors);
}

export function isExplicitWasteCommand(event) {
  if (event?.type === "postback") return Boolean(parsePostback(event.postback?.data).waste);
  if (event?.type !== "message" || event.message?.type !== "text") return false;
  const text = normalizeText(event.message.text).toLowerCase();
  return ["เมนูขยะ", "บริการขยะ", "รถขยะ", "เก็บขยะ", "ลงทะเบียนบริการเก็บขยะ", "กำหนดเก็บขยะ", "ตำแหน่งรถขยะ", "ค่าบริการขยะ", "งานเก็บขยะของฉัน", "ยกเลิกบริการขยะ"].includes(text)
    || /^ยืนยันคนขับ\s*\d{6}$/.test(text);
}

export async function handleWasteLineEvent(event) {
  const lineUserId = String(event?.source?.userId || "").trim();
  if (!lineUserId) return { handled: false };
  const session = await getSession(lineUserId);
  if (!session && !isExplicitWasteCommand(event)) return { handled: false };

  const text = event.type === "message" && event.message?.type === "text" ? normalizeText(event.message.text) : "";
  if (text === "ยกเลิกบริการขยะ") {
    await clearSession(lineUserId);
    const actors = await loadActors(lineUserId);
    return { handled: true, messages: [textMessage("ยกเลิกรายการที่ค้างอยู่แล้ว"), wasteMenu(actors)] };
  }

  const actors = await loadActors(lineUserId);
  let result;
  if (session?.flowType === "REGISTER") result = await handleRegistrationStep(event, lineUserId, session);
  else if (session) result = await handleDriverSession(event, lineUserId, session, actors);
  else if (/^ยืนยันคนขับ\s*\d{6}$/.test(text)) {
    await saveSession(lineUserId, "DRIVER", "DRIVER_LINK", "CODE", {});
    result = await handleDriverSession({ ...event, message: { type: "text", text: text.replace(/^ยืนยันคนขับ\s*/, "") } }, lineUserId, await getSession(lineUserId), actors);
  } else if (["ลงทะเบียนบริการเก็บขยะ"].includes(text)) result = await beginRegistration(lineUserId);
  else if (text === "กำหนดเก็บขยะ") result = await citizenSchedule(actors.citizen);
  else if (text === "ตำแหน่งรถขยะ") result = await citizenLocation(actors.citizen);
  else if (text === "ค่าบริการขยะ") result = await citizenCharges(actors.citizen);
  else if (text === "งานเก็บขยะของฉัน") result = await driverJobs(actors.driver, lineUserId);
  else if (event.type === "postback") result = await handleWasteAction(parsePostback(event.postback?.data), lineUserId, actors);
  else result = wasteMenu(actors);

  return { handled: true, messages: (Array.isArray(result) ? result : [result]).filter(Boolean), preserveRichMenu: true };
}

export async function cleanupWasteLineState() {
  const [sessions] = await pool.execute(`DELETE FROM waste_line_sessions WHERE expires_at <= NOW()`);
  const [codes] = await pool.execute(
    `DELETE FROM waste_driver_link_codes
     WHERE expires_at < DATE_SUB(NOW(), INTERVAL 1 DAY)
        OR used_at < DATE_SUB(NOW(), INTERVAL 1 DAY)`,
  );
  return { sessions: Number(sessions.affectedRows || 0), linkCodes: Number(codes.affectedRows || 0) };
}

export { normalizeText as normalizeWasteCommand, parsePostback as parseWastePostback };
