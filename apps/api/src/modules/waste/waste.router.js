import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { config } from "../../core/config.js";
import { pool, withTransaction } from "../../core/db.js";
import { authenticate, requireRole } from "../../core/middleware.js";
import { HttpError } from "../../presentation/http/HttpError.js";
import { RouteAssignmentService } from "./domain/RouteAssignmentService.js";
import { WasteRouteLifecycleService } from "./domain/WasteRouteLifecycleService.js";
import { WastePlanNumberService } from "./application/WastePlanNumberService.js";
import { WasteTrackingTokenService } from "./application/WasteTrackingTokenService.js";
import { WastePlanResourceService } from "./application/WastePlanResourceService.js";
import { WastePlanResourcePolicy } from "./domain/WastePlanResourcePolicy.js";
import { MariaDbWastePlanResourceRepository } from "./infrastructure/MariaDbWastePlanResourceRepository.js";
import { WasteVehicleService } from "./application/WasteVehicleService.js";
import { WasteDriverService } from "./application/WasteDriverService.js";
import { MariaDbWasteVehicleRepository } from "./infrastructure/MariaDbWasteVehicleRepository.js";
import { MariaDbWasteDriverRepository } from "./infrastructure/MariaDbWasteDriverRepository.js";
import { MariaDbAuditLogRepository } from "../../infrastructure/audit/MariaDbAuditLogRepository.js";
import { WasteRouteService } from "./application/WasteRouteService.js";
import { MariaDbWasteRouteAdminRepository } from "./infrastructure/MariaDbWasteRouteAdminRepository.js";
import { WasteServiceUserService } from "./application/WasteServiceUserService.js";
import { MariaDbWasteServiceUserRepository } from "./infrastructure/MariaDbWasteServiceUserRepository.js";
import { WasteTrackingPolicy } from "./domain/WasteTrackingPolicy.js";
import { WasteTrackingService } from "./application/WasteTrackingService.js";
import { MariaDbWasteTrackingRepository } from "./infrastructure/MariaDbWasteTrackingRepository.js";
import { WasteIncidentService } from "./application/WasteIncidentService.js";
import { MariaDbWasteIncidentRepository } from "./infrastructure/MariaDbWasteIncidentRepository.js";
import { WastePlanExecutionPolicy } from "./domain/WastePlanExecutionPolicy.js";
import { WastePlanService } from "./application/WastePlanService.js";
import { WastePlanStatusService } from "./application/WastePlanStatusService.js";
import { MariaDbWastePlanAdminRepository } from "./infrastructure/MariaDbWastePlanAdminRepository.js";
import { WasteDashboardQueryService } from "./application/WasteDashboardQueryService.js";
import { MariaDbWasteDashboardRepository } from "./infrastructure/MariaDbWasteDashboardRepository.js";

const router = Router();
const planNumberService = new WastePlanNumberService();
const trackingTokenService = new WasteTrackingTokenService({ secret: config.jwtSecret });
const routeAssignmentService = new RouteAssignmentService();
const routeLifecycleService = new WasteRouteLifecycleService();

const wastePlanResourcePolicy = new WastePlanResourcePolicy();

function createWastePlanResourceService(database) {
  return new WastePlanResourceService({
    repository: new MariaDbWastePlanResourceRepository({
      database,
    }),
    policy: wastePlanResourcePolicy,
    routeLifecycleService,
  });
}

const wastePlanResourceService =
  createWastePlanResourceService(pool);

const auditLogRepository =
  new MariaDbAuditLogRepository({
    database: pool,
  });

const wasteVehicleService =
  new WasteVehicleService({
    repository:
      new MariaDbWasteVehicleRepository({
        database: pool,
      }),
    auditLog: auditLogRepository,
  });

const wasteDriverService =
  new WasteDriverService({
    repository:
      new MariaDbWasteDriverRepository({
        database: pool,
      }),
    auditLog: auditLogRepository,
  });
