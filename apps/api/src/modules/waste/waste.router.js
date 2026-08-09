import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { pool, withTransaction } from "../../core/db.js";
import { authenticate, requireRole } from "../../core/middleware.js";

const router = Router();

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

const planSchema = z.object({
  planNo: z.string().trim().min(4).max(30),
  scheduledDate: dateSchema,
  routeId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  driverId: z.string().uuid(),
  scheduledStartAt: z.string().datetime().optional().nullable(),
  scheduledEndAt: z.string().datetime().optional().nullable(),
  note: nullableText(500),
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

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  error.expose = true;
  return error;
}

function toBoolean(value) {
  return Boolean(Number(value));
}

function asDateTime(value) {
  return value ? new Date(value) : null;
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

router.use(authenticate);

router.get("/dashboard", requireRole("ADMIN", "OFFICER", "VIEWER"), async (req, res, next) => {
  try {
    const { date } = z.object({ date: dateSchema.optional() }).parse(req.query);
    const selectedDate = date || new Date().toISOString().slice(0, 10);
    const [[summary], [activePlans], [incidents], [overdueCharges]] = await Promise.all([
      pool.execute(
        `SELECT
          (SELECT COUNT(*) FROM waste_vehicles WHERE status = 'AVAILABLE') AS availableVehicles,
          (SELECT COUNT(*) FROM waste_vehicles WHERE status = 'MAINTENANCE') AS maintenanceVehicles,
          (SELECT COUNT(*) FROM waste_operation_plans WHERE scheduled_date = ? AND status = 'IN_PROGRESS') AS operatingPlans,
          (SELECT COUNT(*) FROM waste_operation_plans WHERE scheduled_date = ? AND status = 'COMPLETED') AS completedPlans`,
        [selectedDate, selectedDate],
      ),
      pool.execute(
        `SELECT p.id, p.plan_no AS planNo, p.status, p.scheduled_date AS scheduledDate,
                r.route_name AS routeName, v.vehicle_code AS vehicleCode, v.registration_no AS registrationNo,
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
    ]);

    return res.json({
      data: {
        date: selectedDate,
        summary: {
          availableVehicles: Number(summary[0].availableVehicles || 0),
          maintenanceVehicles: Number(summary[0].maintenanceVehicles || 0),
          operatingPlans: Number(summary[0].operatingPlans || 0),
          completedPlans: Number(summary[0].completedPlans || 0),
          overdueCharges: Number(overdueCharges[0].total || 0),
          overdueAmount: Number(overdueCharges[0].amount || 0),
        },
        activePlans: activePlans.map((row) => ({ ...row, stopTotal: Number(row.stopTotal || 0), collectedStops: Number(row.collectedStops || 0) })),
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

router.get("/plans", requireRole("ADMIN", "OFFICER", "VIEWER"), async (req, res, next) => {
  try {
    const { date } = z.object({ date: dateSchema.optional() }).parse(req.query);
    const values = date ? [date] : [];
    const [rows] = await pool.execute(
      `SELECT p.id, p.plan_no AS planNo, p.scheduled_date AS scheduledDate, p.status,
              p.scheduled_start_at AS scheduledStartAt, p.scheduled_end_at AS scheduledEndAt,
              p.actual_start_at AS actualStartAt, p.actual_end_at AS actualEndAt, p.note,
              r.id AS routeId, r.route_name AS routeName, v.id AS vehicleId, v.vehicle_code AS vehicleCode,
              d.id AS driverId, d.full_name AS driverName,
              (SELECT COUNT(*) FROM waste_route_stops s WHERE s.route_id = p.route_id AND s.is_active = 1) AS stopTotal,
              (SELECT COUNT(*) FROM waste_stop_confirmations c WHERE c.plan_id = p.id AND c.status = 'COLLECTED') AS collectedStops
       FROM waste_operation_plans p
       INNER JOIN waste_routes r ON r.id = p.route_id
       INNER JOIN waste_vehicles v ON v.id = p.vehicle_id
       INNER JOIN waste_drivers d ON d.id = p.driver_id
       ${date ? "WHERE p.scheduled_date = ?" : ""}
       ORDER BY p.scheduled_date DESC, p.scheduled_start_at, p.created_at DESC`,
      values,
    );
    return res.json({ data: rows.map((row) => ({ ...row, stopTotal: Number(row.stopTotal || 0), collectedStops: Number(row.collectedStops || 0) })) });
  } catch (error) { next(error); }
});

router.post("/plans", requireRole("ADMIN", "OFFICER"), async (req, res, next) => {
  try {
    const input = planSchema.parse(req.body);
    const id = crypto.randomUUID();
    await withTransaction(async (db) => {
      const [vehicleRows] = await db.execute(`SELECT status FROM waste_vehicles WHERE id = ? FOR UPDATE`, [input.vehicleId]);
      if (!vehicleRows[0]) throw httpError(422, "ไม่พบรถเก็บขยะที่เลือก");
      if (vehicleRows[0].status === "OUT_OF_SERVICE") throw httpError(422, "รถเก็บขยะที่เลือกไม่พร้อมใช้งาน");
      await db.execute(`INSERT INTO waste_operation_plans (id, plan_no, scheduled_date, route_id, vehicle_id, driver_id, scheduled_start_at, scheduled_end_at, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, input.planNo, input.scheduledDate, input.routeId, input.vehicleId, input.driverId, asDateTime(input.scheduledStartAt), asDateTime(input.scheduledEndAt), input.note, req.user.sub]);
    });
    await audit(req.user.sub, "CREATE_WASTE_PLAN", "WASTE_PLAN", id, input, req.ip);
    return res.status(201).json({ data: { id, ...input, status: "SCHEDULED" } });
  } catch (error) { next(error); }
});

router.patch("/plans/:id/status", requireRole("ADMIN", "OFFICER"), async (req, res, next) => {
  try {
    const input = planStatusSchema.parse(req.body);
    const timeColumns = input.status === "IN_PROGRESS" ? ", actual_start_at = COALESCE(actual_start_at, NOW())" : input.status === "COMPLETED" ? ", actual_end_at = NOW()" : "";
    const [result] = await pool.execute(`UPDATE waste_operation_plans SET status = ?, note = COALESCE(?, note) ${timeColumns} WHERE id = ?`, [input.status, input.note, req.params.id]);
    if (!result.affectedRows) throw httpError(404, "ไม่พบแผนปฏิบัติงานเก็บขยะ");
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
    const [rows] = await pool.execute(`SELECT u.id, u.service_no AS serviceNo, u.full_name AS fullName, u.phone, u.house_no AS houseNo, u.village_id AS villageId, v.village_no AS villageNo, v.name_th AS villageName, u.address_detail AS addressDetail, u.line_user_id AS lineUserId, u.route_id AS routeId, r.route_name AS routeName, u.latitude, u.longitude, u.is_active AS isActive FROM waste_service_users u INNER JOIN villages v ON v.id = u.village_id LEFT JOIN waste_routes r ON r.id = u.route_id ${terms.length ? `WHERE ${terms.join(" AND ")}` : ""} ORDER BY u.is_active DESC, v.village_no, u.house_no`, values);
    return res.json({ data: rows.map((row) => ({ ...row, isActive: toBoolean(row.isActive) })) });
  } catch (error) { next(error); }
});

router.post("/service-users", requireRole("ADMIN", "OFFICER"), async (req, res, next) => {
  try {
    const input = serviceUserSchema.parse(req.body);
    const id = crypto.randomUUID();
    await pool.execute(`INSERT INTO waste_service_users (id, service_no, full_name, phone, house_no, village_id, address_detail, line_user_id, route_id, latitude, longitude, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, input.serviceNo, input.fullName, input.phone, input.houseNo, input.villageId, input.addressDetail, input.lineUserId, input.routeId, input.latitude, input.longitude, input.isActive]);
    await audit(req.user.sub, "CREATE_WASTE_SERVICE_USER", "WASTE_SERVICE_USER", id, input, req.ip);
    return res.status(201).json({ data: { id, ...input } });
  } catch (error) { next(error); }
});

router.patch("/service-users/:id", requireRole("ADMIN", "OFFICER"), async (req, res, next) => {
  try {
    const input = serviceUserSchema.partial().parse(req.body);
    if (!Object.keys(input).length) throw httpError(422, "กรุณาระบุข้อมูลผู้ใช้บริการที่ต้องการปรับปรุง");
    const fields = { serviceNo: "service_no", fullName: "full_name", phone: "phone", houseNo: "house_no", villageId: "village_id", addressDetail: "address_detail", lineUserId: "line_user_id", routeId: "route_id", latitude: "latitude", longitude: "longitude", isActive: "is_active" };
    const values = [];
    const sets = Object.entries(input).map(([key, value]) => { values.push(value); return `${fields[key]} = ?`; });
    values.push(req.params.id);
    const [result] = await pool.execute(`UPDATE waste_service_users SET ${sets.join(", ")} WHERE id = ?`, values);
    if (!result.affectedRows) throw httpError(404, "ไม่พบผู้ใช้บริการเก็บขยะ");
    await audit(req.user.sub, "UPDATE_WASTE_SERVICE_USER", "WASTE_SERVICE_USER", req.params.id, input, req.ip);
    return res.json({ data: { id: req.params.id, ...input } });
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
    const [rows] = await pool.execute(`SELECT c.id, c.service_user_id AS serviceUserId, u.service_no AS serviceNo, u.full_name AS fullName, u.house_no AS houseNo, c.fee_rate_id AS feeRateId, f.rate_name AS rateName, c.billing_period AS billingPeriod, c.due_date AS dueDate, c.amount, c.status, c.paid_at AS paidAt, c.notice_requested_at AS noticeRequestedAt FROM waste_service_charges c INNER JOIN waste_service_users u ON u.id = c.service_user_id LEFT JOIN waste_fee_rates f ON f.id = c.fee_rate_id ${terms.length ? `WHERE ${terms.join(" AND ")}` : ""} ORDER BY c.due_date DESC, u.full_name`, values);
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
    const [rows] = await pool.execute(`SELECT p.plan_no AS planNo, p.scheduled_date AS scheduledDate, r.route_name AS routeName, v.vehicle_code AS vehicleCode, d.full_name AS driverName, p.status, (SELECT COUNT(*) FROM waste_route_stops s WHERE s.route_id = p.route_id AND s.is_active = 1) AS stopTotal, (SELECT COUNT(*) FROM waste_stop_confirmations c WHERE c.plan_id = p.id AND c.status = 'COLLECTED') AS collectedStops FROM waste_operation_plans p INNER JOIN waste_routes r ON r.id = p.route_id INNER JOIN waste_vehicles v ON v.id = p.vehicle_id INNER JOIN waste_drivers d ON d.id = p.driver_id ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""} ORDER BY p.scheduled_date DESC, p.plan_no`, values);
    return res.json({ data: rows.map((row) => ({ ...row, stopTotal: Number(row.stopTotal || 0), collectedStops: Number(row.collectedStops || 0) })) });
  } catch (error) { next(error); }
});

router.get("/reports/billing", requireRole("ADMIN", "OFFICER", "VIEWER"), async (req, res, next) => {
  try {
    const { billingPeriod } = z.object({ billingPeriod: dateSchema.optional() }).parse(req.query);
    const [rows] = await pool.execute(`SELECT c.billing_period AS billingPeriod, c.status, COUNT(*) AS count, COALESCE(SUM(c.amount), 0) AS amount FROM waste_service_charges c ${billingPeriod ? "WHERE c.billing_period = ?" : ""} GROUP BY c.billing_period, c.status ORDER BY c.billing_period DESC, c.status`, billingPeriod ? [billingPeriod] : []);
    return res.json({ data: rows.map((row) => ({ ...row, count: Number(row.count), amount: Number(row.amount) })) });
  } catch (error) { next(error); }
});

export { router as wasteRouter };
