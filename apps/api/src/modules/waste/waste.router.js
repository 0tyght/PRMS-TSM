import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { config } from "../../core/config.js";
import { pool, withTransaction } from "../../core/db.js";
import { authenticate, requireRole } from "../../core/middleware.js";
import { WasteOperationPlan } from "../../domain/waste/entities/WasteOperationPlan.js";
import { HttpError } from "../../presentation/http/HttpError.js";
import { RouteAssignmentService } from "./domain/RouteAssignmentService.js";
import { WasteRouteLifecycleService } from "./domain/WasteRouteLifecycleService.js";
import { WastePlanNumberService } from "./application/WastePlanNumberService.js";
import { WasteTrackingTokenService } from "./application/WasteTrackingTokenService.js";

const router = Router();
const planNumberService = new WastePlanNumberService();
const trackingTokenService = new WasteTrackingTokenService({ secret: config.jwtSecret });
const routeAssignmentService = new RouteAssignmentService();
const routeLifecycleService = new WasteRouteLifecycleService();
const THA_PHO_BOUNDS = Object.freeze({ minLatitude: 16.70, maxLatitude: 16.805, minLongitude: 100.15, maxLongitude: 100.27 });

const dateSchema = z.string().date();
const nullableText = (max) => z.string().trim().max(max).optional().nullable().transform((value) => value || null);
const nullableNumber = z.coerce.number().finite().optional().nullable().transform((value) => value ?? null);

const vehicleSchema = z.object({
  vehicleCode: z.string().trim().min(2).max(30),
  registrationNo: z.string().trim().min(2).max(30),
  vehicleType: z.string().trim().min(2).max(100),
  capacityKg: z.coerce.number().int().positive().max(100_000).optional().nullable(),
  status: z.enum(["AVAILABLE", "IN_SERVICE", "MAINTENANCE", "OUT_OF_SERVICE"]).default("AVAILABLE"),
  note: nullableText(500),
});

const driverSchema = z.object({
  fullName: z.string().trim().min(2).max(150),
  phone: z.string().regex(/^0\d{9}$/),
  lineUserId: nullableText(100),
  isActive: z.boolean().default(true),
});

const routeSchema = z.object({
  routeCode: z.string().trim().min(2).max(30),
  routeName: z.string().trim().min(2).max(150),
  description: nullableText(500),
  routeGeojson: z.record(z.string(), z.unknown()).optional().nullable(),
  isActive: z.boolean().default(true),
});

const routePreviewSchema = z.object({
  waypoints: z.array(z.object({
    latitude: z.coerce.number().min(16.70, "จุดเส้นทางอยู่นอกเขตเทศบาลท่าโพธ์").max(16.805, "จุดเส้นทางอยู่นอกเขตเทศบาลท่าโพธ์"),
    longitude: z.coerce.number().min(100.15, "จุดเส้นทางอยู่นอกเขตเทศบาลท่าโพธ์").max(100.27, "จุดเส้นทางอยู่นอกเขตเทศบาลท่าโพธ์"),
  })).min(2).max(50),
});

const routeStopsSchema = z.object({
  stops: z.array(z.object({
    serviceUserId: z.string().uuid(),
    sequenceNo: z.coerce.number().int().positive().max(999),
  })).max(999),
});

const routeProposalSchema = z.object({ proposalId: z.string().uuid() });
const routeOptimizationSchema = z.object({
  startStopId: z.string().uuid().optional().nullable(),
  endStopId: z.string().uuid().optional().nullable(),
});

const serviceUserSchema = z.object({
  serviceNo: z.string().trim().min(2).max(30),
  fullName: z.string().trim().min(2).max(150),
  phone: z.string().regex(/^0\d{9}$/),
  houseNo: z.string().trim().min(1).max(30),
  villageId: z.coerce.number().int().positive(),
  addressDetail: nullableText(255),
  lineUserId: nullableText(100),
  routeId: z.string().uuid().optional().nullable(),
  latitude: nullableNumber,
  longitude: nullableNumber,
  isActive: z.boolean().default(true),
});

const routeAssignmentProposalSchema = z.object({ routeId: z.string().uuid() });
const routeAssignmentConfirmationSchema = z.object({ proposalId: z.string().uuid() });

const planSchema = z.object({
  planNo: z.string().trim().min(4).max(30).optional(),
  scheduledDate: dateSchema,
  routeId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  driverId: z.string().uuid(),
  scheduledStartAt: z.string().datetime().optional().nullable(),
  scheduledEndAt: z.string().datetime().optional().nullable(),
  note: nullableText(500),
});

const trackingLocationSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  accuracyM: z.coerce.number().min(0).max(10_000).optional().nullable(),
  speedKph: z.coerce.number().min(0).max(300).optional().nullable(),
  recordedAt: z.string().datetime().optional(),
});

