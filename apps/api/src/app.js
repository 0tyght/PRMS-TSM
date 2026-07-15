import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import {
  ORGANIZATION,
  REGISTRATION_STATUS,
  validatePetRegistration,
} from "@prms/shared";
import { config } from "./config.js";
import { pool, withTransaction } from "./db.js";
import {
  authenticate,
  errorHandler,
  requireRole,
} from "./middleware.js";

const registrationSchema = z.object({
  ownerName: z.string().trim().min(2).max(150),
  nationalId: z
    .string()
    .regex(/^\d{13}$/)
    .optional()
    .or(z.literal("")),
  phone: z.string().regex(/^0\d{9}$/),
  houseNo: z.string().trim().min(1).max(30),
  villageId: z.coerce.number().int().positive(),
  addressDetail: z.string().trim().max(255).optional().default(""),
  petName: z.string().trim().min(1).max(100),
  species: z.enum(["DOG", "CAT"]),
  sex: z.enum(["MALE", "FEMALE", "UNKNOWN"]).default("UNKNOWN"),
  breed: z.string().trim().max(100).optional().default("ไม่ระบุ"),
  color: z.string().trim().max(100).optional().default("ไม่ระบุ"),
  birthDate: z.string().date().optional().or(z.literal("")),
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8),
});

const registrationStatusSchema = z.object({
  status: z.enum(Object.values(REGISTRATION_STATUS)),
  note: z.string().trim().max(500).optional().default(""),
});

const vaccinationSchema = z.object({
  vaccineName: z.string().trim().min(2).max(150),
  vaccinatedAt: z.string().date(),
  nextDueAt: z.string().date().optional().or(z.literal("")),
  lotNo: z.string().trim().max(100).optional().default(""),
  providerName: z.string().trim().max(150).optional().default(""),
});

const sterilizationSchema = z.object({
  sterilizedAt: z.string().date(),
  providerName: z.string().trim().max(150).optional().default(""),
  note: z.string().trim().max(500).optional().default(""),
});

const caseStatusSchema = z.object({
  status: z.enum([
    "RECEIVED",
    "ASSIGNED",
    "IN_PROGRESS",
    "RESOLVED",
    "CLOSED",
  ]),
});

const FINAL_REGISTRATION_STATUSES = new Set([
  REGISTRATION_STATUS.APPROVED,
  REGISTRATION_STATUS.REJECTED,
]);

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  error.expose = true;
  return error;
}

function getRequestIp(req) {
  const forwarded = req.headers["x-forwarded-for"];

  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim().slice(0, 45);
  }

  return String(req.ip || "").slice(0, 45) || null;
}

function registrationNumberFromReference(referenceNo) {
  const suffix = String(referenceNo).split("-").at(-1);
  return `PET-${suffix}`;
}

async function createUniqueReferenceNo(db) {
  const buddhistYear = new Date().getFullYear() + 543;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = `TSM-${buddhistYear}-${crypto.randomInt(
      100000,
      1000000,
    )}`;

    const [rows] = await db.execute(
      "SELECT id FROM registrations WHERE reference_no = ? LIMIT 1",
      [candidate],
    );

    if (!rows.length) {
      return candidate;
    }
  }

  throw createHttpError(
    503,
    "ไม่สามารถสร้างเลขที่คำขอได้ กรุณาลองใหม่อีกครั้ง",
  );
}

async function ensureVillageExists(db, villageId) {
  const [rows] = await db.execute(
    `
      SELECT id
      FROM villages
      WHERE id = ?
        AND is_active = 1
      LIMIT 1
    `,
    [villageId],
  );

  if (!rows.length) {
    throw createHttpError(
      422,
      "ไม่พบหมู่บ้านที่เลือก หรือหมู่บ้านถูกปิดใช้งาน",
    );
  }
}

async function findOrCreateHousehold(db, input) {
  const [rows] = await db.execute(
    `
      SELECT
        id,
        address_detail AS addressDetail,
        deleted_at AS deletedAt
      FROM households
      WHERE village_id = ?
        AND house_no = ?
      ORDER BY
        CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END,
        created_at
      LIMIT 1
      FOR UPDATE
    `,
    [input.villageId, input.houseNo],
  );

  const household = rows[0];

  if (household) {
    await db.execute(
      `
        UPDATE households
        SET address_detail = CASE
              WHEN ? <> '' THEN ?
              ELSE address_detail
            END,
            deleted_at = NULL
        WHERE id = ?
      `,
      [
        input.addressDetail,
        input.addressDetail,
        household.id,
      ],
    );

    return household.id;
  }

  const householdId = crypto.randomUUID();

  await db.execute(
    `
      INSERT INTO households (
        id,
        house_no,
        village_id,
        address_detail
      )
      VALUES (?, ?, ?, NULLIF(?, ''))
    `,
    [
      householdId,
      input.houseNo,
      input.villageId,
      input.addressDetail,
    ],
  );

  return householdId;
}

