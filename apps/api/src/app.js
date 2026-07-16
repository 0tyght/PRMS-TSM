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
import { authenticate, errorHandler, requireRole } from "./middleware.js";

const registrationSchema = z.object({
  ownerName: z.string().trim().min(2).max(150),
  nationalId: z.string().regex(/^\d{13}$/).optional().or(z.literal("")),
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

const registrationStatusSchema = z.object({
  status: z.enum(Object.values(REGISTRATION_STATUS)),
  note: z.string().trim().max(500).optional().default(""),
});

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  error.expose = true;
  return error;
}

function createReferenceNo() {
  const now = new Date();
  const buddhistYear = now.getFullYear() + 543;
  const datePart = [
    String(now.getFullYear()).slice(-2),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  const randomPart = crypto.randomInt(1000, 10000);

  return `TSM-${buddhistYear}-${datePart}-${randomPart}`;
}

function createRegistrationNo(referenceNo) {
  return `PET-${String(referenceNo).replace(/^TSM-/, "")}`;
}

async function ensureVillageExists(db, villageId) {
  const [rows] = await db.execute(
    `
      SELECT id
      FROM villages
      WHERE id = ?
        AND is_active = 1
      LIMIT 1
      FOR UPDATE
    `,
    [villageId],
  );

  if (!rows[0]) {
    throw createHttpError(422, "ไม่พบหมู่บ้านที่เลือก หรือหมู่บ้านถูกปิดใช้งาน");
  }
}

async function findOwner(db, input) {
  if (input.nationalId) {
    const [rows] = await db.execute(
      `
        SELECT id, household_id AS householdId, deleted_at AS deletedAt
        FROM owners
        WHERE national_id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [input.nationalId],
    );

    return rows[0] || null;
  }

  const [rows] = await db.execute(
    `
      SELECT id, household_id AS householdId, deleted_at AS deletedAt
      FROM owners
      WHERE deleted_at IS NULL
        AND phone = ?
        AND full_name = ?
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE
    `,
    [input.phone, input.ownerName],
  );

  return rows[0] || null;
}

async function findOrCreateHousehold(db, input) {
  const [rows] = await db.execute(
    `
      SELECT id, address_detail AS addressDetail
      FROM households
      WHERE deleted_at IS NULL
        AND village_id = ?
        AND house_no = ?
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE
    `,
    [input.villageId, input.houseNo],
  );

  const existing = rows[0];

  if (existing) {
    if (!existing.addressDetail && input.addressDetail) {
      await db.execute(
        `
          UPDATE households
          SET address_detail = ?
          WHERE id = ?
        `,
        [input.addressDetail, existing.id],
      );
    }

    return existing.id;
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
    [householdId, input.houseNo, input.villageId, input.addressDetail],
  );

  return householdId;
}

async function findOrCreateOwner(db, input) {
  const existingOwner = await findOwner(db, input);

  if (existingOwner) {
    await db.execute(
      `
        UPDATE owners
        SET full_name = ?,
            phone = ?,
            consent_at = COALESCE(consent_at, NOW()),
            deleted_at = NULL
        WHERE id = ?
      `,
      [input.ownerName, input.phone, existingOwner.id],
    );

    return {
      ownerId: existingOwner.id,
      householdId: existingOwner.householdId,
      reused: true,
    };
  }

  const householdId = await findOrCreateHousehold(db, input);
  const ownerId = crypto.randomUUID();

  await db.execute(
    `
      INSERT INTO owners (
        id,
        household_id,
        full_name,
        national_id,
        phone,
        consent_at
      )
      VALUES (?, ?, ?, NULLIF(?, ''), ?, NOW())
    `,
    [
      ownerId,
      householdId,
      input.ownerName,
      input.nationalId || "",
      input.phone,
    ],
  );

  return {
    ownerId,
    householdId,
    reused: false,
  };
}

async function findRecentDuplicateRegistration(db, ownerId, input) {
  const [rows] = await db.execute(
    `
      SELECT
        r.id,
        r.reference_no AS referenceNo,
        r.status
      FROM registrations r
      INNER JOIN pets p
        ON p.id = r.pet_id
      WHERE r.owner_id = ?
        AND r.status IN (
          'DRAFT',
          'SUBMITTED',
          'UNDER_REVIEW',
          'NEED_MORE_INFO',
          'APPROVED'
        )
        AND r.created_at >= DATE_SUB(NOW(), INTERVAL 10 MINUTE)
        AND p.deleted_at IS NULL
        AND p.name = ?
        AND p.species = ?
        AND p.sex = ?
        AND p.birth_date <=> NULLIF(?, '')
      ORDER BY r.created_at DESC
      LIMIT 1
      FOR UPDATE
    `,
    [
      ownerId,
      input.petName,
      input.species,
      input.sex,
      input.birthDate || "",
    ],
  );

  return rows[0] || null;
}

async function createPublicRegistration(db, input) {
  await ensureVillageExists(db, input.villageId);

  const owner = await findOrCreateOwner(db, input);
  const duplicate = await findRecentDuplicateRegistration(
    db,
    owner.ownerId,
    input,
  );

  if (duplicate) {
    return {
      id: duplicate.id,
      referenceNo: duplicate.referenceNo,
      status: duplicate.status,
      duplicate: true,
      reusedOwner: owner.reused,
    };
  }

  const registrationId = crypto.randomUUID();
  const petId = crypto.randomUUID();
  const referenceNo = createReferenceNo();

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
        birth_date,
        status
      )
      VALUES (
        ?,
        ?,
        ?,
        ?,
        ?,
        NULLIF(?, ''),
        NULLIF(?, ''),
        NULLIF(?, ''),
        'ACTIVE'
      )
    `,
    [
      petId,
      owner.ownerId,
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
      owner.ownerId,
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
      VALUES (?, ?, NULL, 'ACTIVE', NOW(), ?, NULL)
    `,
    [
      crypto.randomUUID(),
      petId,
      "สร้างสถานะเริ่มต้นจากคำขอขึ้นทะเบียนของประชาชน",
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
      VALUES (?, ?, NULL, ?, NOW(), ?, NULL)
    `,
    [
      crypto.randomUUID(),
      petId,
      owner.ownerId,
      "บันทึกเจ้าของเริ่มต้นจากคำขอขึ้นทะเบียนของประชาชน",
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
        new_value
      )
      VALUES (
        ?,
        NULL,
        'SUBMIT_REGISTRATION',
        'REGISTRATION',
        ?,
        JSON_OBJECT(
          'referenceNo', ?,
          'ownerId', ?,
          'petId', ?,
          'species', ?
        )
      )
    `,
    [
      crypto.randomUUID(),
      registrationId,
      referenceNo,
      owner.ownerId,
      petId,
      input.species,
    ],
  );

  return {
    id: registrationId,
    referenceNo,
    status: REGISTRATION_STATUS.SUBMITTED,
    duplicate: false,
    reusedOwner: owner.reused,
  };
}

export function createApp() {
  const app = express();

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
      // Health endpoint remains reachable so callers can see DB state.
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

      res.json({ data: rows });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/public/registrations", async (req, res, next) => {
    try {
      const basic = validatePetRegistration(req.body);

      if (!basic.valid) {
        return res.status(422).json({
          message: "ข้อมูลไม่ครบถ้วน",
          errors: basic.errors,
        });
      }

      const input = registrationSchema.parse(req.body);
      const result = await withTransaction((db) =>
        createPublicRegistration(db, input),
      );

      return res.status(result.duplicate ? 200 : 201).json({ data: result });
    } catch (error) {
      next(error);
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
          `,
          [req.params.referenceNo],
        );

        if (!rows[0]) {
          return res.status(404).json({ message: "ไม่พบเลขที่คำขอ" });
        }

        return res.json({ data: rows[0] });
      } catch (error) {
        next(error);
      }
    },
  );

  app.post("/api/auth/login", async (req, res, next) => {
    try {
      const { email, password } = z
        .object({
          email: z.string().email(),
          password: z.string().min(8),
        })
        .parse(req.body);

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
        `,
        [email],
      );

      const user = rows[0];

      if (!user || !(await bcrypt.compare(password, user.password_hash))) {
        return res
          .status(401)
          .json({ message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" });
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
      next(error);
    }
  });

  app.post("/api/auth/dev-login", async (_req, res, next) => {
    if (config.nodeEnv === "production") {
      return res.status(404).json({ message: "ไม่พบหน้าที่ร้องขอ" });
    }

    try {
      const [rows] = await pool.query(
        `
          SELECT id, full_name, email, role
          FROM users
          WHERE is_active = 1
            AND role = 'ADMIN'
          ORDER BY created_at
          LIMIT 1
        `,
      );

      const user = rows[0];

      if (!user) {
        return res
          .status(503)
          .json({ message: "ยังไม่มีบัญชีผู้ดูแลระบบ" });
      }

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
      next(error);
    }
  });

  app.get("/api/admin/dashboard", authenticate, async (_req, res, next) => {
    try {
      const [[pets], [pending], [services], [cases]] = await Promise.all([
        pool.query(
          `
            SELECT
              COUNT(*) AS total,
              SUM(p.species = 'DOG') AS dogs,
              SUM(p.species = 'CAT') AS cats
            FROM pets p
            INNER JOIN owners o
              ON o.id = p.owner_id
             AND o.deleted_at IS NULL
            INNER JOIN households h
              ON h.id = o.household_id
             AND h.deleted_at IS NULL
            WHERE p.deleted_at IS NULL
              AND EXISTS (
                SELECT 1
                FROM registrations r
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
                WHERE vaccinated_at >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)
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
            WHERE status NOT IN ('RESOLVED', 'CLOSED')
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
      next(error);
    }
  });

  app.get(
    "/api/admin/registrations",
    authenticate,
    async (req, res, next) => {
      try {
        const status = req.query.status || null;
        const [rows] = await pool.execute(
          `
            SELECT
              r.id,
              r.reference_no AS referenceNo,
              r.status,
              r.submitted_at AS submittedAt,
              o.full_name AS ownerName,
              p.name AS petName,
              p.species,
              v.village_no AS villageNo
            FROM registrations r
            INNER JOIN owners o
              ON o.id = r.owner_id
            INNER JOIN pets p
              ON p.id = r.pet_id
            INNER JOIN households h
              ON h.id = o.household_id
            INNER JOIN villages v
              ON v.id = h.village_id
            WHERE (? IS NULL OR r.status = ?)
            ORDER BY r.submitted_at DESC
            LIMIT 200
          `,
          [status, status],
        );

        return res.json({ data: rows });
      } catch (error) {
        next(error);
      }
    },
  );

  app.patch(
    "/api/admin/registrations/:id/status",
    authenticate,
    requireRole("ADMIN", "OFFICER"),
    async (req, res, next) => {
      try {
        const { status, note } = registrationStatusSchema.parse(req.body);

        const result = await withTransaction(async (db) => {
          const [registrationRows] = await db.execute(
            `
              SELECT
                r.id,
                r.reference_no AS referenceNo,
                r.pet_id AS petId,
                r.status AS oldStatus
              FROM registrations r
              WHERE r.id = ?
              LIMIT 1
              FOR UPDATE
            `,
            [req.params.id],
          );

          const registration = registrationRows[0];

          if (!registration) {
            throw createHttpError(404, "ไม่พบคำขอขึ้นทะเบียน");
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
            [status, note, req.user.sub, req.params.id],
          );

          if (status === REGISTRATION_STATUS.APPROVED) {
            const registrationNo = createRegistrationNo(
              registration.referenceNo,
            );

            await db.execute(
              `
                UPDATE pets
                SET registration_no = COALESCE(registration_no, ?),
                    registered_at = COALESCE(registered_at, NOW())
                WHERE id = ?
              `,
              [registrationNo, registration.petId],
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
                  p.id,
                  NULL,
                  p.status,
                  COALESCE(p.registered_at, NOW()),
                  ?,
                  ?
                FROM pets p
                WHERE p.id = ?
                  AND NOT EXISTS (
                    SELECT 1
                    FROM pet_status_history history
                    WHERE history.pet_id = p.id
                  )
              `,
              [
                crypto.randomUUID(),
                "สร้างประวัติสถานะเริ่มต้นในวันอนุมัติขึ้นทะเบียน",
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
                  p.id,
                  NULL,
                  p.owner_id,
                  COALESCE(p.registered_at, NOW()),
                  ?,
                  ?
                FROM pets p
                WHERE p.id = ?
                  AND NOT EXISTS (
                    SELECT 1
                    FROM pet_owner_history history
                    WHERE history.pet_id = p.id
                  )
              `,
              [
                crypto.randomUUID(),
                "สร้างประวัติเจ้าของเริ่มต้นในวันอนุมัติขึ้นทะเบียน",
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
                new_value
              )
              VALUES (
                ?,
                ?,
                'UPDATE_STATUS',
                'REGISTRATION',
                ?,
                JSON_OBJECT('status', ?),
                JSON_OBJECT('status', ?, 'note', ?)
              )
            `,
            [
              crypto.randomUUID(),
              req.user.sub,
              req.params.id,
              registration.oldStatus,
              status,
              note,
            ],
          );

          return {
            id: req.params.id,
            status,
          };
        });

        return res.json({ data: result });
      } catch (error) {
        next(error);
      }
    },
  );

  app.get("/api/admin/pets", authenticate, async (req, res, next) => {
    try {
      const search = `%${String(req.query.search || "").trim()}%`;
      const species = req.query.species || null;

      const [rows] = await pool.execute(
        `
          SELECT
            p.id,
            p.registration_no AS registrationNo,
            p.name AS petName,
            p.species,
            p.sex,
            p.breed,
            p.color,
            p.status,
            p.registered_at AS registeredAt,
            o.full_name AS ownerName,
            o.phone,
            h.house_no AS houseNo,
            v.village_no AS villageNo,
            (
              SELECT MAX(vr.vaccinated_at)
              FROM vaccination_records vr
              WHERE vr.pet_id = p.id
            ) AS lastVaccinatedAt,
            (
              SELECT MAX(vr.next_due_at)
              FROM vaccination_records vr
              WHERE vr.pet_id = p.id
            ) AS nextVaccinationDueAt,
            EXISTS (
              SELECT 1
              FROM sterilization_records sr
              WHERE sr.pet_id = p.id
            ) AS sterilized
          FROM pets p
          INNER JOIN owners o
            ON o.id = p.owner_id
           AND o.deleted_at IS NULL
          INNER JOIN households h
            ON h.id = o.household_id
           AND h.deleted_at IS NULL
          INNER JOIN villages v
            ON v.id = h.village_id
          WHERE p.deleted_at IS NULL
            AND EXISTS (
              SELECT 1
              FROM registrations approved_registration
              WHERE approved_registration.pet_id = p.id
                AND approved_registration.status = 'APPROVED'
            )
            AND (? IS NULL OR p.species = ?)
            AND (
              p.name LIKE ?
              OR o.full_name LIKE ?
              OR o.phone LIKE ?
              OR COALESCE(p.registration_no, '') LIKE ?
            )
          ORDER BY COALESCE(p.registered_at, p.created_at) DESC
          LIMIT 300
        `,
        [species, species, search, search, search, search],
      );

      return res.json({ data: rows });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/map", authenticate, async (_req, res, next) => {
    try {
      const [rows] = await pool.query(
        `
          SELECT
            p.id,
            p.name AS petName,
            p.species,
            o.full_name AS ownerName,
            h.id AS householdId,
            h.house_no AS houseNo,
            h.address_detail AS addressDetail,
            v.village_no AS villageNo,
            CAST(h.latitude AS DECIMAL(10, 7)) AS latitude,
            CAST(h.longitude AS DECIMAL(10, 7)) AS longitude,
            EXISTS (
              SELECT 1
              FROM vaccination_records vr
              WHERE vr.pet_id = p.id
                AND vr.vaccinated_at >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)
            ) AS vaccinated,
            EXISTS (
              SELECT 1
              FROM sterilization_records sr
              WHERE sr.pet_id = p.id
            ) AS sterilized
          FROM pets p
          INNER JOIN owners o
            ON o.id = p.owner_id
           AND o.deleted_at IS NULL
          INNER JOIN households h
            ON h.id = o.household_id
           AND h.deleted_at IS NULL
          INNER JOIN villages v
            ON v.id = h.village_id
          WHERE p.deleted_at IS NULL
            AND EXISTS (
              SELECT 1
              FROM registrations approved_registration
              WHERE approved_registration.pet_id = p.id
                AND approved_registration.status = 'APPROVED'
            )
          ORDER BY v.village_no, p.name
        `,
      );

      return res.json({ data: rows });
    } catch (error) {
      next(error);
    }
  });

  app.post(
    "/api/admin/pets/:petId/vaccinations",
    authenticate,
    requireRole("ADMIN", "OFFICER"),
    async (req, res, next) => {
      try {
        const input = z
          .object({
            vaccineName: z.string().trim().min(2).max(150),
            vaccinatedAt: z.string().date(),
            nextDueAt: z.string().date().optional().or(z.literal("")),
            lotNo: z.string().trim().max(100).optional().default(""),
            providerName: z.string().trim().max(150).optional().default(""),
          })
          .parse(req.body);

        const id = crypto.randomUUID();

        await withTransaction(async (db) => {
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
              VALUES (?, ?, ?, NULLIF(?, ''), ?, NULLIF(?, ''), NULLIF(?, ''), ?)
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
                new_value
              )
              VALUES (
                ?,
                ?,
                'ADD_VACCINATION',
                'PET',
                ?,
                JSON_OBJECT('vaccinatedAt', ?)
              )
            `,
            [
              crypto.randomUUID(),
              req.user.sub,
              req.params.petId,
              input.vaccinatedAt,
            ],
          );
        });

        return res.status(201).json({ data: { id } });
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/admin/pets/:petId/sterilizations",
    authenticate,
    requireRole("ADMIN", "OFFICER"),
    async (req, res, next) => {
      try {
        const input = z
          .object({
            sterilizedAt: z.string().date(),
            providerName: z.string().trim().max(150).optional().default(""),
            note: z.string().trim().max(500).optional().default(""),
          })
          .parse(req.body);

        const id = crypto.randomUUID();

        await withTransaction(async (db) => {
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
              VALUES (?, ?, ?, NULLIF(?, ''), NULLIF(?, ''), ?)
              ON DUPLICATE KEY UPDATE
                sterilized_at = VALUES(sterilized_at),
                provider_name = VALUES(provider_name),
                note = VALUES(note),
                recorded_by = VALUES(recorded_by)
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

          await db.execute(
            `
              INSERT INTO audit_logs (
                id,
                user_id,
                action,
                entity_type,
                entity_id,
                new_value
              )
              VALUES (
                ?,
                ?,
                'RECORD_STERILIZATION',
                'PET',
                ?,
                JSON_OBJECT('sterilizedAt', ?)
              )
            `,
            [
              crypto.randomUUID(),
              req.user.sub,
              req.params.petId,
              input.sterilizedAt,
            ],
          );
        });

        return res.status(201).json({ data: { id } });
      } catch (error) {
        next(error);
      }
    },
  );

  app.get("/api/admin/cases", authenticate, async (_req, res, next) => {
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
          FROM cases c
          INNER JOIN villages v
            ON v.id = c.village_id
          LEFT JOIN users u
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
      next(error);
    }
  });

  app.patch(
    "/api/admin/cases/:id/status",
    authenticate,
    requireRole("ADMIN", "OFFICER"),
    async (req, res, next) => {
      try {
        const { status } = z
          .object({
            status: z.enum([
              "RECEIVED",
              "ASSIGNED",
              "IN_PROGRESS",
              "RESOLVED",
              "CLOSED",
            ]),
          })
          .parse(req.body);

        await withTransaction(async (db) => {
          await db.execute(
            `
              UPDATE cases
              SET status = ?,
                  assigned_to = COALESCE(assigned_to, ?),
                  resolved_at = IF(
                    ? IN ('RESOLVED', 'CLOSED'),
                    NOW(),
                    NULL
                  )
              WHERE id = ?
            `,
            [status, req.user.sub, status, req.params.id],
          );

          await db.execute(
            `
              INSERT INTO audit_logs (
                id,
                user_id,
                action,
                entity_type,
                entity_id,
                new_value
              )
              VALUES (
                ?,
                ?,
                'UPDATE_STATUS',
                'CASE',
                ?,
                JSON_OBJECT('status', ?)
              )
            `,
            [crypto.randomUUID(), req.user.sub, req.params.id, status],
          );
        });

        return res.json({
          data: {
            id: req.params.id,
            status,
          },
        });
      } catch (error) {
        next(error);
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
              SUM(p.species = 'DOG') AS dogs,
              SUM(p.species = 'CAT') AS cats,
              COUNT(
                DISTINCT CASE
                  WHEN vr.id IS NOT NULL THEN p.id
                END
              ) AS vaccinated,
              COUNT(DISTINCT sr.pet_id) AS sterilized
            FROM villages v
            LEFT JOIN households h
              ON h.village_id = v.id
             AND h.deleted_at IS NULL
            LEFT JOIN owners o
              ON o.household_id = h.id
             AND o.deleted_at IS NULL
            LEFT JOIN pets p
              ON p.owner_id = o.id
             AND p.deleted_at IS NULL
             AND EXISTS (
               SELECT 1
               FROM registrations approved_registration
               WHERE approved_registration.pet_id = p.id
                 AND approved_registration.status = 'APPROVED'
             )
            LEFT JOIN vaccination_records vr
              ON vr.pet_id = p.id
             AND vr.vaccinated_at >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)
            LEFT JOIN sterilization_records sr
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
        next(error);
      }
    },
  );

  app.use(errorHandler);

  return app;
}