const planStatusSchema = z.object({
  status: z.enum(["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "INTERRUPTED"]),
  note: nullableText(500),
});

const incidentSchema = z.object({
  planId: z.string().uuid().optional().nullable(),
  vehicleId: z.string().uuid().optional().nullable(),
  driverId: z.string().uuid().optional().nullable(),
  incidentType: z.enum(["VEHICLE_BREAKDOWN", "ACCIDENT", "ROAD_CLOSED", "ACCESS_BLOCKED", "OTHER"]),
  description: z.string().trim().min(4).max(1000),
  happenedAt: z.string().datetime(),
});

const incidentUpdateSchema = z.object({
  status: z.enum(["REPORTED", "ACKNOWLEDGED", "RESOLVED"]),
  replacementVehicleId: z.string().uuid().optional().nullable(),
  resolutionNote: nullableText(1000),
});

const feeRateSchema = z.object({
  rateName: z.string().trim().min(2).max(150),
  amount: z.coerce.number().positive().max(100_000),
  billingCycle: z.enum(["MONTHLY", "QUARTERLY", "YEARLY"]).default("MONTHLY"),
  isActive: z.boolean().default(true),
});

const chargeSchema = z.object({
  serviceUserId: z.string().uuid(),
  feeRateId: z.string().uuid().optional().nullable(),
  billingPeriod: dateSchema,
  dueDate: dateSchema,
  amount: z.coerce.number().positive().max(100_000),
});

const chargeUpdateSchema = z.object({
  status: z.enum(["PENDING", "PAID", "OVERDUE", "VOID"]),
});

function hashLinkCode(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function httpError(status, message) {
  return new HttpError(status, message);
}

function toBoolean(value) {
  return Boolean(Number(value));
}

function asDateTime(value) {
  return value ? new Date(value) : null;
}

function asDateOnly(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date(value));
}

function isInsideThaPho(latitude, longitude) {
  return latitude >= THA_PHO_BOUNDS.minLatitude && latitude <= THA_PHO_BOUNDS.maxLatitude
    && longitude >= THA_PHO_BOUNDS.minLongitude && longitude <= THA_PHO_BOUNDS.maxLongitude;
}

function readTrackingToken(req) {
  const authorization = String(req.headers.authorization || "");
  if (!authorization.startsWith("Bearer ")) throw httpError(401, "ไม่พบสิทธิ์ติดตามตำแหน่งรถเก็บขยะ");
  try {
    return trackingTokenService.verify(authorization.slice(7));
  } catch {
    throw httpError(401, "ลิงก์ติดตามตำแหน่งหมดอายุหรือไม่ถูกต้อง กรุณาเปิดจากเมนู LINE อีกครั้ง");
  }
}

function mapVehicle(row) {
  return {
    id: row.id,
    vehicleCode: row.vehicleCode,
    registrationNo: row.registrationNo,
    vehicleType: row.vehicleType,
    capacityKg: row.capacityKg,
    status: row.status,
    lastLatitude: row.lastLatitude,
    lastLongitude: row.lastLongitude,
    lastGpsAt: row.lastGpsAt,
    note: row.note,
  };
}

function mapDriver(row) {
  return { id: row.id, fullName: row.fullName, phone: row.phone, lineUserId: row.lineUserId, isActive: toBoolean(row.isActive) };
}

function mapRoute(row) {
  return {
    id: row.id,
    routeCode: row.routeCode,
    routeName: row.routeName,
    description: row.description,
    routeGeojson: row.routeGeojson ? JSON.parse(row.routeGeojson) : null,
    isActive: toBoolean(row.isActive),
    stopCount: Number(row.stopCount || 0),
    serviceUserCount: Number(row.serviceUserCount || 0),
  };
}

async function audit(userId, action, entityType, entityId, nextValue, ipAddress) {
  await pool.execute(
    `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, new_value, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [crypto.randomUUID(), userId, action, entityType, entityId, JSON.stringify(nextValue), ipAddress || null],
  );
}

async function syncServiceUserStop(db, serviceUserId) {
  const [rows] = await db.execute(
    `SELECT id, route_id AS routeId, full_name AS fullName, house_no AS houseNo,
            latitude, longitude, is_active AS isActive
     FROM waste_service_users WHERE id = ? FOR UPDATE`,
    [serviceUserId],
  );
  const user = rows[0];
  if (!user) return;

  const [existingRows] = await db.execute(
    `SELECT id, route_id AS routeId FROM waste_route_stops WHERE service_user_id = ? FOR UPDATE`,
    [serviceUserId],
  );
  const existing = existingRows[0];
  if (!user.routeId || !toBoolean(user.isActive)) {
    if (existing) await db.execute(`DELETE FROM waste_route_stops WHERE id = ?`, [existing.id]);
    return;
  }
  if (existing?.routeId === user.routeId) {
    await db.execute(
      `UPDATE waste_route_stops SET stop_name = ?, latitude = ?, longitude = ?, is_active = 1 WHERE id = ?`,
      [`บ้าน ${user.houseNo} · ${user.fullName}`, user.latitude, user.longitude, existing.id],
    );
    return;
  }
  if (existing) await db.execute(`DELETE FROM waste_route_stops WHERE id = ?`, [existing.id]);

  const [[sequence]] = await db.execute(
    `SELECT COALESCE(MAX(sequence_no), 0) + 1 AS nextSequence
     FROM waste_route_stops WHERE route_id = ?`,
    [user.routeId],
  );
  await db.execute(
    `INSERT INTO waste_route_stops
      (id, route_id, service_user_id, sequence_no, stop_name, latitude, longitude, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      crypto.randomUUID(),
      user.routeId,
      serviceUserId,
      Number(sequence.nextSequence || 1),
      `บ้าน ${user.houseNo} · ${user.fullName}`,
      user.latitude,
      user.longitude,
    ],
  );
}

async function markRoutesForRecalculation(db, routeIds, reason) {
  for (const routeId of new Set(routeIds.filter(Boolean))) {
    const [rows] = await db.execute(
      `SELECT CAST(route_geojson AS CHAR) AS routeGeojson FROM waste_routes WHERE id = ? FOR UPDATE`,
      [routeId],
    );
    if (!rows[0]?.routeGeojson) continue;
    const routeGeojson = routeLifecycleService.markForRecalculation(JSON.parse(rows[0].routeGeojson), reason);
    await db.execute(`UPDATE waste_routes SET route_geojson = ? WHERE id = ?`, [JSON.stringify(routeGeojson), routeId]);
  }
}

async function assertPlanAssignment(db, input, excludePlanId = null) {
  const [route] = await db.execute(
    `SELECT r.id, r.is_active AS isActive, CAST(r.route_geojson AS CHAR) AS routeGeojson,
            COUNT(CASE WHEN s.is_active = 1 THEN 1 END) AS activeStopCount
     FROM waste_routes r LEFT JOIN waste_route_stops s ON s.route_id = r.id
     WHERE r.id = ? GROUP BY r.id, r.is_active, r.route_geojson`,
    [input.routeId],
  );
  const [vehicle] = await db.execute(`SELECT id, status FROM waste_vehicles WHERE id = ?`, [input.vehicleId]);
  const [driver] = await db.execute(`SELECT id, is_active AS isActive FROM waste_drivers WHERE id = ?`, [input.driverId]);

  if (!route[0] || !toBoolean(route[0].isActive)) throw httpError(422, "เส้นทางที่เลือกถูกปิดใช้งานหรือไม่มีอยู่ในระบบ");
  const routeReadiness = routeLifecycleService.readiness(
    route[0].routeGeojson ? JSON.parse(route[0].routeGeojson) : null,
    route[0].activeStopCount,
  );
  if (!routeReadiness.ready) throw httpError(422, routeReadiness.reason);
  if (!vehicle[0]) throw httpError(422, "ไม่พบรถเก็บขยะที่เลือก");
  if (["MAINTENANCE", "OUT_OF_SERVICE"].includes(vehicle[0].status)) throw httpError(422, "รถเก็บขยะที่เลือกอยู่ระหว่างซ่อมบำรุงหรือหยุดใช้งาน");
  if (!driver[0] || !toBoolean(driver[0].isActive)) throw httpError(422, "คนขับรถเก็บขยะที่เลือกถูกปิดใช้งานหรือไม่มีอยู่ในระบบ");

  const startAt = asDateTime(input.scheduledStartAt);
  const endAt = asDateTime(input.scheduledEndAt);
  if (startAt && endAt && endAt <= startAt) throw httpError(422, "เวลาสิ้นสุดตามแผนต้องอยู่หลังเวลาเริ่ม");

  const [conflicts] = await db.execute(
    `SELECT p.id, p.plan_no AS planNo,
            CASE WHEN p.vehicle_id = ? THEN 'VEHICLE' ELSE 'DRIVER' END AS conflictType
     FROM waste_operation_plans p
     WHERE p.scheduled_date = ?
       AND p.status NOT IN ('CANCELLED')
       AND (? IS NULL OR p.id <> ?)
       AND (p.vehicle_id = ? OR p.driver_id = ?)
       AND (
         ? IS NULL OR ? IS NULL OR p.scheduled_start_at IS NULL OR p.scheduled_end_at IS NULL
         OR (? < p.scheduled_end_at AND ? > p.scheduled_start_at)
       )
     LIMIT 1`,
    [
      input.vehicleId, input.scheduledDate, excludePlanId, excludePlanId,
      input.vehicleId, input.driverId,
      startAt, endAt, startAt, endAt,
    ],
  );
  if (conflicts[0]) {
    const resource = conflicts[0].conflictType === "VEHICLE" ? "รถเก็บขยะ" : "คนขับรถเก็บขยะ";
    throw httpError(409, `${resource}ถูกมอบหมายในแผน ${conflicts[0].planNo} ช่วงเวลาเดียวกันแล้ว`);
  }
}

async function findTrackingPlan(db, claims, lock = false) {
  const [rows] = await db.execute(
    `SELECT p.id, p.plan_no AS planNo, p.status, p.vehicle_id AS vehicleId,
            p.driver_id AS driverId, DATE_FORMAT(p.scheduled_date, '%Y-%m-%d') AS scheduledDate,
            p.scheduled_start_at AS scheduledStartAt, p.scheduled_end_at AS scheduledEndAt,
            r.route_code AS routeCode, r.route_name AS routeName,
            CAST(r.route_geojson AS CHAR) AS routeGeojson,
            v.vehicle_code AS vehicleCode, v.registration_no AS registrationNo,
            v.last_latitude AS lastLatitude, v.last_longitude AS lastLongitude, v.last_gps_at AS lastGpsAt,
            d.full_name AS driverName
     FROM waste_operation_plans p
     INNER JOIN waste_routes r ON r.id = p.route_id
     INNER JOIN waste_vehicles v ON v.id = p.vehicle_id
     INNER JOIN waste_drivers d ON d.id = p.driver_id
     WHERE p.id = ? AND p.driver_id = ? AND d.line_user_id = ?
     LIMIT 1${lock ? " FOR UPDATE" : ""}`,
    [claims.planId, claims.driverId, claims.lineUserId],
  );
  if (!rows[0]) throw httpError(403, "ลิงก์นี้ไม่ตรงกับคนขับหรือแผนปฏิบัติงาน");
  return rows[0];
}

router.get("/driver-tracking/session", async (req, res, next) => {
  try {
    const claims = readTrackingToken(req);
    const plan = await findTrackingPlan(pool, claims);
    return res.json({
      data: {
        ...plan,
        routeGeojson: plan.routeGeojson ? JSON.parse(plan.routeGeojson) : null,
        canTrack: ["IN_PROGRESS", "INTERRUPTED"].includes(plan.status),
      },
    });
  } catch (error) { next(error); }
});

router.post("/driver-tracking/location", async (req, res, next) => {
  try {
    const claims = readTrackingToken(req);
    const input = trackingLocationSchema.parse(req.body);
    if (!isInsideThaPho(input.latitude, input.longitude)) {
      throw httpError(422, "ตำแหน่งอยู่นอกเขตเทศบาลท่าโพธ์ กรุณาตรวจสอบ GPS ของอุปกรณ์");
    }

    const result = await withTransaction(async (db) => {
      const plan = await findTrackingPlan(db, claims, true);
      if (!["IN_PROGRESS", "INTERRUPTED"].includes(plan.status)) {
        throw httpError(409, "ส่งตำแหน่งได้เฉพาะแผนที่กำลังปฏิบัติงาน");
      }
      const [recent] = await db.execute(
        `SELECT recorded_at AS recordedAt FROM waste_location_logs
         WHERE plan_id = ? ORDER BY recorded_at DESC LIMIT 1`,
        [plan.id],
      );
      if (recent[0] && Date.now() - new Date(recent[0].recordedAt).getTime() < 7_000) {
        return { accepted: false, reason: "TOO_FREQUENT", plan };
      }
      const recordedAt = input.recordedAt ? new Date(input.recordedAt) : new Date();
      await db.execute(
        `INSERT INTO waste_location_logs
          (plan_id, latitude, longitude, accuracy_m, speed_kph, recorded_at, source)
         VALUES (?, ?, ?, ?, ?, ?, 'LINE')`,
        [plan.id, input.latitude, input.longitude, input.accuracyM ?? null, input.speedKph ?? null, recordedAt],
      );
      await db.execute(
        `UPDATE waste_vehicles SET last_latitude = ?, last_longitude = ?, last_gps_at = ? WHERE id = ?`,
        [input.latitude, input.longitude, recordedAt, plan.vehicleId],
      );
      return { accepted: true, plan };
    });
    return res.status(result.accepted ? 201 : 202).json({
      data: { accepted: result.accepted, reason: result.reason || null, serverTime: new Date().toISOString() },
    });
  } catch (error) { next(error); }
});

router.use(authenticate);

router.get("/dashboard", requireRole("ADMIN", "OFFICER", "VIEWER"), async (req, res, next) => {
  try {
    const { date } = z.object({ date: dateSchema.optional() }).parse(req.query);
    const selectedDate = date || new Date().toISOString().slice(0, 10);
    const [[summary], [activePlans], [incidents], [overdueCharges], [routes]] = await Promise.all([
      pool.execute(
        `SELECT
          (SELECT COUNT(*) FROM waste_vehicles WHERE status = 'AVAILABLE') AS availableVehicles,
          (SELECT COUNT(*) FROM waste_vehicles WHERE status = 'MAINTENANCE') AS maintenanceVehicles,
          (SELECT COUNT(*) FROM waste_operation_plans WHERE scheduled_date = ? AND status = 'SCHEDULED') AS scheduledPlans,
          (SELECT COUNT(*) FROM waste_operation_plans WHERE scheduled_date = ? AND status = 'IN_PROGRESS') AS operatingPlans,
          (SELECT COUNT(*) FROM waste_operation_plans WHERE scheduled_date = ? AND status = 'COMPLETED') AS completedPlans,
          (SELECT COUNT(*) FROM waste_service_users WHERE is_active = 1 AND route_id IS NULL) AS unassignedServiceUsers,
          (SELECT COUNT(*) FROM waste_service_users WHERE is_active = 1 AND (latitude IS NULL OR longitude IS NULL)) AS serviceUsersWithoutLocation`,
        [selectedDate, selectedDate, selectedDate],
      ),
      pool.execute(
        `SELECT p.id, p.plan_no AS planNo, p.status, DATE_FORMAT(p.scheduled_date, '%Y-%m-%d') AS scheduledDate,
                r.id AS routeId, r.route_name AS routeName, v.vehicle_code AS vehicleCode, v.registration_no AS registrationNo,
                d.full_name AS driverName, v.last_latitude AS latitude, v.last_longitude AS longitude,
                v.last_gps_at AS lastGpsAt,
                (SELECT COUNT(*) FROM waste_route_stops s WHERE s.route_id = p.route_id AND s.is_active = 1) AS stopTotal,
                (SELECT COUNT(*) FROM waste_stop_confirmations c WHERE c.plan_id = p.id AND c.status = 'COLLECTED') AS collectedStops
         FROM waste_operation_plans p
         INNER JOIN waste_routes r ON r.id = p.route_id
         INNER JOIN waste_vehicles v ON v.id = p.vehicle_id
         INNER JOIN waste_drivers d ON d.id = p.driver_id
         WHERE p.scheduled_date = ? AND p.status IN ('SCHEDULED', 'IN_PROGRESS', 'INTERRUPTED')
         ORDER BY FIELD(p.status, 'IN_PROGRESS', 'INTERRUPTED', 'SCHEDULED'), p.scheduled_start_at, p.created_at`,
        [selectedDate],
      ),
      pool.execute(
        `SELECT i.id, i.incident_type AS incidentType, i.status, i.description, i.happened_at AS happenedAt,
                p.plan_no AS planNo, v.vehicle_code AS vehicleCode
         FROM waste_incidents i
         LEFT JOIN waste_operation_plans p ON p.id = i.plan_id
         LEFT JOIN waste_vehicles v ON v.id = i.vehicle_id
         WHERE i.status <> 'RESOLVED'
         ORDER BY i.happened_at DESC LIMIT 6`,
      ),
      pool.execute(
        `SELECT COUNT(*) AS total, COALESCE(SUM(amount), 0) AS amount
         FROM waste_service_charges WHERE status IN ('PENDING', 'OVERDUE') AND due_date < CURDATE()`,
      ),
      pool.execute(
        `SELECT r.id, r.route_code AS routeCode, r.route_name AS routeName, r.description,
                CAST(r.route_geojson AS CHAR) AS routeGeojson, r.is_active AS isActive,
                COUNT(DISTINCT s.id) AS stopCount, COUNT(DISTINCT u.id) AS serviceUserCount
         FROM waste_routes r
         LEFT JOIN waste_route_stops s ON s.route_id = r.id AND s.is_active = 1
         LEFT JOIN waste_service_users u ON u.route_id = r.id AND u.is_active = 1
         WHERE r.is_active = 1
         GROUP BY r.id, r.route_code, r.route_name, r.description, r.route_geojson, r.is_active
         ORDER BY r.route_code`,
      ),
    ]);

    return res.json({
      data: {
        date: selectedDate,
        summary: {
          availableVehicles: Number(summary[0].availableVehicles || 0),
          maintenanceVehicles: Number(summary[0].maintenanceVehicles || 0),
          scheduledPlans: Number(summary[0].scheduledPlans || 0),
          operatingPlans: Number(summary[0].operatingPlans || 0),
          completedPlans: Number(summary[0].completedPlans || 0),
          unassignedServiceUsers: Number(summary[0].unassignedServiceUsers || 0),
          serviceUsersWithoutLocation: Number(summary[0].serviceUsersWithoutLocation || 0),
          overdueCharges: Number(overdueCharges[0].total || 0),
          overdueAmount: Number(overdueCharges[0].amount || 0),
        },
        activePlans: activePlans.map((row) => ({ ...row, stopTotal: Number(row.stopTotal || 0), collectedStops: Number(row.collectedStops || 0) })),
        routes: routes.map(mapRoute),
        incidents,
      },
    });
  } catch (error) { next(error); }
});

router.get("/vehicles", requireRole("ADMIN", "OFFICER", "VIEWER"), async (req, res, next) => {
  try {
    const { status, search } = z.object({ status: z.enum(["AVAILABLE", "IN_SERVICE", "MAINTENANCE", "OUT_OF_SERVICE"]).optional(), search: z.string().trim().max(100).optional() }).parse(req.query);
    const terms = [];
    const values = [];
    if (status) { terms.push("status = ?"); values.push(status); }
    if (search) { terms.push("(vehicle_code LIKE ? OR registration_no LIKE ? OR vehicle_type LIKE ?)"); values.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    const [rows] = await pool.execute(`SELECT id, vehicle_code AS vehicleCode, registration_no AS registrationNo, vehicle_type AS vehicleType, capacity_kg AS capacityKg, status, last_latitude AS lastLatitude, last_longitude AS lastLongitude, last_gps_at AS lastGpsAt, note FROM waste_vehicles ${terms.length ? `WHERE ${terms.join(" AND ")}` : ""} ORDER BY vehicle_code`, values);
    return res.json({ data: rows.map(mapVehicle) });
  } catch (error) { next(error); }
});

router.post("/vehicles", requireRole("ADMIN", "OFFICER"), async (req, res, next) => {
  try {
    const input = vehicleSchema.parse(req.body);
    const id = crypto.randomUUID();
    await pool.execute(`INSERT INTO waste_vehicles (id, vehicle_code, registration_no, vehicle_type, capacity_kg, status, note) VALUES (?, ?, ?, ?, ?, ?, ?)`, [id, input.vehicleCode, input.registrationNo, input.vehicleType, input.capacityKg, input.status, input.note]);
    await audit(req.user.sub, "CREATE_WASTE_VEHICLE", "WASTE_VEHICLE", id, input, req.ip);
    return res.status(201).json({ data: { id, ...input } });
  } catch (error) { next(error); }
});

router.patch("/vehicles/:id", requireRole("ADMIN", "OFFICER"), async (req, res, next) => {
  try {
    const input = vehicleSchema.partial().parse(req.body);
    if (!Object.keys(input).length) throw httpError(422, "กรุณาระบุข้อมูลรถเก็บขยะที่ต้องการปรับปรุง");
    const fields = { vehicleCode: "vehicle_code", registrationNo: "registration_no", vehicleType: "vehicle_type", capacityKg: "capacity_kg", status: "status", note: "note" };
    const values = [];
    const sets = Object.entries(input).map(([key, value]) => { values.push(value); return `${fields[key]} = ?`; });
    values.push(req.params.id);
    const [result] = await pool.execute(`UPDATE waste_vehicles SET ${sets.join(", ")} WHERE id = ?`, values);
    if (!result.affectedRows) throw httpError(404, "ไม่พบข้อมูลรถเก็บขยะ");
    await audit(req.user.sub, "UPDATE_WASTE_VEHICLE", "WASTE_VEHICLE", req.params.id, input, req.ip);
    return res.json({ data: { id: req.params.id, ...input } });
  } catch (error) { next(error); }
});

router.delete("/vehicles/:id", requireRole("ADMIN", "OFFICER"), async (req, res, next) => {
  try {
    const [[usage]] = await pool.execute(
      `SELECT (SELECT COUNT(*) FROM waste_operation_plans WHERE vehicle_id = ?) +
              (SELECT COUNT(*) FROM waste_incidents WHERE vehicle_id = ? OR replacement_vehicle_id = ?) AS usageCount`,
      [req.params.id, req.params.id, req.params.id],
    );
    if (Number(usage.usageCount || 0) > 0) {
      throw httpError(409, "รถคันนี้มีประวัติการใช้งานแล้ว กรุณาเปลี่ยนสถานะเป็นหยุดใช้งานแทนการลบ");
    }
    const [result] = await pool.execute(`DELETE FROM waste_vehicles WHERE id = ?`, [req.params.id]);
    if (!result.affectedRows) throw httpError(404, "ไม่พบข้อมูลรถเก็บขยะ");
    await audit(req.user.sub, "DELETE_WASTE_VEHICLE", "WASTE_VEHICLE", req.params.id, null, req.ip);
    return res.status(204).end();
  } catch (error) { next(error); }
});

router.get("/drivers", requireRole("ADMIN", "OFFICER", "VIEWER"), async (_req, res, next) => {
  try {
    const [rows] = await pool.execute(`SELECT id, full_name AS fullName, phone, line_user_id AS lineUserId, is_active AS isActive FROM waste_drivers ORDER BY is_active DESC, full_name`);
    return res.json({ data: rows.map(mapDriver) });
  } catch (error) { next(error); }
});

router.post("/drivers", requireRole("ADMIN", "OFFICER"), async (req, res, next) => {
  try {
    const input = driverSchema.parse(req.body);
    const id = crypto.randomUUID();
    await pool.execute(`INSERT INTO waste_drivers (id, full_name, phone, line_user_id, is_active) VALUES (?, ?, ?, ?, ?)`, [id, input.fullName, input.phone, input.lineUserId, input.isActive]);
    await audit(req.user.sub, "CREATE_WASTE_DRIVER", "WASTE_DRIVER", id, input, req.ip);
    return res.status(201).json({ data: { id, ...input } });
  } catch (error) { next(error); }
});

router.patch("/drivers/:id", requireRole("ADMIN", "OFFICER"), async (req, res, next) => {
  try {
    const input = driverSchema.partial().parse(req.body);
    if (!Object.keys(input).length) throw httpError(422, "กรุณาระบุข้อมูลคนขับรถเก็บขยะที่ต้องการปรับปรุง");
    const fields = { fullName: "full_name", phone: "phone", lineUserId: "line_user_id", isActive: "is_active" };
    const values = [];
    const sets = Object.entries(input).map(([key, value]) => { values.push(value); return `${fields[key]} = ?`; });
    values.push(req.params.id);
    const [result] = await pool.execute(`UPDATE waste_drivers SET ${sets.join(", ")} WHERE id = ?`, values);
    if (!result.affectedRows) throw httpError(404, "ไม่พบข้อมูลคนขับรถเก็บขยะ");
    await audit(req.user.sub, "UPDATE_WASTE_DRIVER", "WASTE_DRIVER", req.params.id, input, req.ip);
    return res.json({ data: { id: req.params.id, ...input } });
  } catch (error) { next(error); }
});

router.delete("/drivers/:id", requireRole("ADMIN", "OFFICER"), async (req, res, next) => {
  try {
    const [[usage]] = await pool.execute(
      `SELECT (SELECT COUNT(*) FROM waste_operation_plans WHERE driver_id = ?) +
              (SELECT COUNT(*) FROM waste_incidents WHERE driver_id = ?) AS usageCount`,
      [req.params.id, req.params.id],
    );
    if (Number(usage.usageCount || 0) > 0) {
      throw httpError(409, "คนขับรายนี้มีประวัติการปฏิบัติงานแล้ว กรุณาปิดการใช้งานแทนการลบ");
    }
    const [result] = await pool.execute(`DELETE FROM waste_drivers WHERE id = ?`, [req.params.id]);
    if (!result.affectedRows) throw httpError(404, "ไม่พบข้อมูลคนขับรถเก็บขยะ");
    await audit(req.user.sub, "DELETE_WASTE_DRIVER", "WASTE_DRIVER", req.params.id, null, req.ip);
    return res.status(204).end();
  } catch (error) { next(error); }
});

router.post("/drivers/:id/line-link-code", requireRole("ADMIN", "OFFICER"), async (req, res, next) => {
  try {
    const [rows] = await pool.execute(`SELECT id, full_name AS fullName FROM waste_drivers WHERE id = ?`, [req.params.id]);
    if (!rows[0]) throw httpError(404, "ไม่พบข้อมูลคนขับรถเก็บขยะ");

    let code;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = String(crypto.randomInt(100000, 1000000));
      const [duplicates] = await pool.execute(
        `SELECT id FROM waste_driver_link_codes
         WHERE code_hash = ? AND used_at IS NULL AND expires_at > NOW() LIMIT 1`,
        [hashLinkCode(candidate)],
      );
      if (!duplicates.length) { code = candidate; break; }
    }
    if (!code) throw httpError(503, "ไม่สามารถสร้างรหัสเชื่อม LINE ได้ กรุณาลองอีกครั้ง");

    const id = crypto.randomUUID();
    await withTransaction(async (db) => {
      await db.execute(
        `UPDATE waste_driver_link_codes SET used_at = NOW()
         WHERE driver_id = ? AND used_at IS NULL`,
        [req.params.id],
      );
      await db.execute(
        `INSERT INTO waste_driver_link_codes (id, driver_id, code_hash, expires_at, created_by)
         VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE), ?)`,
        [id, req.params.id, hashLinkCode(code), req.user.sub],
      );
    });
    await audit(req.user.sub, "CREATE_WASTE_DRIVER_LINE_CODE", "WASTE_DRIVER", req.params.id, { expiresInMinutes: 15 }, req.ip);
    return res.status(201).json({ data: { code, driverName: rows[0].fullName, expiresInMinutes: 15 } });
  } catch (error) { next(error); }
});

router.get("/routes", requireRole("ADMIN", "OFFICER", "VIEWER"), async (_req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT r.id, r.route_code AS routeCode, r.route_name AS routeName, r.description,
              CAST(r.route_geojson AS CHAR) AS routeGeojson, r.is_active AS isActive,
              COUNT(DISTINCT s.id) AS stopCount, COUNT(DISTINCT u.id) AS serviceUserCount
       FROM waste_routes r
       LEFT JOIN waste_route_stops s ON s.route_id = r.id AND s.is_active = 1
       LEFT JOIN waste_service_users u ON u.route_id = r.id AND u.is_active = 1
       GROUP BY r.id, r.route_code, r.route_name, r.description, r.route_geojson, r.is_active
       ORDER BY r.is_active DESC, r.route_code`,
    );
    return res.json({ data: rows.map(mapRoute) });
  } catch (error) { next(error); }
});

router.post("/routes/preview", requireRole("ADMIN", "OFFICER"), async (req, res, next) => {
  try {
    const input = routePreviewSchema.parse(req.body);
    const coordinates = input.waypoints
      .map((point) => `${point.longitude.toFixed(7)},${point.latitude.toFixed(7)}`)
      .join(";");
    const query = new URLSearchParams({ overview: "full", geometries: "geojson", steps: "false" });
    let response;
    try {
      response = await fetch(`${config.routingApiBaseUrl}/route/v1/driving/${coordinates}?${query}`, {
        headers: { Accept: "application/json", "User-Agent": "Smart-Tha-Pho/1.0" },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw httpError(502, "ไม่สามารถเชื่อมต่อบริการคำนวณเส้นทางได้ในขณะนี้");
    }
    if (!response.ok) throw httpError(502, "ไม่สามารถคำนวณเส้นทางตามถนนได้ในขณะนี้");
    const result = await response.json();
    const route = result.routes?.[0];
    if (result.code !== "Ok" || !route?.geometry) throw httpError(422, "ไม่พบถนนที่เชื่อมต่อระหว่างจุดที่เลือก");
    return res.json({
      data: {
        routeGeojson: {
          type: "Feature",
          properties: {
            waypoints: input.waypoints,
            distanceMeters: Math.round(route.distance || 0),
            durationSeconds: Math.round(route.duration || 0),
            source: "OpenStreetMap / OSRM",
          },
          geometry: route.geometry,
        },
        distanceMeters: Math.round(route.distance || 0),
        durationSeconds: Math.round(route.duration || 0),
        snappedWaypoints: (result.waypoints || []).map((point) => ({
          name: point.name || "",
          longitude: point.location?.[0],
          latitude: point.location?.[1],
          distanceMeters: point.distance,
        })),
      },
    });
  } catch (error) { next(error); }
});

router.post("/routes", requireRole("ADMIN", "OFFICER"), async (req, res, next) => {
  try {
    const input = routeSchema.parse(req.body);
    const id = crypto.randomUUID();
    await pool.execute(`INSERT INTO waste_routes (id, route_code, route_name, description, route_geojson, is_active) VALUES (?, ?, ?, ?, ?, ?)`, [id, input.routeCode, input.routeName, input.description, input.routeGeojson ? JSON.stringify(input.routeGeojson) : null, input.isActive]);
    await audit(req.user.sub, "CREATE_WASTE_ROUTE", "WASTE_ROUTE", id, input, req.ip);
    return res.status(201).json({ data: { id, ...input, stopCount: 0, serviceUserCount: 0 } });
  } catch (error) { next(error); }
});

router.patch("/routes/:id", requireRole("ADMIN", "OFFICER"), async (req, res, next) => {
  try {
    const input = routeSchema.partial().parse(req.body);
    if (!Object.keys(input).length) throw httpError(422, "กรุณาระบุข้อมูลเส้นทางเก็บขยะที่ต้องการปรับปรุง");
    if (input.routeGeojson !== undefined) throw httpError(422, "แนวถนนแก้ไขด้วยมือไม่ได้ กรุณาใช้คำสั่งคำนวณและยืนยันเส้นทางจากจุดรับบริการ");
    if (input.isActive === false) {
      const [[usage]] = await pool.execute(
        `SELECT (SELECT COUNT(*) FROM waste_operation_plans WHERE route_id = ? AND status IN ('SCHEDULED','IN_PROGRESS','INTERRUPTED')) AS activePlanCount,
                (SELECT COUNT(*) FROM waste_service_users WHERE route_id = ? AND is_active = 1) AS activeUserCount`,
        [req.params.id, req.params.id],
      );
      if (Number(usage.activePlanCount || 0) || Number(usage.activeUserCount || 0)) {
        throw httpError(409, "เส้นทางยังมีแผนงานหรือจุดรับบริการที่เปิดใช้งาน กรุณาย้ายข้อมูลออกก่อนปิดเส้นทาง");
      }
    }
    const fields = { routeCode: "route_code", routeName: "route_name", description: "description", routeGeojson: "route_geojson", isActive: "is_active" };
    const values = [];
    const sets = Object.entries(input).map(([key, value]) => { values.push(key === "routeGeojson" && value ? JSON.stringify(value) : value); return `${fields[key]} = ?`; });
    values.push(req.params.id);
    const [result] = await pool.execute(`UPDATE waste_routes SET ${sets.join(", ")} WHERE id = ?`, values);
    if (!result.affectedRows) throw httpError(404, "ไม่พบข้อมูลเส้นทางเก็บขยะ");
    await audit(req.user.sub, "UPDATE_WASTE_ROUTE", "WASTE_ROUTE", req.params.id, input, req.ip);
    return res.json({ data: { id: req.params.id, ...input } });
  } catch (error) { next(error); }
});

router.delete("/routes/:id", requireRole("ADMIN", "OFFICER"), async (req, res, next) => {
  try {
    const [[usage]] = await pool.execute(
      `SELECT (SELECT COUNT(*) FROM waste_operation_plans WHERE route_id = ?) AS planCount,
              (SELECT COUNT(*) FROM waste_service_users WHERE route_id = ?) AS userCount`,
      [req.params.id, req.params.id],
    );
    if (Number(usage.planCount || 0) > 0 || Number(usage.userCount || 0) > 0) {
      throw httpError(409, "เส้นทางนี้ผูกกับแผนงานหรือผู้ใช้บริการแล้ว กรุณาปิดการใช้งานแทนการลบ");
    }
    const [result] = await pool.execute(`DELETE FROM waste_routes WHERE id = ?`, [req.params.id]);
    if (!result.affectedRows) throw httpError(404, "ไม่พบข้อมูลเส้นทางเก็บขยะ");
    await audit(req.user.sub, "DELETE_WASTE_ROUTE", "WASTE_ROUTE", req.params.id, null, req.ip);
    return res.status(204).end();
  } catch (error) { next(error); }
});

router.get("/routes/:id/stops", requireRole("ADMIN", "OFFICER", "VIEWER"), async (req, res, next) => {
  try {
    const [routeRows] = await pool.execute(`SELECT id FROM waste_routes WHERE id = ?`, [req.params.id]);
    if (!routeRows[0]) throw httpError(404, "ไม่พบข้อมูลเส้นทางเก็บขยะ");
    const [rows] = await pool.execute(
      `SELECT s.id, s.service_user_id AS serviceUserId, s.sequence_no AS sequenceNo,
              s.stop_name AS stopName, s.latitude, s.longitude,
              u.service_no AS serviceNo, u.full_name AS fullName, u.house_no AS houseNo,
              v.village_no AS villageNo
       FROM waste_route_stops s
       LEFT JOIN waste_service_users u ON u.id = s.service_user_id
       LEFT JOIN villages v ON v.id = u.village_id
       WHERE s.route_id = ? AND s.is_active = 1
       ORDER BY s.sequence_no`,
      [req.params.id],
    );
    return res.json({ data: rows.map((row) => ({ ...row, sequenceNo: Number(row.sequenceNo) })) });
  } catch (error) { next(error); }
});

const planPublicationSchema = z.object({
  publicNote: nullableText(500),
});

const planWithdrawalSchema = z.object({
  reason: z.string().trim().min(4, "กรุณาระบุเหตุผลการถอนประกาศอย่างน้อย 4 ตัวอักษร").max(500),
});

function routeOptimizationError(error) {
  const errors = {
    ROUTE_NOT_FOUND: [404, "ไม่พบข้อมูลเส้นทางเก็บขยะ"],
    ROUTE_BASELINE_MISSING: [422, "เส้นทางนี้ยังไม่มีแนววิ่งเดิมหรือค่าระยะทางที่ยืนยันแล้ว กรุณากำหนดเส้นทางหลักก่อนเพิ่มผู้ใช้บริการ"],
    ROUTE_GEOMETRY_MISSING: [422, "เส้นทางนี้ยังไม่มีแนวถนนที่พร้อมใช้ กรุณากำหนดเส้นทางหลักก่อนเพิ่มผู้ใช้บริการ"],
    INSUFFICIENT_STOPS: [422, "ต้องมีจุดเก็บขยะที่ระบุตำแหน่งอย่างน้อย 2 จุด"],
    STOPS_MISSING_LOCATION: [422, "ยังมีจุดเก็บขยะที่ไม่มีพิกัด กรุณาระบุตำแหน่งให้ครบก่อนคำนวณ"],
    TOO_MANY_STOPS: [422, "เส้นทางหนึ่งรองรับการจัดลำดับอัตโนมัติไม่เกิน 50 จุด กรุณาแบ่งเป็นรอบย่อย"],
    ROUTE_NOT_FOUND_BY_PROVIDER: [422, "ไม่พบถนนที่เชื่อมต่อจุดเก็บขยะทั้งหมด"],
    ROUTING_SERVICE_UNAVAILABLE: [502, "ไม่สามารถเชื่อมต่อบริการคำนวณเส้นทางได้ในขณะนี้"],
    ROUTING_SERVICE_FAILED: [502, "บริการคำนวณเส้นทางไม่สามารถประมวลผลจุดเก็บขยะได้"],
    PROPOSAL_EXPIRED: [410, "ข้อเสนอเส้นทางหมดอายุแล้ว กรุณาคำนวณใหม่"],
    PROPOSAL_ROUTE_MISMATCH: [422, "ข้อเสนอเส้นทางไม่ตรงกับเส้นทางที่เลือก"],
    ROUTE_STOPS_CHANGED: [409, "จุดเก็บขยะมีการเปลี่ยนแปลงหลังคำนวณ กรุณาคำนวณใหม่ก่อนยืนยัน"],
    START_STOP_NOT_FOUND: [422, "ไม่พบจุดเริ่มต้นในเส้นทางนี้"],
    END_STOP_NOT_FOUND: [422, "ไม่พบจุดสิ้นสุดในเส้นทางนี้"],
    START_END_STOP_MUST_DIFFER: [422, "จุดเริ่มต้นและจุดสิ้นสุดต้องเป็นคนละจุด หรือเลือกกลับจุดเริ่มต้น"],
    SERVICE_USER_NOT_FOUND: [404, "ไม่พบผู้ใช้บริการเก็บขยะที่เปิดใช้งาน"],
    SERVICE_USER_MISSING_LOCATION: [422, "กรุณาระบุตำแหน่งจุดรับขยะก่อนกำหนดเส้นทาง"],
    SERVICE_LOCATION_OUTSIDE_ROUTE: [422, "จุดรับขยะอยู่ห่างจากเส้นทางเกินระยะที่กำหนด กรุณาตรวจพิกัดหรือเลือกเส้นทางที่อยู่ในระยะ"],
    ASSIGNMENT_PROPOSAL_MISMATCH: [422, "ผลคำนวณนี้ไม่ตรงกับผู้ใช้บริการที่กำลังกำหนดเส้นทาง"],
    SERVICE_USER_ROUTE_CHANGED: [409, "เส้นทางของผู้ใช้บริการมีการเปลี่ยนแปลง กรุณาคำนวณใหม่"],
    SERVICE_USER_LOCATION_CHANGED: [409, "ตำแหน่งจุดรับขยะมีการเปลี่ยนแปลง กรุณาคำนวณใหม่"],
  };
  const [status, message] = errors[error.message] || [500, "ไม่สามารถจัดเส้นทางเก็บขยะได้"];
  return httpError(status, message);
}

router.post("/routes/:id/optimization-proposals", requireRole("ADMIN", "OFFICER"), async (req, res, next) => {
  try {
    const input = routeOptimizationSchema.parse(req.body);
    const proposal = await req.app.locals.wasteRouteOptimization.propose.execute({ routeId: req.params.id, ...input });
    return res.status(201).json({
      data: {
        proposalId: proposal.id,
        routeId: proposal.routeId,
        stops: proposal.stops.map((stop, index) => ({ ...stop, sequenceNo: index + 1 })),
        routeGeojson: proposal.toGeoJson(),
        distanceMeters: proposal.distanceMeters,
        durationSeconds: proposal.durationSeconds,
        expiresAt: proposal.expiresAt,
      },
    });
  } catch (error) {
    return next(routeOptimizationError(error));
  }
});

router.post("/routes/:id/optimization-confirmations", requireRole("ADMIN", "OFFICER"), async (req, res, next) => {
  try {
    const input = routeProposalSchema.parse(req.body);
    const proposal = await req.app.locals.wasteRouteOptimization.confirm.execute({
      routeId: req.params.id,
      proposalId: input.proposalId,
      confirmedBy: req.user.sub,
      ipAddress: req.ip,
    });
    return res.json({
      data: {
        routeId: proposal.routeId,
        stopCount: proposal.stops.length,
        distanceMeters: proposal.distanceMeters,
        durationSeconds: proposal.durationSeconds,
        confirmed: true,
      },
    });
  } catch (error) { next(routeOptimizationError(error)); }
});

router.put("/routes/:id/stops", requireRole("ADMIN", "OFFICER"), async (req, res, next) => {
  try {
    const input = routeStopsSchema.parse(req.body);
    const ids = input.stops.map((stop) => stop.serviceUserId);
    if (new Set(ids).size !== ids.length) throw httpError(422, "ผู้ใช้บริการแต่ละรายต้องอยู่ในจุดเก็บเพียงหนึ่งตำแหน่ง");
    if (new Set(input.stops.map((stop) => stop.sequenceNo)).size !== input.stops.length) throw httpError(422, "ลำดับจุดเก็บต้องไม่ซ้ำกัน");

    await withTransaction(async (db) => {
      const [routeRows] = await db.execute(`SELECT id FROM waste_routes WHERE id = ? FOR UPDATE`, [req.params.id]);
      if (!routeRows[0]) throw httpError(404, "ไม่พบข้อมูลเส้นทางเก็บขยะ");

      if (ids.length) {
        const placeholders = ids.map(() => "?").join(",");
        const [users] = await db.execute(
          `SELECT id, full_name AS fullName, house_no AS houseNo, latitude, longitude
           FROM waste_service_users
           WHERE route_id = ? AND is_active = 1 AND id IN (${placeholders})`,
          [req.params.id, ...ids],
        );
        if (users.length !== ids.length) throw httpError(422, "มีผู้ใช้บริการที่ไม่ได้อยู่ในเส้นทางนี้หรือปิดบริการแล้ว");
        const byId = new Map(users.map((user) => [user.id, user]));
        await db.execute(`DELETE FROM waste_route_stops WHERE route_id = ?`, [req.params.id]);
        for (const stop of input.stops.slice().sort((a, b) => a.sequenceNo - b.sequenceNo)) {
          const user = byId.get(stop.serviceUserId);
          await db.execute(
            `INSERT INTO waste_route_stops
              (id, route_id, service_user_id, sequence_no, stop_name, latitude, longitude, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
            [crypto.randomUUID(), req.params.id, user.id, stop.sequenceNo, `บ้าน ${user.houseNo} · ${user.fullName}`, user.latitude, user.longitude],
          );
        }
      } else {
        await db.execute(`DELETE FROM waste_route_stops WHERE route_id = ?`, [req.params.id]);
      }
    });
    await audit(req.user.sub, "REORDER_WASTE_ROUTE_STOPS", "WASTE_ROUTE", req.params.id, input, req.ip);
    return res.json({ data: { routeId: req.params.id, stopCount: input.stops.length } });
  } catch (error) { next(error); }
});

