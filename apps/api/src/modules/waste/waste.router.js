import { Router } from "express";
import { z } from "zod";
import { authenticate, requireRole } from "../../core/middleware.js";
import { HttpError } from "../../presentation/http/HttpError.js";

export function createWasteRouter(
  services,
) {
  if (!services) {
    throw new TypeError(
      "createWasteRouter requires waste application services",
    );
  }

  const requiredServices = [
    "trackingTokenService",
    "wastePlanResourceService",
    "wasteVehicleService",
    "wasteDriverService",
    "wasteRouteService",
    "wasteServiceUserService",
    "wasteTrackingService",
    "wasteIncidentService",
    "wasteIncidentReplacementUseCase",
    "wastePlanService",
    "wastePlanStatusService",
    "wasteDashboardQueryService",
    "wasteBillingService",
    "wasteReportQueryService",
    "wasteRoutePreviewService",
    "wasteRouteOptimization",
    "wastePlanPublicationService",
  ];

  for (
    const serviceName of requiredServices
  ) {
    if (!services[serviceName]) {
      throw new TypeError(
        `Missing waste service: ${serviceName}`,
      );
    }
  }

  const {
    trackingTokenService,
    wastePlanResourceService,
    wasteVehicleService,
    wasteDriverService,
    wasteRouteService,
    wasteServiceUserService,
    wasteTrackingService,
    wasteIncidentService,
    wasteIncidentReplacementUseCase,
    wastePlanService,
    wastePlanStatusService,
    wasteDashboardQueryService,
    wasteBillingService,
    wasteReportQueryService,
    wasteRoutePreviewService,
    wasteRouteOptimization,
    wastePlanPublicationService,
  } = services;

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

const driverCreateSchema = z.object({
  driverCode: z.string().trim().min(2).max(30),
  fullName: z.string().trim().min(2).max(150),
  phone: z.string().regex(/^0\d{9}$/),
  isActive: z.boolean().default(true),
}).strict();

const driverUpdateSchema = driverCreateSchema.partial().strict();

const routeSchema = z.object({
  routeCode: z.string().trim().min(2).max(30),
  routeName: z.string().trim().min(2).max(150),
  description: nullableText(500),
  routeGeojson: z.record(z.string(), z.unknown()).optional().nullable(),
  isActive: z.boolean().default(true),
});

const routePreviewSchema = z.object({
  waypoints: z.array(z.object({
    latitude: z.coerce
      .number()
      .min(-90)
      .max(90),
    longitude: z.coerce
      .number()
      .min(-180)
      .max(180),
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

const incidentReplacementSchema = z.object({
  replacementVehicleId: z.string().uuid().optional().nullable(),
  replacementDriverId: z.string().uuid().optional().nullable(),
  resumePlan: z.boolean().default(true),
  resolutionNote: nullableText(1000),
}).refine(
  (input) => Boolean(
    input.replacementVehicleId ||
    input.replacementDriverId,
  ),
  {
    message: "กรุณาเลือกรถเก็บขยะหรือพนักงานประจำรถขยะทดแทนอย่างน้อย 1 รายการ",
  },
);

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
  return new HttpError(status, message);
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

router.post(
  "/incidents/:id/replacement",
  requireRole(
    "ADMIN",
    "OFFICER",
  ),
  async (req, res, next) => {
    try {
      const input =
        incidentReplacementSchema
          .parse(req.body);

      const data =
        await wasteIncidentReplacementUseCase
          .execute(
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
        driverCreateSchema.parse(req.body);

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
        driverUpdateSchema.parse(req.body);

      if (!Object.keys(input).length) {
        throw httpError(
          422,
          "กรุณาระบุข้อมูลพนักงานประจำรถขยะที่ต้องการปรับปรุง",
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
  "/drivers/:id/line-link",
  requireRole("ADMIN", "OFFICER"),
  async (req, res, next) => {
    try {
      const data = await wasteDriverService.unlinkLine(
        req.params.id,
        { userId: req.user.sub, ipAddress: req.ip },
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
router.post(
  "/routes/preview",
  requireRole(
    "ADMIN",
    "OFFICER",
  ),
  async (req, res, next) => {
    try {
      const input =
        routePreviewSchema
          .parse(req.body);

      const data =
        await wasteRoutePreviewService
          .preview(
            input.waypoints,
          );

      return res.json({ data });
    } catch (error) {
      next(error);
    }
  },
);
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
    SERVICE_USER_MISSING_LOCATION: [422, "กรุณาระบุตำแหน่งสถานที่รับบริการก่อนกำหนดเส้นทาง"],
    SERVICE_LOCATION_OUTSIDE_ROUTE: [422, "สถานที่รับบริการอยู่ห่างจากเส้นทางเกินระยะที่กำหนด กรุณาตรวจพิกัดหรือเลือกเส้นทางที่อยู่ในระยะ"],
    ASSIGNMENT_PROPOSAL_MISMATCH: [422, "ผลคำนวณนี้ไม่ตรงกับผู้ใช้บริการที่กำลังกำหนดเส้นทาง"],
    SERVICE_USER_ROUTE_CHANGED: [409, "เส้นทางของผู้ใช้บริการมีการเปลี่ยนแปลง กรุณาคำนวณใหม่"],
    SERVICE_USER_LOCATION_CHANGED: [409, "ตำแหน่งสถานที่รับบริการมีการเปลี่ยนแปลง กรุณาคำนวณใหม่"],
  };
  const [status, message] = errors[error.message] || [500, "ไม่สามารถจัดเส้นทางเก็บขยะได้"];
  return httpError(status, message);
}

router.post("/routes/:id/optimization-proposals", requireRole("ADMIN", "OFFICER"), async (req, res, next) => {
  try {
    const input = routeOptimizationSchema.parse(req.body);
    const proposal = await wasteRouteOptimization.propose.execute({ routeId: req.params.id, ...input });
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
    const proposal = await wasteRouteOptimization.confirm.execute({
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
          "กรุณาระบุข้อมูลแผนปฏิบัติงานเก็บขยะที่ต้องการปรับปรุง",
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
router.post(
  "/plans/:id/publish",
  requireRole(
    "ADMIN",
    "OFFICER",
  ),
  async (req, res, next) => {
    try {
      const input =
        planPublicationSchema
          .parse(
            req.body || {},
          );

      const data =
        await wastePlanPublicationService
          .publish(
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

router.post(
  "/plans/:id/withdraw",
  requireRole(
    "ADMIN",
    "OFFICER",
  ),
  async (req, res, next) => {
    try {
      const input =
        planWithdrawalSchema
          .parse(
            req.body || {},
          );

      const data =
        await wastePlanPublicationService
          .withdraw(
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
  "/plans/:id/notifications",
  requireRole(
    "ADMIN",
    "OFFICER",
    "VIEWER",
  ),
  async (req, res, next) => {
    try {
      const data =
        await wastePlanPublicationService
          .deliverySummary(
            req.params.id,
          );

      return res.json({ data });
    } catch (error) {
      next(error);
    }
  },
);
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
    const proposal = await wasteRouteOptimization.proposeAssignment.execute({
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
    const proposal = await wasteRouteOptimization.confirmAssignment.execute({
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

router.get(
  "/fee-rates",
  requireRole(
    "ADMIN",
    "OFFICER",
    "VIEWER",
  ),
  async (_req, res, next) => {
    try {
      const data =
        await wasteBillingService
          .listFeeRates();

      return res.json({ data });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/fee-rates",
  requireRole(
    "ADMIN",
    "OFFICER",
  ),
  async (req, res, next) => {
    try {
      const input =
        feeRateSchema
          .parse(req.body);

      const data =
        await wasteBillingService
          .createFeeRate(
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
  "/fee-rates/:id",
  requireRole(
    "ADMIN",
    "OFFICER",
  ),
  async (req, res, next) => {
    try {
      const input =
        feeRateSchema
          .partial()
          .parse(req.body);

      if (
        !Object.keys(input).length
      ) {
        throw httpError(
          422,
          "กรุณาระบุอัตราค่าบริการที่ต้องการปรับปรุง",
        );
      }

      const data =
        await wasteBillingService
          .updateFeeRate(
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
  "/charges",
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
              "PENDING",
              "PAID",
              "OVERDUE",
              "VOID",
            ])
            .optional(),

          billingPeriod:
            dateSchema
              .optional(),
        }).parse(req.query);

      const data =
        await wasteBillingService
          .listCharges(query);

      return res.json({ data });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/charges",
  requireRole(
    "ADMIN",
    "OFFICER",
  ),
  async (req, res, next) => {
    try {
      const input =
        chargeSchema
          .parse(req.body);

      const data =
        await wasteBillingService
          .createCharge(
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
  "/charges/:id",
  requireRole(
    "ADMIN",
    "OFFICER",
  ),
  async (req, res, next) => {
    try {
      const input =
        chargeUpdateSchema
          .parse(req.body);

      const data =
        await wasteBillingService
          .updateCharge(
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

router.post(
  "/charges/:id/notice",
  requireRole(
    "ADMIN",
    "OFFICER",
  ),
  async (req, res, next) => {
    try {
      const data =
        await wasteBillingService
          .queueNotice(
            req.params.id,
            {
              userId:
                req.user.sub,
              ipAddress:
                req.ip,
            },
          );

      return res
        .status(202)
        .json({ data });
    } catch (error) {
      next(error);
    }
  },
);
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
router.get(
  "/reports/operations",
  requireRole(
    "ADMIN",
    "OFFICER",
    "VIEWER",
  ),
  async (req, res, next) => {
    try {
      const query =
        z.object({
          from:
            dateSchema.optional(),
          to:
            dateSchema.optional(),
        }).parse(req.query);

      const data =
        await wasteReportQueryService
          .operations(query);

      return res.json({ data });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/reports/billing",
  requireRole(
    "ADMIN",
    "OFFICER",
    "VIEWER",
  ),
  async (req, res, next) => {
    try {
      const query =
        z.object({
          billingPeriod:
            dateSchema.optional(),
        }).parse(req.query);

      const data =
        await wasteReportQueryService
          .billing(query);

      return res.json({ data });
    } catch (error) {
      next(error);
    }
  },
);
  return router;
}

export class WasteHttpModule {
  constructor({ services }) {
    if (!services) {
      throw new TypeError(
        "WasteHttpModule requires services",
      );
    }

    this.services =
      services;

    this.router =
      createWasteRouter(
        services,
      );
  }

  getRouter() {
    return this.router;
  }
}