const wasteRouteService =
  new WasteRouteService({
    repository:
      new MariaDbWasteRouteAdminRepository({
        database: pool,
      }),
    auditLog: auditLogRepository,
  });

const wasteServiceUserService =
  new WasteServiceUserService({
    repository:
      new MariaDbWasteServiceUserRepository({
        database: pool,
      }),
    auditLog: auditLogRepository,
    routeLifecycleService,
    routeAssignmentService,
  });


const wasteTrackingService =
  new WasteTrackingService({
    repository:
      new MariaDbWasteTrackingRepository({
        database: pool,
      }),
    policy:
      new WasteTrackingPolicy(),
  });

const wasteIncidentService =
  new WasteIncidentService({
    repository:
      new MariaDbWasteIncidentRepository({
        database: pool,
      }),
    auditLog:
      auditLogRepository,
  });

const wastePlanAdminRepository =
  new MariaDbWastePlanAdminRepository({
    database: pool,
  });

const wastePlanExecutionPolicy =
  new WastePlanExecutionPolicy();

const wastePlanService =
  new WastePlanService({
    repository:
      wastePlanAdminRepository,
    auditLog:
      auditLogRepository,
    planNumberService,
    resourceServiceFactory:
      createWastePlanResourceService,
  });

const wastePlanStatusService =
  new WastePlanStatusService({
    repository:
      wastePlanAdminRepository,
    policy:
      wastePlanExecutionPolicy,
    auditLog:
      auditLogRepository,
  });

const wasteDashboardQueryService =
  new WasteDashboardQueryService({
    repository:
      new MariaDbWasteDashboardRepository({
        database: pool,
      }),
  });

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