router.get("/plans", requireRole("ADMIN", "OFFICER", "VIEWER"), async (req, res, next) => {
  try {
    const { date } = z.object({ date: dateSchema.optional() }).parse(req.query);
    const values = date ? [date] : [];
    const [rows] = await pool.execute(
      `SELECT p.id, p.plan_no AS planNo, DATE_FORMAT(p.scheduled_date, '%Y-%m-%d') AS scheduledDate, p.status,
              p.publication_status AS publicationStatus, p.publication_version AS publicationVersion,
              p.public_note AS publicNote, p.published_at AS publishedAt, p.withdrawn_at AS withdrawnAt,
              p.scheduled_start_at AS scheduledStartAt, p.scheduled_end_at AS scheduledEndAt,
              p.actual_start_at AS actualStartAt, p.actual_end_at AS actualEndAt, p.note,
              r.id AS routeId, r.route_name AS routeName, v.id AS vehicleId, v.vehicle_code AS vehicleCode,
              d.id AS driverId, d.full_name AS driverName,
              (SELECT COUNT(*) FROM waste_route_stops s WHERE s.route_id = p.route_id AND s.is_active = 1) AS stopTotal,
              (SELECT COUNT(*) FROM waste_stop_confirmations c WHERE c.plan_id = p.id AND c.status = 'COLLECTED') AS collectedStops,
              (SELECT COUNT(*) FROM waste_service_users u WHERE u.route_id = p.route_id AND u.is_active = 1 AND u.line_user_id IS NOT NULL AND u.line_user_id <> '') AS lineRecipientCount,
              (SELECT COUNT(*) FROM waste_line_notifications n WHERE n.plan_id = p.id AND n.notification_type = 'SCHEDULE_PUBLISHED' AND n.delivery_status = 'SENT') AS lineSentCount,
              (SELECT COUNT(*) FROM waste_line_notifications n WHERE n.plan_id = p.id AND n.notification_type = 'SCHEDULE_PUBLISHED' AND n.delivery_status IN ('PENDING','PROCESSING')) AS linePendingCount,
              (SELECT COUNT(*) FROM waste_line_notifications n WHERE n.plan_id = p.id AND n.notification_type = 'SCHEDULE_PUBLISHED' AND n.delivery_status = 'FAILED') AS lineFailedCount
       FROM waste_operation_plans p
       INNER JOIN waste_routes r ON r.id = p.route_id
       INNER JOIN waste_vehicles v ON v.id = p.vehicle_id
       INNER JOIN waste_drivers d ON d.id = p.driver_id
       ${date ? "WHERE p.scheduled_date = ?" : ""}
       ORDER BY p.scheduled_date DESC, p.scheduled_start_at, p.created_at DESC`,
      values,
    );
    return res.json({ data: rows.map((row) => ({
      ...row,
      publicationVersion: Number(row.publicationVersion || 0),
      stopTotal: Number(row.stopTotal || 0),
      collectedStops: Number(row.collectedStops || 0),
      lineRecipientCount: Number(row.lineRecipientCount || 0),
      lineSentCount: Number(row.lineSentCount || 0),
      linePendingCount: Number(row.linePendingCount || 0),
      lineFailedCount: Number(row.lineFailedCount || 0),
    })) });
  } catch (error) { next(error); }
});