async function findOwnerForUpdate(db, input) {
  if (input.nationalId) {
    const [nationalIdRows] = await db.execute(
      `
        SELECT
          id,
          household_id AS householdId,
          deleted_at AS deletedAt
        FROM owners
        WHERE national_id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [input.nationalId],
    );

    if (nationalIdRows[0]) {
      return nationalIdRows[0];
    }

    const [matchingContactRows] = await db.execute(
      `
        SELECT
          id,
          household_id AS householdId,
          deleted_at AS deletedAt
        FROM owners
        WHERE full_name = ?
          AND phone = ?
          AND national_id IS NULL
        ORDER BY
          CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END,
          created_at
        LIMIT 1
        FOR UPDATE
      `,
      [
        input.ownerName,
        input.phone,
      ],
    );

    return matchingContactRows[0] || null;
  }

  const [rows] = await db.execute(
    `
      SELECT
        id,
        household_id AS householdId,
        deleted_at AS deletedAt
      FROM owners
      WHERE full_name = ?
        AND phone = ?
      ORDER BY
        CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END,
        created_at
      LIMIT 1
      FOR UPDATE
    `,
    [
      input.ownerName,
      input.phone,
    ],
  );

  return rows[0] || null;
}

async function findOrCreateOwner(db, householdId, input) {
  const owner = await findOwnerForUpdate(db, input);

  if (owner) {
    await db.execute(
      `
        UPDATE owners
        SET household_id = ?,
            full_name = ?,
            national_id = COALESCE(
              NULLIF(?, ''),
              national_id
            ),
            phone = ?,
            deleted_at = NULL
        WHERE id = ?
      `,
      [
        householdId,
        input.ownerName,
        input.nationalId || "",
        input.phone,
        owner.id,
      ],
    );

    return owner.id;
  }

  const ownerId = crypto.randomUUID();

  await db.execute(
    `
      INSERT INTO owners (
        id,
        household_id,
        full_name,
        national_id,
        phone
      )
      VALUES (?, ?, ?, NULLIF(?, ''), ?)
    `,
    [
      ownerId,
      householdId,
      input.ownerName,
      input.nationalId || "",
      input.phone,
    ],
  );

  return ownerId;
}

async function ensureNoRecentDuplicateRegistration(
  db,
  ownerId,
  input,
) {
  const [rows] = await db.execute(
    `
      SELECT
        r.reference_no AS referenceNo
      FROM registrations AS r
      INNER JOIN pets AS p
        ON p.id = r.pet_id
      WHERE r.owner_id = ?
        AND p.name = ?
        AND p.species = ?
        AND p.sex = ?
        AND COALESCE(p.breed, '') = ?
        AND COALESCE(p.color, '') = ?
        AND COALESCE(
          DATE_FORMAT(p.birth_date, '%Y-%m-%d'),
          ''
        ) = ?
        AND r.status IN (
          'SUBMITTED',
          'UNDER_REVIEW',
          'NEED_MORE_INFO'
        )
        AND r.submitted_at >= DATE_SUB(
          NOW(),
          INTERVAL 10 MINUTE
        )
      ORDER BY r.submitted_at DESC
      LIMIT 1
      FOR UPDATE
    `,
    [
      ownerId,
      input.petName,
      input.species,
      input.sex,
      input.breed,
      input.color,
      input.birthDate || "",
    ],
  );

  if (rows[0]) {
    throw createHttpError(
      409,
      `พบคำขอเดิมที่เพิ่งส่ง หมายเลข ${rows[0].referenceNo} กรุณาอย่าส่งข้อมูลซ้ำ`,
    );
  }
}

async function ensureApprovedPet(db, petId) {
  const [rows] = await db.execute(
    `
      SELECT p.id
      FROM pets AS p
      WHERE p.id = ?
        AND p.deleted_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM registrations AS r
          WHERE r.pet_id = p.id
            AND r.status = 'APPROVED'
        )
      LIMIT 1
      FOR UPDATE
    `,
    [petId],
  );

  if (!rows.length) {
    throw createHttpError(
      404,
      "ไม่พบข้อมูลสัตว์ที่อนุมัติขึ้นทะเบียนแล้ว",
    );
  }
}

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);

  app.use(helmet());

  app.use(
    cors({
      origin: config.origins,
      credentials: true,
    }),
  );

  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", async (_req, res) => {
    let database = "unavailable";

    try {
      await pool.query("SELECT 1");
      database = "ready";
    } catch {
      // Endpoint health ต้องยังตอบได้ แม้ฐานข้อมูลไม่พร้อม
    }

    res.json({
      service: ORGANIZATION.productName,
      organization: ORGANIZATION.shortName,
      status: "ok",
      database,
    });
  });

  app.get("/api/public/villages", async (_req, res, next) => {
    try {
      const [rows] = await pool.query(
        `
          SELECT
            id,
            village_no AS villageNo,
            name_th AS name
          FROM villages
          WHERE is_active = 1
          ORDER BY village_no
        `,
      );

      return res.json({ data: rows });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/public/registrations", async (req, res, next) => {
    try {
      const basicValidation = validatePetRegistration(req.body);

      if (!basicValidation.valid) {
        return res.status(422).json({
          message: "ข้อมูลไม่ครบถ้วน",
          errors: basicValidation.errors,
        });
      }

      const input = registrationSchema.parse(req.body);
      const requestIp = getRequestIp(req);

      const result = await withTransaction(async (db) => {
        await ensureVillageExists(db, input.villageId);

        const householdId = await findOrCreateHousehold(
          db,
          input,
        );

        const ownerId = await findOrCreateOwner(
          db,
          householdId,
          input,
        );

        await ensureNoRecentDuplicateRegistration(
          db,
          ownerId,
          input,
        );

        const registrationId = crypto.randomUUID();
        const petId = crypto.randomUUID();
        const referenceNo = await createUniqueReferenceNo(db);

        await db.execute(
          `
            INSERT INTO pets (
              id,
              owner_id,
              name,
              species,
              sex,
              breed,
              color,
              birth_date
            )
            VALUES (
              ?,
              ?,
              ?,
              ?,
              ?,
              NULLIF(?, ''),
              NULLIF(?, ''),
              NULLIF(?, '')
            )
          `,
          [
            petId,
            ownerId,
            input.petName,
            input.species,
            input.sex,
            input.breed,
            input.color,
            input.birthDate || "",
          ],
        );

        await db.execute(
          `
            INSERT INTO registrations (
              id,
              reference_no,
              owner_id,
              pet_id,
              status,
              submitted_at
            )
            VALUES (?, ?, ?, ?, ?, NOW())
          `,
          [
            registrationId,
            referenceNo,
            ownerId,
            petId,
            REGISTRATION_STATUS.SUBMITTED,
          ],
        );

        await db.execute(
          `
            INSERT INTO pet_status_history (
              id,
              pet_id,
              old_status,
              new_status,
              effective_at,
              note,
              recorded_by
            )
            VALUES (
              ?,
              ?,
              NULL,
              'ACTIVE',
              NOW(),
              ?,
              NULL
            )
          `,
          [
            crypto.randomUUID(),
            petId,
            "สถานะเริ่มต้นเมื่อส่งคำขอขึ้นทะเบียน",
          ],
        );

        await db.execute(
          `
            INSERT INTO pet_owner_history (
              id,
              pet_id,
              previous_owner_id,
              new_owner_id,
              transferred_at,
              reason,
              recorded_by
            )
            VALUES (
              ?,
              ?,
              NULL,
              ?,
              NOW(),
              ?,
              NULL
            )
          `,
          [
            crypto.randomUUID(),
            petId,
            ownerId,
            "เจ้าของสัตว์เมื่อส่งคำขอขึ้นทะเบียน",
          ],
        );

        await db.execute(
          `
            INSERT INTO audit_logs (
              id,
              user_id,
              action,
              entity_type,
              entity_id,
              new_value,
              ip_address
            )
            VALUES (
              ?,
              NULL,
              'CREATE_REGISTRATION',
              'REGISTRATION',
              ?,
              JSON_OBJECT(
                'referenceNo', ?,
                'status', ?,
                'petId', ?,
                'ownerId', ?
              ),
              ?
            )
          `,
          [
            crypto.randomUUID(),
            registrationId,
            referenceNo,
            REGISTRATION_STATUS.SUBMITTED,
            petId,
            ownerId,
            requestIp,
          ],
        );

        return {
          id: registrationId,
          referenceNo,
          status: REGISTRATION_STATUS.SUBMITTED,
        };
      });

      return res.status(201).json({ data: result });
    } catch (error) {
      return next(error);
    }
  });

  app.get(
    "/api/public/registrations/:referenceNo",
    async (req, res, next) => {
      try {
        const [rows] = await pool.execute(
          `
            SELECT
              reference_no AS referenceNo,
              status,
              submitted_at AS submittedAt,
              reviewed_at AS reviewedAt
            FROM registrations
            WHERE reference_no = ?
            LIMIT 1
          `,
          [req.params.referenceNo],
        );

        if (!rows[0]) {
          return res.status(404).json({
            message: "ไม่พบเลขที่คำขอ",
          });
        }

        return res.json({ data: rows[0] });
      } catch (error) {
        return next(error);
      }
    },
  );

  app.post("/api/auth/login", async (req, res, next) => {
    try {
      const { email, password } = loginSchema.parse(req.body);

      const [rows] = await pool.execute(
        `
          SELECT
            id,
            full_name,
            email,
            password_hash,
            role
          FROM users
          WHERE email = ?
            AND is_active = 1
          LIMIT 1
        `,
        [email],
      );

      const user = rows[0];

      if (
        !user ||
        !(await bcrypt.compare(password, user.password_hash))
      ) {
        return res.status(401).json({
          message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
        });
      }

      await pool.execute(
        "UPDATE users SET last_login_at = NOW() WHERE id = ?",
        [user.id],
      );

      const token = jwt.sign(
        {
          sub: user.id,
          name: user.full_name,
          role: user.role,
        },
        config.jwtSecret,
        { expiresIn: "8h" },
      );

      return res.json({
        data: {
          token,
          user: {
            id: user.id,
            name: user.full_name,
            email: user.email,
            role: user.role,
          },
        },
      });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/auth/dev-login", async (_req, res, next) => {
    if (config.nodeEnv === "production") {
      return res.status(404).json({
        message: "ไม่พบหน้าที่ร้องขอ",
      });
    }

    try {
      const [rows] = await pool.query(
        `
          SELECT
            id,
            full_name,
            email,
            role
          FROM users
          WHERE is_active = 1
            AND role = 'ADMIN'
          ORDER BY created_at
          LIMIT 1
        `,
      );

      const user = rows[0];

      if (!user) {
        return res.status(503).json({
          message: "ยังไม่มีบัญชีผู้ดูแลระบบ",
        });
      }

      await pool.execute(
        "UPDATE users SET last_login_at = NOW() WHERE id = ?",
        [user.id],
      );

      const token = jwt.sign(
        {
          sub: user.id,
          name: user.full_name,
          role: user.role,
        },
        config.jwtSecret,
        { expiresIn: "8h" },
      );

      return res.json({
        data: {
          token,
          user: {
            id: user.id,
            name: user.full_name,
            email: user.email,
            role: user.role,
          },
          developmentMode: true,
        },
      });
    } catch (error) {
      return next(error);
    }
  });

  app.get(
    "/api/admin/dashboard",
    authenticate,
    async (_req, res, next) => {
      try {
        const [[pets], [pending], [services], [cases]] =
          await Promise.all([
            pool.query(
              `
                SELECT
                  COUNT(*) AS total,
                  COALESCE(
                    SUM(p.species = 'DOG'),
                    0
                  ) AS dogs,
                  COALESCE(
                    SUM(p.species = 'CAT'),
                    0
                  ) AS cats
                FROM pets AS p
                WHERE p.deleted_at IS NULL
                  AND EXISTS (
                    SELECT 1
                    FROM registrations AS r
                    WHERE r.pet_id = p.id
                      AND r.status = 'APPROVED'
                  )
              `,
            ),

            pool.query(
              `
                SELECT COUNT(*) AS pending
                FROM registrations
                WHERE status IN (
                  'SUBMITTED',
                  'UNDER_REVIEW',
                  'NEED_MORE_INFO'
                )
              `,
            ),

            pool.query(
              `
                SELECT
                  (
                    SELECT COUNT(*)
                    FROM vaccination_records
                    WHERE vaccinated_at >= DATE_SUB(
                      CURDATE(),
                      INTERVAL 1 YEAR
                    )
                  ) AS vaccinations,
                  (
                    SELECT COUNT(*)
                    FROM sterilization_records
                  ) AS sterilizations
              `,
            ),

            pool.query(
              `
                SELECT COUNT(*) AS openCases
                FROM cases
                WHERE status NOT IN (
                  'RESOLVED',
                  'CLOSED'
                )
              `,
            ),
          ]);

        return res.json({
          data: {
            ...pets[0],
            ...pending[0],
            ...services[0],
            ...cases[0],
          },
        });
      } catch (error) {
        return next(error);
      }
    },
  );

  app.get(
    "/api/admin/registrations",
    authenticate,
    async (req, res, next) => {
      try {
        const status = req.query.status
          ? z
              .enum(Object.values(REGISTRATION_STATUS))
              .parse(req.query.status)
          : null;

        const [rows] = await pool.execute(
          `
            SELECT
              r.id,
              r.reference_no AS referenceNo,
              r.status,
              r.submitted_at AS submittedAt,
              r.reviewed_at AS reviewedAt,
              r.review_note AS reviewNote,
              o.full_name AS ownerName,
              p.name AS petName,
              p.species,
              v.village_no AS villageNo
            FROM registrations AS r
            INNER JOIN owners AS o
              ON o.id = r.owner_id
            INNER JOIN pets AS p
              ON p.id = r.pet_id
            INNER JOIN households AS h
              ON h.id = o.household_id
            INNER JOIN villages AS v
              ON v.id = h.village_id
            WHERE (? IS NULL OR r.status = ?)
            ORDER BY r.submitted_at DESC
            LIMIT 200
          `,
          [
            status,
            status,
          ],
        );

        return res.json({ data: rows });
      } catch (error) {
        return next(error);
      }
    },
  );

  app.patch(
    "/api/admin/registrations/:id/status",
    authenticate,
    requireRole("ADMIN", "OFFICER"),
    async (req, res, next) => {
      try {
        const input = registrationStatusSchema.parse(req.body);
        const requestIp = getRequestIp(req);

        const result = await withTransaction(async (db) => {
          const [rows] = await db.execute(
            `
              SELECT
                r.id,
                r.reference_no AS referenceNo,
                r.status,
                r.pet_id AS petId,
                r.owner_id AS ownerId,
                p.status AS petStatus
              FROM registrations AS r
              INNER JOIN pets AS p
                ON p.id = r.pet_id
              WHERE r.id = ?
              LIMIT 1
              FOR UPDATE
            `,
            [req.params.id],
          );

          const registration = rows[0];

          if (!registration) {
            throw createHttpError(
              404,
              "ไม่พบคำขอขึ้นทะเบียน",
            );
          }

          if (
            FINAL_REGISTRATION_STATUSES.has(
              registration.status,
            ) &&
            registration.status !== input.status
          ) {
            throw createHttpError(
              409,
              "คำขอนี้สิ้นสุดการพิจารณาแล้ว ไม่สามารถเปลี่ยนสถานะได้",
            );
          }

          await db.execute(
            `
              UPDATE registrations
              SET status = ?,
                  review_note = NULLIF(?, ''),
                  reviewed_by = ?,
                  reviewed_at = NOW()
              WHERE id = ?
            `,
            [
              input.status,
              input.note,
              req.user.sub,
              req.params.id,
            ],
          );

          if (
            input.status === REGISTRATION_STATUS.APPROVED
          ) {
            const registrationNo =
              registrationNumberFromReference(
                registration.referenceNo,
              );

            await db.execute(
              `
                UPDATE pets
                SET registration_no = COALESCE(
                      NULLIF(registration_no, ''),
                      ?
                    ),
                    registered_at = COALESCE(
                      registered_at,
                      NOW()
                    )
                WHERE id = ?
              `,
              [
                registrationNo,
                registration.petId,
              ],
            );

            await db.execute(
              `
                INSERT INTO pet_status_history (
                  id,
                  pet_id,
                  old_status,
                  new_status,
                  effective_at,
                  note,
                  recorded_by
                )
                SELECT
                  ?,
                  ?,
                  NULL,
                  ?,
                  NOW(),
                  ?,
                  ?
                WHERE NOT EXISTS (
                  SELECT 1
                  FROM pet_status_history
                  WHERE pet_id = ?
                )
              `,
              [
                crypto.randomUUID(),
                registration.petId,
                registration.petStatus,
                "สร้างประวัติเริ่มต้นเมื่ออนุมัติขึ้นทะเบียน",
                req.user.sub,
                registration.petId,
              ],
            );

            await db.execute(
              `
                INSERT INTO pet_owner_history (
                  id,
                  pet_id,
                  previous_owner_id,
                  new_owner_id,
                  transferred_at,
                  reason,
                  recorded_by
                )
                SELECT
                  ?,
                  ?,
                  NULL,
                  ?,
                  NOW(),
                  ?,
                  ?
                WHERE NOT EXISTS (
                  SELECT 1
                  FROM pet_owner_history
                  WHERE pet_id = ?
                )
              `,
              [
                crypto.randomUUID(),
                registration.petId,
                registration.ownerId,
                "สร้างประวัติเจ้าของเมื่ออนุมัติขึ้นทะเบียน",
                req.user.sub,
                registration.petId,
              ],
            );
          }

          await db.execute(
            `
              INSERT INTO audit_logs (
                id,
                user_id,
                action,
                entity_type,
                entity_id,
                old_value,
                new_value,
                ip_address
              )
              VALUES (
                ?,
                ?,
                'UPDATE_STATUS',
                'REGISTRATION',
                ?,
                JSON_OBJECT('status', ?),
                JSON_OBJECT(
                  'status', ?,
                  'note', ?
                ),
                ?
              )
            `,
            [
              crypto.randomUUID(),
              req.user.sub,
              req.params.id,
              registration.status,
              input.status,
              input.note,
              requestIp,
            ],
          );

          return {
            id: req.params.id,
            status: input.status,
          };
        });

        return res.json({ data: result });
      } catch (error) {
        return next(error);
      }
    },
  );

  app.get(
    "/api/admin/pets",
    authenticate,
    async (req, res, next) => {
      try {
        const search = `%${String(
          req.query.search || "",
        ).trim()}%`;

        const species = req.query.species
          ? z
              .enum(["DOG", "CAT"])
              .parse(req.query.species)
          : null;

        const [rows] = await pool.execute(
          `
            SELECT
              p.id,
              p.registration_no AS registrationNo,
              p.microchip_no AS microchipNo,
              p.name AS petName,
              p.species,
              p.sex,
              p.breed,
              p.color,
              p.birth_date AS birthDate,
              p.status,
              p.registered_at AS registeredAt,
              o.full_name AS ownerName,
              o.phone,
              h.house_no AS houseNo,
              v.village_no AS villageNo,
              (
                SELECT MAX(vr.vaccinated_at)
                FROM vaccination_records AS vr
                WHERE vr.pet_id = p.id
              ) AS lastVaccinatedAt,
              (
                SELECT MAX(vr.next_due_at)
                FROM vaccination_records AS vr
                WHERE vr.pet_id = p.id
              ) AS nextVaccinationDueAt,
              EXISTS (
                SELECT 1
                FROM sterilization_records AS sr
                WHERE sr.pet_id = p.id
              ) AS sterilized
            FROM pets AS p
            INNER JOIN owners AS o
              ON o.id = p.owner_id
            INNER JOIN households AS h
              ON h.id = o.household_id
            INNER JOIN villages AS v
              ON v.id = h.village_id
            WHERE p.deleted_at IS NULL
              AND o.deleted_at IS NULL
              AND h.deleted_at IS NULL
              AND EXISTS (
                SELECT 1
                FROM registrations AS ar
                WHERE ar.pet_id = p.id
                  AND ar.status = 'APPROVED'
              )
              AND (? IS NULL OR p.species = ?)
              AND (
                p.name LIKE ?
                OR o.full_name LIKE ?
                OR o.phone LIKE ?
                OR COALESCE(
                  p.registration_no,
                  ''
                ) LIKE ?
                OR COALESCE(
                  p.microchip_no,
                  ''
                ) LIKE ?
              )
            ORDER BY
              p.registered_at DESC,
              p.created_at DESC
            LIMIT 300
          `,
          [
            species,
            species,
            search,
            search,
            search,
            search,
            search,
          ],
        );

        return res.json({ data: rows });
      } catch (error) {
        return next(error);
      }
    },
  );

  app.get(
    "/api/admin/map",
    authenticate,
    async (_req, res, next) => {
      try {
        const [rows] = await pool.query(
          `
            SELECT
              p.id,
              p.name AS petName,
              p.species,
              o.full_name AS ownerName,
              h.house_no AS houseNo,
              v.village_no AS villageNo,
              h.latitude,
              h.longitude,
              EXISTS (
                SELECT 1
                FROM vaccination_records AS vr
                WHERE vr.pet_id = p.id
                  AND vr.vaccinated_at >= DATE_SUB(
                    CURDATE(),
                    INTERVAL 1 YEAR
                  )
              ) AS vaccinated,
              EXISTS (
                SELECT 1
                FROM sterilization_records AS sr
                WHERE sr.pet_id = p.id
              ) AS sterilized
            FROM pets AS p
            INNER JOIN owners AS o
              ON o.id = p.owner_id
            INNER JOIN households AS h
              ON h.id = o.household_id
            INNER JOIN villages AS v
              ON v.id = h.village_id
            WHERE p.deleted_at IS NULL
              AND o.deleted_at IS NULL
              AND h.deleted_at IS NULL
              AND EXISTS (
                SELECT 1
                FROM registrations AS r
                WHERE r.pet_id = p.id
                  AND r.status = 'APPROVED'
              )
            ORDER BY
              v.village_no,
              p.name
          `,
        );

        return res.json({ data: rows });
      } catch (error) {
        return next(error);
      }
    },
  );

  app.post(
    "/api/admin/pets/:petId/vaccinations",
    authenticate,
    requireRole("ADMIN", "OFFICER"),
    async (req, res, next) => {
      try {
        const input = vaccinationSchema.parse(req.body);
        const requestIp = getRequestIp(req);
        const id = crypto.randomUUID();

        await withTransaction(async (db) => {
          await ensureApprovedPet(
            db,
            req.params.petId,
          );

          await db.execute(
            `
              INSERT INTO vaccination_records (
                id,
                pet_id,
                vaccine_name,
                lot_no,
                vaccinated_at,
                next_due_at,
                provider_name,
                recorded_by
              )
              VALUES (
                ?,
                ?,
                ?,
                NULLIF(?, ''),
                ?,
                NULLIF(?, ''),
                NULLIF(?, ''),
                ?
              )
            `,
            [
              id,
              req.params.petId,
              input.vaccineName,
              input.lotNo,
              input.vaccinatedAt,
              input.nextDueAt || "",
              input.providerName,
              req.user.sub,
            ],
          );

          await db.execute(
            `
              INSERT INTO audit_logs (
                id,
                user_id,
                action,
                entity_type,
                entity_id,
                new_value,
                ip_address
              )
              VALUES (
                ?,
                ?,
                'ADD_VACCINATION',
                'PET',
                ?,
                JSON_OBJECT(
                  'recordId', ?,
                  'vaccineName', ?,
                  'vaccinatedAt', ?,
                  'nextDueAt', ?
                ),
                ?
              )
            `,
            [
              crypto.randomUUID(),
              req.user.sub,
              req.params.petId,
              id,
              input.vaccineName,
              input.vaccinatedAt,
              input.nextDueAt || null,
              requestIp,
            ],
          );
        });

        return res.status(201).json({
          data: { id },
        });
      } catch (error) {
        return next(error);
      }
    },
  );

  app.post(
    "/api/admin/pets/:petId/sterilizations",
    authenticate,
    requireRole("ADMIN", "OFFICER"),
    async (req, res, next) => {
      try {
        const input = sterilizationSchema.parse(req.body);
        const requestIp = getRequestIp(req);

        const result = await withTransaction(async (db) => {
          await ensureApprovedPet(
            db,
            req.params.petId,
          );

          const [existingRows] = await db.execute(
            `
              SELECT id
              FROM sterilization_records
              WHERE pet_id = ?
              LIMIT 1
              FOR UPDATE
            `,
            [req.params.petId],
          );

          const existing = existingRows[0];
          const id = existing?.id || crypto.randomUUID();

          if (existing) {
            await db.execute(
              `
                UPDATE sterilization_records
                SET sterilized_at = ?,
                    provider_name = NULLIF(?, ''),
                    note = NULLIF(?, ''),
                    recorded_by = ?
                WHERE id = ?
              `,
              [
                input.sterilizedAt,
                input.providerName,
                input.note,
                req.user.sub,
                id,
              ],
            );
          } else {
            await db.execute(
              `
                INSERT INTO sterilization_records (
                  id,
                  pet_id,
                  sterilized_at,
                  provider_name,
                  note,
                  recorded_by
                )
                VALUES (
                  ?,
                  ?,
                  ?,
                  NULLIF(?, ''),
                  NULLIF(?, ''),
                  ?
                )
              `,
              [
                id,
                req.params.petId,
                input.sterilizedAt,
                input.providerName,
                input.note,
                req.user.sub,
              ],
            );
          }

          await db.execute(
            `
              INSERT INTO audit_logs (
                id,
                user_id,
                action,
                entity_type,
                entity_id,
                new_value,
                ip_address
              )
              VALUES (
                ?,
                ?,
                'RECORD_STERILIZATION',
                'PET',
                ?,
                JSON_OBJECT(
                  'recordId', ?,
                  'sterilizedAt', ?,
                  'updatedExisting', ?
                ),
                ?
              )
            `,
            [
              crypto.randomUUID(),
              req.user.sub,
              req.params.petId,
              id,
              input.sterilizedAt,
              existing ? 1 : 0,
              requestIp,
            ],
          );

          return {
            id,
            updated: Boolean(existing),
          };
        });

        return res
          .status(result.updated ? 200 : 201)
          .json({
            data: {
              id: result.id,
            },
          });
      } catch (error) {
        return next(error);
      }
    },
  );

  app.get(
    "/api/admin/cases",
    authenticate,
    async (_req, res, next) => {
      try {
        const [rows] = await pool.query(
          `
            SELECT
              c.id,
              c.reference_no AS referenceNo,
              c.reporter_name AS reporterName,
              c.reporter_phone AS reporterPhone,
              c.category,
              c.description,
              c.status,
              c.created_at AS createdAt,
              v.village_no AS villageNo,
              u.full_name AS assignedTo
            FROM cases AS c
            INNER JOIN villages AS v
              ON v.id = c.village_id
            LEFT JOIN users AS u
              ON u.id = c.assigned_to
            ORDER BY
              FIELD(
                c.status,
                'RECEIVED',
                'ASSIGNED',
                'IN_PROGRESS',
                'RESOLVED',
                'CLOSED'
              ),
              c.created_at DESC
            LIMIT 300
          `,
        );

        return res.json({ data: rows });
      } catch (error) {
        return next(error);
      }
    },
  );

  app.patch(
    "/api/admin/cases/:id/status",
    authenticate,
    requireRole("ADMIN", "OFFICER"),
    async (req, res, next) => {
      try {
        const { status } = caseStatusSchema.parse(req.body);
        const requestIp = getRequestIp(req);

        const result = await withTransaction(async (db) => {
          const [rows] = await db.execute(
            `
              SELECT status
              FROM cases
              WHERE id = ?
              LIMIT 1
              FOR UPDATE
            `,
            [req.params.id],
          );

          if (!rows[0]) {
            throw createHttpError(
              404,
              "ไม่พบเรื่องร้องเรียน",
            );
          }

          const oldStatus = rows[0].status;

          await db.execute(
            `
              UPDATE cases
              SET status = ?,
                  assigned_to = COALESCE(
                    assigned_to,
                    ?
                  ),
                  resolved_at = CASE
                    WHEN ? IN ('RESOLVED', 'CLOSED')
                    THEN COALESCE(
                      resolved_at,
                      NOW()
                    )
                    ELSE NULL
                  END
              WHERE id = ?
            `,
            [
              status,
              req.user.sub,
              status,
              req.params.id,
            ],
          );

          await db.execute(
            `
              INSERT INTO audit_logs (
                id,
                user_id,
                action,
                entity_type,
                entity_id,
                old_value,
                new_value,
                ip_address
              )
              VALUES (
                ?,
                ?,
                'UPDATE_STATUS',
                'CASE',
                ?,
                JSON_OBJECT('status', ?),
                JSON_OBJECT('status', ?),
                ?
              )
            `,
            [
              crypto.randomUUID(),
              req.user.sub,
              req.params.id,
              oldStatus,
              status,
              requestIp,
            ],
          );

          return {
            id: req.params.id,
            status,
          };
        });

        return res.json({ data: result });
      } catch (error) {
        return next(error);
      }
    },
  );

  app.get(
    "/api/admin/reports/villages",
    authenticate,
    async (_req, res, next) => {
      try {
        const [rows] = await pool.query(
          `
            SELECT
              v.village_no AS villageNo,
              v.name_th AS villageName,
              COUNT(DISTINCT p.id) AS totalPets,
              COUNT(
                DISTINCT CASE
                  WHEN p.species = 'DOG'
                  THEN p.id
                END
              ) AS dogs,
              COUNT(
                DISTINCT CASE
                  WHEN p.species = 'CAT'
                  THEN p.id
                END
              ) AS cats,
              COUNT(
                DISTINCT CASE
                  WHEN vr.id IS NOT NULL
                  THEN p.id
                END
              ) AS vaccinated,
              COUNT(
                DISTINCT sr.pet_id
              ) AS sterilized
            FROM villages AS v
            LEFT JOIN households AS h
              ON h.village_id = v.id
              AND h.deleted_at IS NULL
            LEFT JOIN owners AS o
              ON o.household_id = h.id
              AND o.deleted_at IS NULL
            LEFT JOIN pets AS p
              ON p.owner_id = o.id
              AND p.deleted_at IS NULL
              AND EXISTS (
                SELECT 1
                FROM registrations AS ar
                WHERE ar.pet_id = p.id
                  AND ar.status = 'APPROVED'
              )
            LEFT JOIN vaccination_records AS vr
              ON vr.pet_id = p.id
              AND vr.vaccinated_at >= DATE_SUB(
                CURDATE(),
                INTERVAL 1 YEAR
              )
            LEFT JOIN sterilization_records AS sr
              ON sr.pet_id = p.id
            GROUP BY
              v.id,
              v.village_no,
              v.name_th
            ORDER BY v.village_no
          `,
        );

        return res.json({ data: rows });
      } catch (error) {
        return next(error);
      }
    },
  );

  app.use("/api", (_req, res) => {
    return res.status(404).json({
      message: "ไม่พบบริการ API ที่ร้องขอ",
    });
  });

  app.use(errorHandler);

  return app;
}