const resourceAvailabilityQuerySchema = z.object({
  scheduledDate: dateSchema,
  scheduledStartAt: z.string().datetime().optional().nullable(),
  scheduledEndAt: z.string().datetime().optional().nullable(),
  excludePlanId: z.string().uuid().optional().nullable(),
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

function readTrackingToken(req) {
  const authorization = String(req.headers.authorization || "");
  if (!authorization.startsWith("Bearer ")) throw httpError(401, "ไม่พบสิทธิ์ติดตามตำแหน่งรถเก็บขยะ");
  try {
    return trackingTokenService.verify(authorization.slice(7));
  } catch {
    throw httpError(401, "ลิงก์ติดตามตำแหน่งหมดอายุหรือไม่ถูกต้อง กรุณาเปิดจากเมนู LINE อีกครั้ง");
  }
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

async function audit(
  userId,
  action,
  entityType,
  entityId,
  nextValue,
  ipAddress,
) {
  return auditLogRepository.record({
    userId,
    action,
    entityType,
    entityId,
    nextValue,
    ipAddress,
  });
}

router.get(
  "/driver-tracking/session",
  async (req, res, next) => {
    try {
      const claims =
        readTrackingToken(req);

      const data =
        await wasteTrackingService
          .getDriverSession(
            claims,
          );

      return res.json({ data });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/driver-tracking/location",
  async (req, res, next) => {
    try {
      const claims =
        readTrackingToken(req);

      const input =
        trackingLocationSchema
          .parse(req.body);

      const data =
        await wasteTrackingService
          .recordLocation(
            claims,
            input,
          );

      return res
        .status(
          data.accepted
            ? 201
            : 202,
        )
        .json({ data });
    } catch (error) {
      next(error);
    }
  },
);
router.use(authenticate);

router.get(
  "/dashboard",
  requireRole(
    "ADMIN",
    "OFFICER",
    "VIEWER",
  ),
  async (req, res, next) => {
    try {
      const query =
        z.object({
          date:
            dateSchema.optional(),
        }).parse(req.query);

      const data =
        await wasteDashboardQueryService
          .get(query);

      return res.json({ data });
    } catch (error) {
      next(error);
    }
  },
);
router.get(
  "/vehicles",
  requireRole("ADMIN", "OFFICER", "VIEWER"),
  async (req, res, next) => {
    try {
      const query = z.object({
        status: z
          .enum([
            "AVAILABLE",
            "IN_SERVICE",
            "MAINTENANCE",
            "OUT_OF_SERVICE",
          ])
          .optional(),
        search: z
          .string()
          .trim()
          .max(100)
          .optional(),
      }).parse(req.query);

      return res.json({
        data:
          await wasteVehicleService.list(query),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/vehicles",
  requireRole("ADMIN", "OFFICER"),
  async (req, res, next) => {
    try {
      const input =
        vehicleSchema.parse(req.body);

      const data =
        await wasteVehicleService.create(
          input,
          {
            userId: req.user.sub,
            ipAddress: req.ip,
          },
        );

      return res
        .status(201)
        .json({ data });
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  "/vehicles/:id",
  requireRole("ADMIN", "OFFICER"),
  async (req, res, next) => {
    try {
      const input =
        vehicleSchema.partial().parse(req.body);

      if (!Object.keys(input).length) {
        throw httpError(
          422,
          "กรุณาระบุข้อมูลรถเก็บขยะที่ต้องการปรับปรุง",
        );
      }

      const data =
        await wasteVehicleService.update(
          req.params.id,
          input,
          {
            userId: req.user.sub,
            ipAddress: req.ip,
          },
        );

      return res.json({ data });
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  "/vehicles/:id",
  requireRole("ADMIN", "OFFICER"),
  async (req, res, next) => {
    try {
      await wasteVehicleService.remove(
        req.params.id,
        {
          userId: req.user.sub,
          ipAddress: req.ip,
        },
      );

      return res.status(204).end();
    } catch (error) {
      next(error);
    }
  },
);
router.get(
  "/drivers",
  requireRole("ADMIN", "OFFICER", "VIEWER"),
  async (_req, res, next) => {
    try {
      return res.json({
        data:
          await wasteDriverService.list(),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/drivers",
  requireRole("ADMIN", "OFFICER"),
  async (req, res, next) => {
    try {
      const input =
        driverSchema.parse(req.body);

      const data =
        await wasteDriverService.create(
          input,
          {
            userId: req.user.sub,
            ipAddress: req.ip,
          },
        );

      return res
        .status(201)
        .json({ data });
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  "/drivers/:id",
  requireRole("ADMIN", "OFFICER"),
  async (req, res, next) => {
    try {
      const input =
        driverSchema.partial().parse(req.body);

      if (!Object.keys(input).length) {
        throw httpError(
          422,
          "กรุณาระบุข้อมูลคนขับรถเก็บขยะที่ต้องการปรับปรุง",
        );
      }

      const data =
        await wasteDriverService.update(
          req.params.id,
          input,
          {
            userId: req.user.sub,
            ipAddress: req.ip,
          },
        );

      return res.json({ data });
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  "/drivers/:id",
  requireRole("ADMIN", "OFFICER"),
  async (req, res, next) => {
    try {
      await wasteDriverService.remove(
        req.params.id,
        {
          userId: req.user.sub,
          ipAddress: req.ip,
        },
      );

      return res.status(204).end();
    } catch (error) {
      next(error);
    }
  },
);
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

router.get(
  "/routes",
  requireRole("ADMIN", "OFFICER", "VIEWER"),
  async (_req, res, next) => {
    try {
      return res.json({
        data:
          await wasteRouteService.list(),
      });
    } catch (error) {
      next(error);
    }
  },
);
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

router.post(
  "/routes",
  requireRole("ADMIN", "OFFICER"),
  async (req, res, next) => {
    try {
      const input =
        routeSchema.parse(req.body);

      const data =
        await wasteRouteService.create(
          input,
          {
            userId: req.user.sub,
            ipAddress: req.ip,
          },
        );

      return res
        .status(201)
        .json({ data });
    } catch (error) {
      next(error);
    }
  },
);
router.patch(
  "/routes/:id",
  requireRole("ADMIN", "OFFICER"),
  async (req, res, next) => {
    try {
      const input =
        routeSchema.partial().parse(req.body);

      if (!Object.keys(input).length) {
        throw httpError(
          422,
          "กรุณาระบุข้อมูลเส้นทางเก็บขยะที่ต้องการปรับปรุง",
        );
      }

      await wasteRouteService.update(
        req.params.id,
        input,
        {
          userId: req.user.sub,
          ipAddress: req.ip,
        },
      );

      return res.json({
        data: {
          id: req.params.id,
          ...input,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);
router.delete(
  "/routes/:id",
  requireRole("ADMIN", "OFFICER"),
  async (req, res, next) => {
    try {
      await wasteRouteService.remove(
        req.params.id,
        {
          userId: req.user.sub,
          ipAddress: req.ip,
        },
      );

      return res.status(204).end();
    } catch (error) {
      next(error);
    }
  },
);
router.get(
  "/routes/:id/stops",
  requireRole("ADMIN", "OFFICER", "VIEWER"),
  async (req, res, next) => {
    try {
      const data =
        await wasteRouteService.getStops(
          req.params.id,
        );

      return res.json({ data });
    } catch (error) {
      next(error);
    }
  },
);
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

router.put(
  "/routes/:id/stops",
  requireRole("ADMIN", "OFFICER"),
  async (req, res, next) => {
    try {
      const input =
        routeStopsSchema.parse(req.body);

      const data =
        await wasteRouteService.replaceStops(
          req.params.id,
          input,
          {
            userId: req.user.sub,
            ipAddress: req.ip,
          },
        );

      return res.json({ data });
    } catch (error) {
      next(error);
    }
  },
);
router.get(
  "/plans/resource-availability",
  requireRole("ADMIN", "OFFICER", "VIEWER"),
  async (req, res, next) => {
    try {
      const input =
        resourceAvailabilityQuerySchema.parse(req.query);

      const data =
        await wastePlanResourceService.getAvailability(input);

      return res.json({ data });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/plans",
  requireRole(
    "ADMIN",
    "OFFICER",
    "VIEWER",
  ),
  async (req, res, next) => {
    try {
      const query =
        z.object({
          date:
            dateSchema.optional(),
        }).parse(req.query);

      const data =
        await wastePlanService
          .list(query);

      return res.json({ data });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/plans",
  requireRole(
    "ADMIN",
    "OFFICER",
  ),
  async (req, res, next) => {
    try {
      const input =
        planSchema.parse(
          req.body,
        );

      const data =
        await wastePlanService
          .create(
            input,
            {
              userId:
                req.user.sub,
              ipAddress:
                req.ip,
            },
          );

      return res
        .status(201)
        .json({ data });
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  "/plans/:id",
  requireRole(
    "ADMIN",
    "OFFICER",
  ),
  async (req, res, next) => {
    try {
      const input =
        planSchema
          .partial()
          .parse(req.body);

      if (
        !Object.keys(input).length
      ) {
        throw httpError(
          422,
          "กรุณาระบุข้อมูลแผนปฏิบัติงานที่ต้องการปรับปรุง",
        );
      }

      const data =
        await wastePlanService
          .update(
            req.params.id,
            input,
            {
              userId:
                req.user.sub,
              ipAddress:
                req.ip,
            },
          );

      return res.json({ data });
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  "/plans/:id/status",
  requireRole(
    "ADMIN",
    "OFFICER",
  ),
  async (req, res, next) => {
    try {
      const input =
        planStatusSchema
          .parse(req.body);

      const data =
        await wastePlanStatusService
          .updateStatus(
            req.params.id,
            input,
            {
              userId:
                req.user.sub,
              ipAddress:
                req.ip,
            },
          );

      return res.json({ data });
    } catch (error) {
      next(error);
    }
  },
);
router.get(
  "/plans/:id/track",
  requireRole(
    "ADMIN",
    "OFFICER",
    "VIEWER",
  ),
  async (req, res, next) => {
    try {
      const data =
        await wasteTrackingService
          .getPlanTracking(
            req.params.id,
          );

      return res.json({ data });
    } catch (error) {
      next(error);
    }
  },
);
router.get(
  "/service-users",
  requireRole("ADMIN", "OFFICER", "VIEWER"),
  async (req, res, next) => {
    try {
      const query =
        z.object({
          routeId:
            z.string()
              .uuid()
              .optional(),
          search:
            z.string()
              .trim()
              .max(100)
              .optional(),
        }).parse(req.query);

      return res.json({
        data:
          await wasteServiceUserService.list(
            query,
          ),
      });
    } catch (error) {
      next(error);
    }
  },
);
router.post(
  "/service-users",
  requireRole("ADMIN", "OFFICER"),
  async (req, res, next) => {
    try {
      const input =
        serviceUserSchema.parse(
          req.body,
        );

      const data =
        await wasteServiceUserService.create(
          input,
          {
            userId: req.user.sub,
            ipAddress: req.ip,
          },
        );

      return res
        .status(201)
        .json({ data });
    } catch (error) {
      next(error);
    }
  },
);
router.patch(
  "/service-users/:id",
  requireRole("ADMIN", "OFFICER"),
  async (req, res, next) => {
    try {
      const input =
        serviceUserSchema
          .partial()
          .parse(req.body);

      if (!Object.keys(input).length) {
        throw httpError(
          422,
          "กรุณาระบุข้อมูลผู้ใช้บริการที่ต้องการปรับปรุง",
        );
      }

      const data =
        await wasteServiceUserService.update(
          req.params.id,
          input,
          {
            userId: req.user.sub,
            ipAddress: req.ip,
          },
        );

      return res.json({ data });
    } catch (error) {
      next(error);
    }
  },
);
router.get(
  "/service-users/:id/route-suggestions",
  requireRole("ADMIN", "OFFICER", "VIEWER"),
  async (req, res, next) => {
    try {
      return res.json({
        data:
          await wasteServiceUserService
            .routeSuggestions(
              req.params.id,
            ),
      });
    } catch (error) {
      next(error);
    }
  },
);
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

router.post(
  "/service-users/:id/unlink-line",
  requireRole("ADMIN", "OFFICER"),
  async (req, res, next) => {
    try {
      const data =
        await wasteServiceUserService.unlinkLine(
          req.params.id,
          {
            userId: req.user.sub,
            ipAddress: req.ip,
          },
        );

      return res.json({ data });
    } catch (error) {
      next(error);
    }
  },
);
router.delete(
  "/service-users/:id",
  requireRole("ADMIN", "OFFICER"),
  async (req, res, next) => {
    try {
      await wasteServiceUserService.remove(
        req.params.id,
        {
          userId: req.user.sub,
          ipAddress: req.ip,
        },
      );

      return res.status(204).end();
    } catch (error) {
      next(error);
    }
  },
);
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

router.get(
  "/incidents",
  requireRole(
    "ADMIN",
    "OFFICER",
    "VIEWER",
  ),
  async (req, res, next) => {
    try {
      const query =
        z.object({
          status:
            z.enum([
              "REPORTED",
              "ACKNOWLEDGED",
              "RESOLVED",
            ])
            .optional(),
        }).parse(req.query);

      return res.json({
        data:
          await wasteIncidentService
            .list(query),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/incidents",
  requireRole(
    "ADMIN",
    "OFFICER",
  ),
  async (req, res, next) => {
    try {
      const input =
        incidentSchema.parse(
          req.body,
        );

      const data =
        await wasteIncidentService
          .create(
            input,
            {
              userId:
                req.user.sub,
              ipAddress:
                req.ip,
            },
          );

      return res
        .status(201)
        .json({ data });
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  "/incidents/:id",
  requireRole(
    "ADMIN",
    "OFFICER",
  ),
  async (req, res, next) => {
    try {
      const input =
        incidentUpdateSchema
          .parse(req.body);

      const data =
        await wasteIncidentService
          .update(
            req.params.id,
            input,
            {
              userId:
                req.user.sub,
              ipAddress:
                req.ip,
            },
          );

      return res.json({ data });
    } catch (error) {
      next(error);
    }
  },
);
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