router.post("/plans", requireRole("ADMIN", "OFFICER"), async (req, res, next) => {
  try {
    const input = planSchema.parse(req.body);
    const id = crypto.randomUUID();
    let planNo = input.planNo;
    await withTransaction(async (db) => {
      await assertPlanAssignment(db, input);
      planNo ||= await planNumberService.next(db, input.scheduledDate);
      await db.execute(`INSERT INTO waste_operation_plans (id, plan_no, scheduled_date, route_id, vehicle_id, driver_id, scheduled_start_at, scheduled_end_at, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, planNo, input.scheduledDate, input.routeId, input.vehicleId, input.driverId, asDateTime(input.scheduledStartAt), asDateTime(input.scheduledEndAt), input.note, req.user.sub]);
    });
    const created = { ...input, planNo };
    await audit(req.user.sub, "CREATE_WASTE_PLAN", "WASTE_PLAN", id, created, req.ip);
    return res.status(201).json({ data: { id, ...created, status: "SCHEDULED" } });
  } catch (error) { next(error); }
});

router.patch("/plans/:id", requireRole("ADMIN", "OFFICER"), async (req, res, next) => {
  try {
    const input = planSchema.partial().parse(req.body);
    if (!Object.keys(input).length) throw httpError(422, "กรุณาระบุข้อมูลแผนปฏิบัติงานที่ต้องการปรับปรุง");
    await withTransaction(async (db) => {
      const [planRows] = await db.execute(
        `SELECT status, plan_no AS planNo, scheduled_date AS scheduledDate, route_id AS routeId,
                vehicle_id AS vehicleId, driver_id AS driverId,
                scheduled_start_at AS scheduledStartAt, scheduled_end_at AS scheduledEndAt
         FROM waste_operation_plans WHERE id = ? FOR UPDATE`,
        [req.params.id],
      );
      if (!planRows[0]) throw httpError(404, "ไม่พบแผนปฏิบัติงานเก็บขยะ");
      new WasteOperationPlan({ id: req.params.id, ...planRows[0] }).assertEditable();
      const current = planRows[0];
      const merged = {
        scheduledDate: input.scheduledDate || asDateOnly(current.scheduledDate),
        routeId: input.routeId || current.routeId,
        vehicleId: input.vehicleId || current.vehicleId,
        driverId: input.driverId || current.driverId,
        scheduledStartAt: input.scheduledStartAt === undefined ? current.scheduledStartAt : input.scheduledStartAt,
        scheduledEndAt: input.scheduledEndAt === undefined ? current.scheduledEndAt : input.scheduledEndAt,
      };
      await assertPlanAssignment(db, merged, req.params.id);
      const fields = {
        planNo: "plan_no", scheduledDate: "scheduled_date", routeId: "route_id", vehicleId: "vehicle_id",
        driverId: "driver_id", scheduledStartAt: "scheduled_start_at", scheduledEndAt: "scheduled_end_at", note: "note",
      };
      const values = [];
      const sets = Object.entries(input).map(([key, value]) => {
        values.push(["scheduledStartAt", "scheduledEndAt"].includes(key) ? asDateTime(value) : value);
        return `${fields[key]} = ?`;
      });
      values.push(req.params.id);
      await db.execute(`UPDATE waste_operation_plans SET ${sets.join(", ")} WHERE id = ?`, values);
    });
    await audit(req.user.sub, "UPDATE_WASTE_PLAN", "WASTE_PLAN", req.params.id, input, req.ip);
    return res.json({ data: { id: req.params.id, ...input } });
  } catch (error) { next(error); }
});

router.patch("/plans/:id/status", requireRole("ADMIN", "OFFICER"), async (req, res, next) => {
  try {
    const input = planStatusSchema.parse(req.body);
    await withTransaction(async (db) => {
      const [rows] = await db.execute(`SELECT status, publication_status AS publicationStatus, publication_version AS publicationVersion, vehicle_id AS vehicleId FROM waste_operation_plans WHERE id = ? FOR UPDATE`, [req.params.id]);
      if (!rows[0]) throw httpError(404, "ไม่พบแผนปฏิบัติงานเก็บขยะ");
      new WasteOperationPlan({ id: req.params.id, ...rows[0] }).transitionTo(input.status);
      if (input.status === "IN_PROGRESS") {
        const [vehicleRows] = await db.execute(`SELECT status FROM waste_vehicles WHERE id = ? FOR UPDATE`, [rows[0].vehicleId]);
        const [driverRows] = await db.execute(`SELECT d.is_active AS isActive FROM waste_drivers d INNER JOIN waste_operation_plans p ON p.driver_id = d.id WHERE p.id = ?`, [req.params.id]);
        const [activeRows] = await db.execute(`SELECT plan_no AS planNo FROM waste_operation_plans WHERE vehicle_id = ? AND id <> ? AND status = 'IN_PROGRESS' LIMIT 1`, [rows[0].vehicleId, req.params.id]);
        if (!vehicleRows[0] || vehicleRows[0].status !== "AVAILABLE") throw httpError(409, "รถเก็บขยะไม่อยู่ในสถานะพร้อมใช้งาน จึงยังเริ่มแผนนี้ไม่ได้");
        if (!driverRows[0] || !toBoolean(driverRows[0].isActive)) throw httpError(409, "คนขับรถเก็บขยะถูกปิดใช้งาน จึงยังเริ่มแผนนี้ไม่ได้");
        if (activeRows[0]) throw httpError(409, `รถเก็บขยะกำลังปฏิบัติงานในแผน ${activeRows[0].planNo}`);
      }
      const timeColumns = input.status === "IN_PROGRESS" ? ", actual_start_at = COALESCE(actual_start_at, NOW())" : input.status === "COMPLETED" ? ", actual_end_at = NOW()" : "";
      await db.execute(`UPDATE waste_operation_plans SET status = ?, note = COALESCE(?, note) ${timeColumns} WHERE id = ?`, [input.status, input.note, req.params.id]);
      if (input.status === "IN_PROGRESS") await db.execute(`UPDATE waste_vehicles SET status = 'IN_SERVICE' WHERE id = ?`, [rows[0].vehicleId]);
      if (["COMPLETED", "CANCELLED"].includes(input.status)) await db.execute(`UPDATE waste_vehicles SET status = 'AVAILABLE' WHERE id = ? AND status = 'IN_SERVICE'`, [rows[0].vehicleId]);
    });
    await audit(req.user.sub, "UPDATE_WASTE_PLAN_STATUS", "WASTE_PLAN", req.params.id, input, req.ip);
    return res.json({ data: { id: req.params.id, ...input } });
  } catch (error) { next(error); }
});

router.get("/plans/:id/track", requireRole("ADMIN", "OFFICER", "VIEWER"), async (req, res, next) => {
  try {
    const [[plan], [locations], [stops]] = await Promise.all([
      pool.execute(`SELECT p.id, p.plan_no AS planNo, p.status, r.route_name AS routeName, CAST(r.route_geojson AS CHAR) AS routeGeojson, v.vehicle_code AS vehicleCode, v.last_latitude AS latitude, v.last_longitude AS longitude, v.last_gps_at AS lastGpsAt FROM waste_operation_plans p INNER JOIN waste_routes r ON r.id = p.route_id INNER JOIN waste_vehicles v ON v.id = p.vehicle_id WHERE p.id = ?`, [req.params.id]),
      pool.execute(`SELECT latitude, longitude, accuracy_m AS accuracyM, speed_kph AS speedKph, recorded_at AS recordedAt, source FROM waste_location_logs WHERE plan_id = ? ORDER BY recorded_at DESC LIMIT 500`, [req.params.id]),
      pool.execute(`SELECT s.id, s.sequence_no AS sequenceNo, s.stop_name AS stopName, s.latitude, s.longitude, c.status AS confirmationStatus, c.confirmed_at AS confirmedAt FROM waste_route_stops s INNER JOIN waste_operation_plans p ON p.route_id = s.route_id LEFT JOIN waste_stop_confirmations c ON c.stop_id = s.id AND c.plan_id = p.id WHERE p.id = ? AND s.is_active = 1 ORDER BY s.sequence_no`, [req.params.id]),
    ]);
    if (!plan[0]) throw httpError(404, "ไม่พบแผนปฏิบัติงานเก็บขยะ");
    return res.json({ data: { ...plan[0], routeGeojson: plan[0].routeGeojson ? JSON.parse(plan[0].routeGeojson) : null, locations: locations.reverse(), stops } });
  } catch (error) { next(error); }
});

router.get("/service-users", requireRole("ADMIN", "OFFICER", "VIEWER"), async (req, res, next) => {
  try {
    const { routeId, search } = z.object({ routeId: z.string().uuid().optional(), search: z.string().trim().max(100).optional() }).parse(req.query);
    const terms = [];
    const values = [];
    if (routeId) { terms.push("u.route_id = ?"); values.push(routeId); }
    if (search) { terms.push("(u.service_no LIKE ? OR u.full_name LIKE ? OR u.house_no LIKE ?)"); values.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    const [rows] = await pool.execute(`SELECT u.id, u.service_no AS serviceNo, u.full_name AS fullName, u.phone, u.house_no AS houseNo, u.village_id AS villageId, v.village_no AS villageNo, v.name_th AS villageName, u.address_detail AS addressDetail, u.line_user_id AS lineUserId, u.route_id AS routeId, r.route_name AS routeName, u.route_assignment_status AS routeAssignmentStatus, u.route_assignment_distance_m AS routeAssignmentDistanceM, u.route_assigned_at AS routeAssignedAt, u.latitude, u.longitude, u.is_active AS isActive FROM waste_service_users u INNER JOIN villages v ON v.id = u.village_id LEFT JOIN waste_routes r ON r.id = u.route_id ${terms.length ? `WHERE ${terms.join(" AND ")}` : ""} ORDER BY u.is_active DESC, v.village_no, u.house_no`, values);
    return res.json({ data: rows.map((row) => ({ ...row, isActive: toBoolean(row.isActive) })) });
  } catch (error) { next(error); }
});

router.post("/service-users", requireRole("ADMIN", "OFFICER"), async (req, res, next) => {
  try {
    const input = serviceUserSchema.parse(req.body);
    const id = crypto.randomUUID();
    await withTransaction(async (db) => {
      await db.execute(`INSERT INTO waste_service_users (id, service_no, full_name, phone, house_no, village_id, address_detail, line_user_id, route_id, route_assignment_status, route_assigned_at, route_assigned_by, latitude, longitude, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'UNASSIGNED', NULL, NULL, ?, ?, ?)`, [id, input.serviceNo, input.fullName, input.phone, input.houseNo, input.villageId, input.addressDetail, input.lineUserId, input.latitude, input.longitude, input.isActive]);
      await syncServiceUserStop(db, id);
    });
    await audit(req.user.sub, "CREATE_WASTE_SERVICE_USER", "WASTE_SERVICE_USER", id, input, req.ip);
    return res.status(201).json({ data: { id, ...input } });
  } catch (error) { next(error); }
});

router.patch("/service-users/:id", requireRole("ADMIN", "OFFICER"), async (req, res, next) => {
  try {
    const input = serviceUserSchema.partial().parse(req.body);
    if (!Object.keys(input).length) throw httpError(422, "กรุณาระบุข้อมูลผู้ใช้บริการที่ต้องการปรับปรุง");
    const fields = { serviceNo: "service_no", fullName: "full_name", phone: "phone", houseNo: "house_no", villageId: "village_id", addressDetail: "address_detail", lineUserId: "line_user_id", latitude: "latitude", longitude: "longitude", isActive: "is_active" };
    if (Object.hasOwn(input, "routeId")) delete input.routeId;
    if (!Object.keys(input).length) throw httpError(422, "ใช้คำสั่งยืนยันเส้นทางเพื่อเปลี่ยนเส้นทางรับผิดชอบ");
    const values = [];
    const sets = Object.entries(input).map(([key, value]) => { values.push(value); return `${fields[key]} = ?`; });
    values.push(req.params.id);
    await withTransaction(async (db) => {
      const [beforeRows] = await db.execute(
        `SELECT route_id AS routeId, latitude, longitude, is_active AS isActive FROM waste_service_users WHERE id = ? FOR UPDATE`,
        [req.params.id],
      );
      if (!beforeRows[0]) throw httpError(404, "ไม่พบผู้ใช้บริการเก็บขยะ");
      const before = beforeRows[0];
      const [result] = await db.execute(`UPDATE waste_service_users SET ${sets.join(", ")} WHERE id = ?`, values);
      if (!result.affectedRows) throw httpError(404, "ไม่พบผู้ใช้บริการเก็บขยะ");
      await syncServiceUserStop(db, req.params.id);
      const [afterRows] = await db.execute(
        `SELECT route_id AS routeId, latitude, longitude, is_active AS isActive FROM waste_service_users WHERE id = ?`,
        [req.params.id],
      );
      const after = afterRows[0];
      const locationChanged = Number(before.latitude) !== Number(after.latitude) || Number(before.longitude) !== Number(after.longitude);
      const activeChanged = toBoolean(before.isActive) !== toBoolean(after.isActive);
      if ((locationChanged || activeChanged) && before.routeId) {
        await markRoutesForRecalculation(db, [before.routeId], locationChanged ? "SERVICE_LOCATION_CHANGED" : "SERVICE_STATUS_CHANGED");
      }
    });
    await audit(req.user.sub, "UPDATE_WASTE_SERVICE_USER", "WASTE_SERVICE_USER", req.params.id, input, req.ip);
    return res.json({ data: { id: req.params.id, ...input } });
  } catch (error) { next(error); }
});

router.get("/service-users/:id/route-suggestions", requireRole("ADMIN", "OFFICER", "VIEWER"), async (req, res, next) => {
  try {
    const [[user], [routes]] = await Promise.all([
      pool.execute(`SELECT id, latitude, longitude FROM waste_service_users WHERE id = ? AND is_active = 1`, [req.params.id]),
      pool.execute(`SELECT id, route_code AS routeCode, route_name AS routeName, CAST(route_geojson AS CHAR) AS routeGeojson FROM waste_routes WHERE is_active = 1 ORDER BY route_code`),
    ]);
    if (!user[0]) throw httpError(404, "ไม่พบผู้ใช้บริการเก็บขยะ");
    if (user[0].latitude == null || user[0].longitude == null) throw httpError(422, "กรุณาปักตำแหน่งจุดรับบริการก่อนค้นหาเส้นทางใกล้เคียง");
    const suggestions = routeAssignmentService.suggest(
      { latitude: Number(user[0].latitude), longitude: Number(user[0].longitude) },
      routes.filter((route) => route.routeGeojson).map((route) => ({ ...route, routeGeojson: JSON.parse(route.routeGeojson) })),
      routes.length,
    ).map(({ routeGeojson, ...suggestion }) => suggestion);
    const suggestedIds = new Set(suggestions.map((route) => route.id));
    for (const route of routes) {
      if (!suggestedIds.has(route.id)) suggestions.push({
        id: route.id,
        routeCode: route.routeCode,
        routeName: route.routeName,
        distanceMeters: null,
        eligible: true,
        recommended: false,
        requiresInitialSetup: true,
      });
    }
    return res.json({ data: suggestions });
  } catch (error) { next(error); }
});

router.post("/plans/:id/publish", requireRole("ADMIN", "OFFICER"), async (req, res, next) => {
  try {
    const input = planPublicationSchema.parse(req.body || {});
    const useCase = req.app.locals.wastePlanPublication?.publish;
    if (!useCase) throw httpError(503, "ระบบประกาศตารางยังไม่พร้อมใช้งาน");
    const result = await useCase.execute({ planId: req.params.id, officerId: req.user.sub, publicNote: input.publicNote });
    if (!result) throw httpError(404, "ไม่พบแผนปฏิบัติงานเก็บขยะ");
    await audit(req.user.sub, "PUBLISH_WASTE_PLAN", "WASTE_PLAN", req.params.id, result, req.ip);
    return res.json({ data: { id: req.params.id, ...result } });
  } catch (error) { next(error); }
});

router.post("/plans/:id/withdraw", requireRole("ADMIN", "OFFICER"), async (req, res, next) => {
  try {
    const input = planWithdrawalSchema.parse(req.body || {});
    const useCase = req.app.locals.wastePlanPublication?.withdraw;
    if (!useCase) throw httpError(503, "ระบบถอนประกาศตารางยังไม่พร้อมใช้งาน");
    const result = await useCase.execute({ planId: req.params.id, officerId: req.user.sub, reason: input.reason });
    if (!result) throw httpError(404, "ไม่พบแผนปฏิบัติงานเก็บขยะ");
    await audit(req.user.sub, "WITHDRAW_WASTE_PLAN", "WASTE_PLAN", req.params.id, { ...result, reason: input.reason }, req.ip);
    return res.json({ data: { id: req.params.id, ...result } });
  } catch (error) { next(error); }
});

router.get("/plans/:id/notifications", requireRole("ADMIN", "OFFICER", "VIEWER"), async (req, res, next) => {
  try {
    const repository = req.app.locals.wastePlanPublication?.repository;
    if (!repository) throw httpError(503, "ระบบตรวจสอบการแจ้งเตือนยังไม่พร้อมใช้งาน");
    return res.json({ data: await repository.publicationDeliverySummary(req.params.id) });
  } catch (error) { next(error); }
});

router.delete("/service-users/:id", requireRole("ADMIN", "OFFICER"), async (req, res, next) => {
  try {
    await withTransaction(async (db) => {
      const [rows] = await db.execute(
        `SELECT route_id AS routeId,
                (SELECT COUNT(*) FROM waste_service_charges WHERE service_user_id = u.id) AS chargeCount,
                (SELECT COUNT(*) FROM waste_stop_confirmations c INNER JOIN waste_route_stops s ON s.id = c.stop_id WHERE s.service_user_id = u.id) AS confirmationCount
         FROM waste_service_users u WHERE u.id = ? FOR UPDATE`,
        [req.params.id],
      );
      const current = rows[0];
      if (!current) throw httpError(404, "ไม่พบผู้ใช้บริการเก็บขยะ");
      if (Number(current.chargeCount || 0) || Number(current.confirmationCount || 0)) {
        throw httpError(409, "ผู้ใช้บริการรายนี้มีประวัติค่าบริการหรือการจัดเก็บแล้ว กรุณาเปลี่ยนสถานะเป็นปิดบริการแทนการลบ");
      }
      await db.execute(`DELETE FROM waste_route_stops WHERE service_user_id = ?`, [req.params.id]);
      await db.execute(`DELETE FROM waste_service_users WHERE id = ?`, [req.params.id]);
      await markRoutesForRecalculation(db, [current.routeId], "SERVICE_USER_DELETED");
    });
    await audit(req.user.sub, "DELETE_WASTE_SERVICE_USER", "WASTE_SERVICE_USER", req.params.id, null, req.ip);
    return res.status(204).end();
  } catch (error) { next(error); }
});

router.post("/service-users/:id/route-assignment-proposals", requireRole("ADMIN", "OFFICER"), async (req, res, next) => {
  try {
    const input = routeAssignmentProposalSchema.parse(req.body);
    const proposal = await req.app.locals.wasteRouteOptimization.proposeAssignment.execute({
      serviceUserId: req.params.id,
      routeId: input.routeId,
    });
    return res.status(201).json({
      data: {
        proposalId: proposal.id,
        routeId: proposal.routeId,
        stops: proposal.stops.map((stop, index) => ({ ...stop, sequenceNo: index + 1 })),
        routeGeojson: proposal.toGeoJson(),
        distanceMeters: proposal.distanceMeters,
        durationSeconds: proposal.durationSeconds,
        expiresAt: proposal.expiresAt,
      },
    });
  } catch (error) { next(routeOptimizationError(error)); }
});

router.post("/service-users/:id/route-assignment-confirmations", requireRole("ADMIN", "OFFICER"), async (req, res, next) => {
  try {
    const input = routeAssignmentConfirmationSchema.parse(req.body);
    const proposal = await req.app.locals.wasteRouteOptimization.confirmAssignment.execute({
      serviceUserId: req.params.id,
      proposalId: input.proposalId,
      confirmedBy: req.user.sub,
      ipAddress: req.ip,
    });
    return res.json({ data: { id: req.params.id, routeId: proposal.routeId, routeAssignmentStatus: "CONFIRMED", stopCount: proposal.stops.length, distanceMeters: proposal.distanceMeters, durationSeconds: proposal.durationSeconds } });
  } catch (error) { next(routeOptimizationError(error)); }
});

router.put("/service-users/:id/route-assignment", requireRole("ADMIN", "OFFICER"), async (_req, _res, next) => {
  try {
    throw httpError(410, "ขั้นตอนกำหนดเส้นทางแบบเดิมถูกยกเลิก กรุณาคำนวณและยืนยันเส้นทางจากหน้าผู้ใช้บริการ");
  } catch (error) { next(error); }
});

router.get("/fee-rates", requireRole("ADMIN", "OFFICER", "VIEWER"), async (_req, res, next) => {
  try {
    const [rows] = await pool.execute(`SELECT id, rate_name AS rateName, amount, billing_cycle AS billingCycle, is_active AS isActive FROM waste_fee_rates ORDER BY is_active DESC, rate_name`);
    return res.json({ data: rows.map((row) => ({ ...row, amount: Number(row.amount), isActive: toBoolean(row.isActive) })) });
  } catch (error) { next(error); }
});

router.post("/fee-rates", requireRole("ADMIN", "OFFICER"), async (req, res, next) => {
  try {
    const input = feeRateSchema.parse(req.body);
    const id = crypto.randomUUID();
    await pool.execute(`INSERT INTO waste_fee_rates (id, rate_name, amount, billing_cycle, is_active) VALUES (?, ?, ?, ?, ?)`, [id, input.rateName, input.amount, input.billingCycle, input.isActive]);
    await audit(req.user.sub, "CREATE_WASTE_FEE_RATE", "WASTE_FEE_RATE", id, input, req.ip);
    return res.status(201).json({ data: { id, ...input } });
  } catch (error) { next(error); }
});

router.patch("/fee-rates/:id", requireRole("ADMIN", "OFFICER"), async (req, res, next) => {
  try {
    const input = feeRateSchema.partial().parse(req.body);
    if (!Object.keys(input).length) throw httpError(422, "กรุณาระบุอัตราค่าบริการที่ต้องการปรับปรุง");
    const fields = { rateName: "rate_name", amount: "amount", billingCycle: "billing_cycle", isActive: "is_active" };
    const values = [];
    const sets = Object.entries(input).map(([key, value]) => { values.push(value); return `${fields[key]} = ?`; });
    values.push(req.params.id);
    const [result] = await pool.execute(`UPDATE waste_fee_rates SET ${sets.join(", ")} WHERE id = ?`, values);
    if (!result.affectedRows) throw httpError(404, "ไม่พบอัตราค่าบริการเก็บขยะ");
    await audit(req.user.sub, "UPDATE_WASTE_FEE_RATE", "WASTE_FEE_RATE", req.params.id, input, req.ip);
    return res.json({ data: { id: req.params.id, ...input } });
  } catch (error) { next(error); }
});

router.get("/charges", requireRole("ADMIN", "OFFICER", "VIEWER"), async (req, res, next) => {
  try {
    const { status, billingPeriod } = z.object({ status: z.enum(["PENDING", "PAID", "OVERDUE", "VOID"]).optional(), billingPeriod: dateSchema.optional() }).parse(req.query);
    const terms = [];
    const values = [];
    if (status) { terms.push("c.status = ?"); values.push(status); }
    if (billingPeriod) { terms.push("c.billing_period = ?"); values.push(billingPeriod); }
    const [rows] = await pool.execute(`SELECT c.id, c.service_user_id AS serviceUserId, u.service_no AS serviceNo, u.full_name AS fullName, u.house_no AS houseNo, c.fee_rate_id AS feeRateId, f.rate_name AS rateName, DATE_FORMAT(c.billing_period, '%Y-%m-%d') AS billingPeriod, DATE_FORMAT(c.due_date, '%Y-%m-%d') AS dueDate, c.amount, c.status, c.paid_at AS paidAt, c.notice_requested_at AS noticeRequestedAt FROM waste_service_charges c INNER JOIN waste_service_users u ON u.id = c.service_user_id LEFT JOIN waste_fee_rates f ON f.id = c.fee_rate_id ${terms.length ? `WHERE ${terms.join(" AND ")}` : ""} ORDER BY c.due_date DESC, u.full_name`, values);
    return res.json({ data: rows.map((row) => ({ ...row, amount: Number(row.amount) })) });
  } catch (error) { next(error); }
});

router.post("/charges", requireRole("ADMIN", "OFFICER"), async (req, res, next) => {
  try {
    const input = chargeSchema.parse(req.body);
    if (input.dueDate < input.billingPeriod) throw httpError(422, "กำหนดชำระต้องไม่ก่อนรอบค่าบริการ");
    const id = crypto.randomUUID();
    await pool.execute(`INSERT INTO waste_service_charges (id, service_user_id, fee_rate_id, billing_period, due_date, amount) VALUES (?, ?, ?, ?, ?, ?)`, [id, input.serviceUserId, input.feeRateId, input.billingPeriod, input.dueDate, input.amount]);
    await audit(req.user.sub, "CREATE_WASTE_CHARGE", "WASTE_SERVICE_CHARGE", id, input, req.ip);
    return res.status(201).json({ data: { id, ...input, status: "PENDING" } });
  } catch (error) { next(error); }
});

router.patch("/charges/:id", requireRole("ADMIN", "OFFICER"), async (req, res, next) => {
  try {
    const input = chargeUpdateSchema.parse(req.body);
    const paidAt = input.status === "PAID" ? new Date() : null;
    const [result] = await pool.execute(`UPDATE waste_service_charges SET status = ?, paid_at = ? WHERE id = ?`, [input.status, paidAt, req.params.id]);
    if (!result.affectedRows) throw httpError(404, "ไม่พบรายการค่าบริการ");
    await audit(req.user.sub, "UPDATE_WASTE_CHARGE", "WASTE_SERVICE_CHARGE", req.params.id, input, req.ip);
    return res.json({ data: { id: req.params.id, ...input, paidAt } });
  } catch (error) { next(error); }
});

router.post("/charges/:id/notice", requireRole("ADMIN", "OFFICER"), async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT c.id, c.amount, c.due_date AS dueDate, c.status,
              u.id AS serviceUserId, u.full_name AS fullName, u.line_user_id AS lineUserId
       FROM waste_service_charges c
       INNER JOIN waste_service_users u ON u.id = c.service_user_id
       WHERE c.id = ?`,
      [req.params.id],
    );
    const charge = rows[0];
    if (!charge) throw httpError(404, "ไม่พบรายการค่าบริการ");
    if (!["PENDING", "OVERDUE"].includes(charge.status)) throw httpError(409, "ส่งแจ้งเตือนได้เฉพาะรายการที่รอชำระหรือค้างชำระ");
    if (!charge.lineUserId) throw httpError(422, "ผู้ใช้บริการรายนี้ยังไม่ได้เชื่อมบัญชี LINE");

    const notificationId = crypto.randomUUID();
    const dueDate = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" }).format(new Date(charge.dueDate));
    const amount = Number(charge.amount).toLocaleString("th-TH", { style: "currency", currency: "THB" });
    const message = `แจ้งค่าบริการเก็บขยะ\nคุณ${charge.fullName}\nยอดชำระ ${amount}\nกำหนดชำระ ${dueDate}\nตรวจสอบรายละเอียดได้โดยพิมพ์ “ค่าบริการขยะ”`;
    await withTransaction(async (db) => {
      await db.execute(
        `INSERT INTO waste_line_notifications
          (id, line_user_id, service_user_id, charge_id, notification_type, message_text)
         VALUES (?, ?, ?, ?, 'CHARGE_NOTICE', ?)`,
        [notificationId, charge.lineUserId, charge.serviceUserId, charge.id, message],
      );
      await db.execute(`UPDATE waste_service_charges SET notice_requested_at = NOW() WHERE id = ?`, [charge.id]);
    });
    await audit(req.user.sub, "QUEUE_WASTE_CHARGE_NOTICE", "WASTE_SERVICE_CHARGE", charge.id, { notificationId }, req.ip);
    return res.status(202).json({ data: { notificationId, status: "PENDING" } });
  } catch (error) { next(error); }
});

router.get("/incidents", requireRole("ADMIN", "OFFICER", "VIEWER"), async (req, res, next) => {
  try {
    const { status } = z.object({ status: z.enum(["REPORTED", "ACKNOWLEDGED", "RESOLVED"]).optional() }).parse(req.query);
    const [rows] = await pool.execute(`SELECT i.id, i.plan_id AS planId, p.plan_no AS planNo, i.vehicle_id AS vehicleId, v.vehicle_code AS vehicleCode, i.replacement_vehicle_id AS replacementVehicleId, rv.vehicle_code AS replacementVehicleCode, i.driver_id AS driverId, d.full_name AS driverName, i.incident_type AS incidentType, i.status, i.description, i.happened_at AS happenedAt, i.resolved_at AS resolvedAt, i.resolution_note AS resolutionNote FROM waste_incidents i LEFT JOIN waste_operation_plans p ON p.id = i.plan_id LEFT JOIN waste_vehicles v ON v.id = i.vehicle_id LEFT JOIN waste_vehicles rv ON rv.id = i.replacement_vehicle_id LEFT JOIN waste_drivers d ON d.id = i.driver_id ${status ? "WHERE i.status = ?" : ""} ORDER BY i.happened_at DESC`, status ? [status] : []);
    return res.json({ data: rows });
  } catch (error) { next(error); }
});

router.post("/incidents", requireRole("ADMIN", "OFFICER"), async (req, res, next) => {
  try {
    const input = incidentSchema.parse(req.body);
    const id = crypto.randomUUID();
    await pool.execute(`INSERT INTO waste_incidents (id, plan_id, vehicle_id, driver_id, incident_type, description, happened_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, [id, input.planId, input.vehicleId, input.driverId, input.incidentType, input.description, asDateTime(input.happenedAt)]);
    await audit(req.user.sub, "CREATE_WASTE_INCIDENT", "WASTE_INCIDENT", id, input, req.ip);
    return res.status(201).json({ data: { id, ...input, status: "REPORTED" } });
  } catch (error) { next(error); }
});

router.patch("/incidents/:id", requireRole("ADMIN", "OFFICER"), async (req, res, next) => {
  try {
    const input = incidentUpdateSchema.parse(req.body);
    const [result] = await pool.execute(`UPDATE waste_incidents SET status = ?, replacement_vehicle_id = ?, resolution_note = ?, resolved_at = CASE WHEN ? = 'RESOLVED' THEN NOW() ELSE resolved_at END WHERE id = ?`, [input.status, input.replacementVehicleId, input.resolutionNote, input.status, req.params.id]);
    if (!result.affectedRows) throw httpError(404, "ไม่พบเหตุระหว่างปฏิบัติงาน");
    await audit(req.user.sub, "UPDATE_WASTE_INCIDENT", "WASTE_INCIDENT", req.params.id, input, req.ip);
    return res.json({ data: { id: req.params.id, ...input } });
  } catch (error) { next(error); }
});

router.get("/reports/operations", requireRole("ADMIN", "OFFICER", "VIEWER"), async (req, res, next) => {
  try {
    const { from, to } = z.object({ from: dateSchema.optional(), to: dateSchema.optional() }).parse(req.query);
    const conditions = [];
    const values = [];
    if (from) { conditions.push("p.scheduled_date >= ?"); values.push(from); }
    if (to) { conditions.push("p.scheduled_date <= ?"); values.push(to); }
    const [rows] = await pool.execute(`SELECT p.plan_no AS planNo, DATE_FORMAT(p.scheduled_date, '%Y-%m-%d') AS scheduledDate, r.route_name AS routeName, v.vehicle_code AS vehicleCode, d.full_name AS driverName, p.status, (SELECT COUNT(*) FROM waste_route_stops s WHERE s.route_id = p.route_id AND s.is_active = 1) AS stopTotal, (SELECT COUNT(*) FROM waste_stop_confirmations c WHERE c.plan_id = p.id AND c.status = 'COLLECTED') AS collectedStops FROM waste_operation_plans p INNER JOIN waste_routes r ON r.id = p.route_id INNER JOIN waste_vehicles v ON v.id = p.vehicle_id INNER JOIN waste_drivers d ON d.id = p.driver_id ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""} ORDER BY p.scheduled_date DESC, p.plan_no`, values);
    return res.json({ data: rows.map((row) => ({ ...row, stopTotal: Number(row.stopTotal || 0), collectedStops: Number(row.collectedStops || 0) })) });
  } catch (error) { next(error); }
});

router.get("/reports/billing", requireRole("ADMIN", "OFFICER", "VIEWER"), async (req, res, next) => {
  try {
    const { billingPeriod } = z.object({ billingPeriod: dateSchema.optional() }).parse(req.query);
    const [rows] = await pool.execute(`SELECT DATE_FORMAT(c.billing_period, '%Y-%m-%d') AS billingPeriod, c.status, COUNT(*) AS count, COALESCE(SUM(c.amount), 0) AS amount FROM waste_service_charges c ${billingPeriod ? "WHERE c.billing_period = ?" : ""} GROUP BY c.billing_period, c.status ORDER BY c.billing_period DESC, c.status`, billingPeriod ? [billingPeriod] : []);
    return res.json({ data: rows.map((row) => ({ ...row, count: Number(row.count), amount: Number(row.amount) })) });
  } catch (error) { next(error); }
});

export class WasteHttpModule {
  constructor(expressRouter) {
    this.router = expressRouter;
  }

  getRouter() {
    return this.router;
  }
}

export const wasteHttpModule = new WasteHttpModule(router);
export const wasteRouter = wasteHttpModule.getRouter();
