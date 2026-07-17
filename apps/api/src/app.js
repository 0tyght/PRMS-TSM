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
  status: z.enum([
    REGISTRATION_STATUS.UNDER_REVIEW,
    REGISTRATION_STATUS.NEED_MORE_INFO,
    REGISTRATION_STATUS.APPROVED,
    REGISTRATION_STATUS.REJECTED,
  ]),
  note: z.string().trim().max(500).optional().default(""),
}).superRefine((input, context) => {
  if (
    [REGISTRATION_STATUS.NEED_MORE_INFO, REGISTRATION_STATUS.REJECTED].includes(input.status) &&
    !input.note
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["note"], message: "กรุณาระบุเหตุผลหรือข้อมูลที่ต้องแก้ไข" });
  }
});

const REGISTRATION_TRANSITIONS = Object.freeze({
  SUBMITTED: ["UNDER_REVIEW", "NEED_MORE_INFO", "APPROVED", "REJECTED"],
  UNDER_REVIEW: ["NEED_MORE_INFO", "APPROVED", "REJECTED"],
  NEED_MORE_INFO: ["UNDER_REVIEW", "APPROVED", "REJECTED"],
});

const ownerUpdateSchema = z.object({
  fullName: z.string().trim().min(2).max(150),
  phone: z.string().regex(/^0\d{9}$/),
  lineUserId: z.string().trim().max(100).optional().default(""),
  houseNo: z.string().trim().min(1).max(30),
  villageId: z.coerce.number().int().positive(),
  addressDetail: z.string().trim().max(255).optional().default(""),
});

const staffUpdateSchema = z.object({
  role: z.enum(["ADMIN", "OFFICER", "VIEWER"]),
  isActive: z.boolean(),
});

const petStatusUpdateSchema = z.object({
  status: z.enum(["ACTIVE", "MISSING", "TRANSFERRED", "DECEASED"]),
  effectiveAt: z.string().date(),
  note: z.string().trim().min(2).max(500),
});

const petOwnerTransferSchema = z.object({
  ownerId: z.string().uuid(),
  transferredAt: z.string().date(),
  reason: z.string().trim().min(2).max(500),
});

const vaccinationRecordSchema = z.object({
  vaccineName: z.string().trim().min(2).max(150),
  vaccinatedAt: z.string().date(),
  nextDueAt: z.string().date().optional().or(z.literal("")),
  lotNo: z.string().trim().max(100).optional().default(""),
  providerName: z.string().trim().max(150).optional().default(""),
});

const sterilizationRecordSchema = z.object({
  sterilizedAt: z.string().date(),
  providerName: z.string().trim().max(150).optional().default(""),
  note: z.string().trim().max(500).optional().default(""),
});

const citizenLinkSchema = z.object({
  referenceNo: z.string().trim().min(8).max(30),
  phone: z.string().regex(/^0\d{9}$/),
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

async function verifyLineIdToken(idToken) {
  if (!config.lineChannelId) {
    throw createHttpError(503, "ยังไม่ได้ตั้งค่า LINE Login Channel ID");
  }
  const body = new URLSearchParams({ id_token: idToken, client_id: config.lineChannelId });
  const response = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.sub) throw createHttpError(401, "ไม่สามารถยืนยันตัวตน LINE ได้ กรุณาเข้าสู่ระบบใหม่");
  return result;
}

function createCitizenToken(lineProfile, ownerId = null) {
  return jwt.sign(
    { sub: lineProfile.sub, name: lineProfile.name || "ผู้ใช้ LINE", role: "CITIZEN", lineUserId: lineProfile.sub, ownerId },
    config.jwtSecret,
    { expiresIn: "2h" },
  );
}

async function pushLineText(lineUserId, text) {
  if (!lineUserId || !config.lineChannelAccessToken) return { status: "SKIPPED" };
  try {
    const response = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.lineChannelAccessToken}`,
        "Content-Type": "application/json",
        "X-Line-Retry-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({ to: lineUserId, messages: [{ type: "text", text }] }),
    });
    return { status: response.ok ? "SENT" : "FAILED", httpStatus: response.status };
  } catch {
    return { status: "FAILED", httpStatus: null };
  }
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

  app.get("/api/public/line-config", (_req, res) => {
    res.json({ data: { enabled: Boolean(config.lineLiffId), liffId: config.lineLiffId || null } });
  });

  app.post("/api/citizen/line/session", async (req, res, next) => {
    try {
      const { idToken } = z.object({ idToken: z.string().min(20).max(5000) }).parse(req.body);
      const profile = await verifyLineIdToken(idToken);
      const [rows] = await pool.execute(
        "SELECT id, full_name AS fullName FROM owners WHERE line_user_id = ? AND deleted_at IS NULL LIMIT 1",
        [profile.sub],
      );
      const owner = rows[0] || null;
      return res.json({
        data: {
          token: createCitizenToken(profile, owner?.id || null),
          profile: { displayName: profile.name || "ผู้ใช้ LINE", pictureUrl: profile.picture || null },
          linked: Boolean(owner),
          owner,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  app.post(
    "/api/citizen/line/link",
    authenticate,
    requireRole("CITIZEN"),
    async (req, res, next) => {
      try {
        const input = citizenLinkSchema.parse(req.body);
        const data = await withTransaction(async (db) => {
          const [rows] = await db.execute(
            `SELECT o.id, o.full_name AS fullName, o.line_user_id AS lineUserId
             FROM registrations r
             INNER JOIN owners o ON o.id = r.owner_id
             WHERE r.reference_no = ? AND o.phone = ? AND o.deleted_at IS NULL
             LIMIT 1 FOR UPDATE`,
            [input.referenceNo, input.phone],
          );
          const owner = rows[0];
          if (!owner) throw createHttpError(404, "ไม่พบข้อมูลที่ตรงกับเลขคำขอและเบอร์โทรศัพท์");
          if (owner.lineUserId && owner.lineUserId !== req.user.lineUserId) {
            throw createHttpError(409, "ทะเบียนนี้เชื่อมกับบัญชี LINE อื่นแล้ว");
          }
          await db.execute("UPDATE owners SET line_user_id = ? WHERE id = ?", [req.user.lineUserId, owner.id]);
          await db.execute(
            `INSERT INTO audit_logs
              (id, user_id, action, entity_type, entity_id, new_value, ip_address)
             VALUES (?, NULL, 'LINK_LINE_OWNER', 'OWNER', ?, ?, ?)`,
            [crypto.randomUUID(), owner.id, JSON.stringify({ lineUserId: req.user.lineUserId }), req.ip],
          );
          return owner;
        });
        const profile = { sub: req.user.lineUserId, name: req.user.name };
        return res.json({ data: { token: createCitizenToken(profile, data.id), owner: data } });
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/citizen/me",
    authenticate,
    requireRole("CITIZEN"),
    async (req, res, next) => {
      try {
        if (!req.user.ownerId) return res.json({ data: { linked: false, pets: [], registrations: [] } });
        const [ownerRows] = await pool.execute(
          `SELECT o.id, o.full_name AS fullName, o.phone, h.house_no AS houseNo,
                  v.village_no AS villageNo, v.name_th AS villageName
           FROM owners o INNER JOIN households h ON h.id = o.household_id
           INNER JOIN villages v ON v.id = h.village_id
           WHERE o.id = ? AND o.line_user_id = ? AND o.deleted_at IS NULL LIMIT 1`,
          [req.user.ownerId, req.user.lineUserId],
        );
        if (!ownerRows[0]) throw createHttpError(403, "ไม่สามารถเข้าถึงทะเบียนเจ้าของนี้ได้");
        const [pets, registrations] = await Promise.all([
          pool.execute(
            `SELECT p.id, p.registration_no AS registrationNo, p.name AS petName,
                    p.species, p.sex, p.breed, p.color, p.status,
                    (SELECT MAX(vaccinated_at) FROM vaccination_records vr WHERE vr.pet_id = p.id) AS lastVaccinatedAt,
                    EXISTS(SELECT 1 FROM sterilization_records sr WHERE sr.pet_id = p.id) AS sterilized
             FROM pets p WHERE p.owner_id = ? AND p.deleted_at IS NULL ORDER BY p.created_at DESC`,
            [req.user.ownerId],
          ).then(([rows]) => rows),
          pool.execute(
            `SELECT reference_no AS referenceNo, status, review_note AS reviewNote,
                    submitted_at AS submittedAt, reviewed_at AS reviewedAt
             FROM registrations WHERE owner_id = ? ORDER BY created_at DESC`,
            [req.user.ownerId],
          ).then(([rows]) => rows),
        ]);
        return res.json({ data: { linked: true, owner: ownerRows[0], pets, registrations } });
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

  app.get("/api/admin/owners", authenticate, async (req, res, next) => {
    try {
      const searchText = String(req.query.search || "").trim();
      const search = `%${searchText}%`;
      const villageId = req.query.villageId ? Number(req.query.villageId) : null;
      const [rows] = await pool.execute(
        `
          SELECT
            o.id,
            o.full_name AS fullName,
            CONCAT(LEFT(o.phone, 3), 'xxx', RIGHT(o.phone, 4)) AS phone,
            CASE
              WHEN o.national_id IS NULL OR o.national_id = '' THEN NULL
              ELSE CONCAT('xxxxxxxxx', RIGHT(o.national_id, 4))
            END AS nationalId,
            o.line_user_id IS NOT NULL AS linkedLine,
            o.consent_at AS consentAt,
            h.house_no AS houseNo,
            h.address_detail AS addressDetail,
            v.id AS villageId,
            v.village_no AS villageNo,
            v.name_th AS villageName,
            COUNT(DISTINCT CASE
              WHEN p.deleted_at IS NULL AND approved.id IS NOT NULL THEN p.id
            END) AS petCount,
            o.created_at AS createdAt
          FROM owners o
          INNER JOIN households h
            ON h.id = o.household_id
           AND h.deleted_at IS NULL
          INNER JOIN villages v ON v.id = h.village_id
          LEFT JOIN pets p ON p.owner_id = o.id
          LEFT JOIN registrations approved
            ON approved.pet_id = p.id
           AND approved.status = 'APPROVED'
          WHERE o.deleted_at IS NULL
            AND (? IS NULL OR v.id = ?)
            AND (
              ? = ''
              OR o.full_name LIKE ?
              OR o.phone LIKE ?
              OR COALESCE(o.national_id, '') LIKE ?
              OR h.house_no LIKE ?
            )
          GROUP BY o.id, h.id, v.id
          ORDER BY o.updated_at DESC, o.full_name
          LIMIT 300
        `,
        [villageId, villageId, searchText, search, search, search, search],
      );
      return res.json({ data: rows });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/owners/:id", authenticate, async (req, res, next) => {
    try {
      const [rows] = await pool.execute(
        `
          SELECT
            o.id,
            o.full_name AS fullName,
            o.phone,
            o.national_id AS nationalId,
            o.line_user_id AS lineUserId,
            o.consent_at AS consentAt,
            h.house_no AS houseNo,
            h.address_detail AS addressDetail,
            h.latitude,
            h.longitude,
            v.id AS villageId,
            v.village_no AS villageNo,
            v.name_th AS villageName,
            o.created_at AS createdAt,
            o.updated_at AS updatedAt
          FROM owners o
          INNER JOIN households h ON h.id = o.household_id
          INNER JOIN villages v ON v.id = h.village_id
          WHERE o.id = ? AND o.deleted_at IS NULL
          LIMIT 1
        `,
        [req.params.id],
      );
      if (!rows[0]) return res.status(404).json({ message: "ไม่พบข้อมูลเจ้าของสัตว์" });
      return res.json({ data: rows[0] });
    } catch (error) {
      next(error);
    }
  });

  app.patch(
    "/api/admin/owners/:id",
    authenticate,
    requireRole("ADMIN", "OFFICER"),
    async (req, res, next) => {
      try {
        const input = ownerUpdateSchema.parse(req.body);
        const result = await withTransaction(async (db) => {
          await ensureVillageExists(db, input.villageId);
          const [rows] = await db.execute(
            `SELECT id, household_id AS householdId, full_name AS fullName,
                    phone, line_user_id AS lineUserId
             FROM owners WHERE id = ? AND deleted_at IS NULL LIMIT 1 FOR UPDATE`,
            [req.params.id],
          );
          const owner = rows[0];
          if (!owner) throw createHttpError(404, "ไม่พบข้อมูลเจ้าของสัตว์");

          await db.execute(
            `UPDATE households
             SET house_no = ?, village_id = ?, address_detail = NULLIF(?, '')
             WHERE id = ?`,
            [input.houseNo, input.villageId, input.addressDetail, owner.householdId],
          );
          await db.execute(
            `UPDATE owners
             SET full_name = ?, phone = ?, line_user_id = NULLIF(?, '')
             WHERE id = ?`,
            [input.fullName, input.phone, input.lineUserId, req.params.id],
          );
          await db.execute(
            `INSERT INTO audit_logs
              (id, user_id, action, entity_type, entity_id, old_value, new_value, ip_address)
             VALUES (?, ?, 'UPDATE_OWNER', 'OWNER', ?, ?, ?, ?)`,
            [
              crypto.randomUUID(),
              req.user.sub,
              req.params.id,
              JSON.stringify(owner),
              JSON.stringify(input),
              req.ip,
            ],
          );
          return { id: req.params.id, ...input };
        });
        return res.json({ data: result });
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/admin/users",
    authenticate,
    requireRole("ADMIN"),
    async (_req, res, next) => {
      try {
        const [rows] = await pool.query(
          `SELECT id, full_name AS fullName, email, role,
                  is_active AS isActive, last_login_at AS lastLoginAt,
                  created_at AS createdAt
           FROM users ORDER BY is_active DESC, full_name`,
        );
        return res.json({ data: rows });
      } catch (error) {
        next(error);
      }
    },
  );

  app.patch(
    "/api/admin/users/:id",
    authenticate,
    requireRole("ADMIN"),
    async (req, res, next) => {
      try {
        const input = staffUpdateSchema.parse(req.body);
        if (req.params.id === req.user.sub && !input.isActive) {
          throw createHttpError(422, "ไม่สามารถระงับบัญชีที่กำลังใช้งานอยู่");
        }
        const result = await withTransaction(async (db) => {
          const [rows] = await db.execute(
            `SELECT id, role, is_active AS isActive FROM users WHERE id = ? LIMIT 1 FOR UPDATE`,
            [req.params.id],
          );
          if (!rows[0]) throw createHttpError(404, "ไม่พบบัญชีเจ้าหน้าที่");
          await db.execute(
            "UPDATE users SET role = ?, is_active = ? WHERE id = ?",
            [input.role, input.isActive, req.params.id],
          );
          await db.execute(
            `INSERT INTO audit_logs
              (id, user_id, action, entity_type, entity_id, old_value, new_value, ip_address)
             VALUES (?, ?, 'UPDATE_STAFF_ACCESS', 'USER', ?, ?, ?, ?)`,
            [crypto.randomUUID(), req.user.sub, req.params.id, JSON.stringify(rows[0]), JSON.stringify(input), req.ip],
          );
          return { id: req.params.id, ...input };
        });
        return res.json({ data: result });
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/admin/audit-logs",
    authenticate,
    requireRole("ADMIN", "VIEWER"),
    async (req, res, next) => {
      try {
        const entityType = String(req.query.entityType || "").trim();
        const [rows] = await pool.execute(
          `SELECT a.id, a.action, a.entity_type AS entityType,
                  a.entity_id AS entityId, a.ip_address AS ipAddress,
                  a.created_at AS createdAt, u.full_name AS actorName,
                  u.email AS actorEmail
           FROM audit_logs a
           LEFT JOIN users u ON u.id = a.user_id
           WHERE (? = '' OR a.entity_type = ?)
           ORDER BY a.created_at DESC
           LIMIT 500`,
          [entityType, entityType],
        );
        return res.json({ data: rows });
      } catch (error) {
        next(error);
      }
    },
  );

  app.get("/api/admin/system-status", authenticate, async (_req, res, next) => {
    try {
      const [[database], [users], [owners], [audit]] = await Promise.all([
        pool.query("SELECT VERSION() AS version, NOW() AS checkedAt"),
        pool.query("SELECT COUNT(*) AS total, SUM(is_active = 1) AS active FROM users"),
        pool.query("SELECT COUNT(*) AS total FROM owners WHERE deleted_at IS NULL"),
        pool.query("SELECT COUNT(*) AS total FROM audit_logs"),
      ]);
      return res.json({
        data: {
          api: "ready",
          database: "ready",
          databaseVersion: database[0]?.version || null,
          checkedAt: database[0]?.checkedAt || new Date(),
          users: users[0],
          owners: owners[0],
          auditLogs: audit[0],
          line: config.lineConfigured ? "configured" : "waiting",
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

  app.get("/api/admin/registrations/:id", authenticate, async (req, res, next) => {
    try {
      const [rows] = await pool.execute(
        `
          SELECT
            r.id, r.reference_no AS referenceNo, r.status,
            r.review_note AS reviewNote, r.submitted_at AS submittedAt,
            r.reviewed_at AS reviewedAt, reviewer.full_name AS reviewerName,
            o.id AS ownerId, o.full_name AS ownerName, o.phone,
            o.national_id AS nationalId, o.line_user_id AS lineUserId,
            o.consent_at AS consentAt,
            h.house_no AS houseNo, h.address_detail AS addressDetail,
            h.latitude, h.longitude,
            v.id AS villageId, v.village_no AS villageNo, v.name_th AS villageName,
            p.id AS petId, p.registration_no AS registrationNo,
            p.name AS petName, p.species, p.sex, p.breed, p.color,
            p.birth_date AS birthDate, p.photo_path AS photoPath,
            p.status AS petStatus, p.registered_at AS registeredAt
          FROM registrations r
          INNER JOIN owners o ON o.id = r.owner_id
          INNER JOIN households h ON h.id = o.household_id
          INNER JOIN villages v ON v.id = h.village_id
          INNER JOIN pets p ON p.id = r.pet_id
          LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by
          WHERE r.id = ?
          LIMIT 1
        `,
        [req.params.id],
      );
      const registration = rows[0];
      if (!registration) return res.status(404).json({ message: "ไม่พบคำขอขึ้นทะเบียน" });

      const [attachments] = await pool.execute(
        `SELECT id, file_name AS fileName, mime_type AS mimeType,
                file_size AS fileSize, uploaded_at AS uploadedAt
         FROM attachments
         WHERE entity_type = 'REGISTRATION' AND entity_id = ?
         ORDER BY uploaded_at`,
        [req.params.id],
      );

      const proposed = {
        ownerName: registration.ownerName,
        phone: registration.phone,
        nationalId: registration.nationalId,
        houseNo: registration.houseNo,
        villageId: registration.villageId,
        villageNo: registration.villageNo,
        villageName: registration.villageName,
        addressDetail: registration.addressDetail,
        petName: registration.petName,
        species: registration.species,
        sex: registration.sex,
        breed: registration.breed,
        color: registration.color,
        birthDate: registration.birthDate,
      };

      return res.json({
        data: {
          ...registration,
          requestType: "REGISTER_PET",
          current: registration.status === REGISTRATION_STATUS.APPROVED ? proposed : null,
          proposed,
          attachments,
        },
      });
    } catch (error) {
      next(error);
    }
  });

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
                r.status AS oldStatus,
                o.line_user_id AS lineUserId
              FROM registrations r
              INNER JOIN owners o ON o.id = r.owner_id
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

          const allowedStatuses = REGISTRATION_TRANSITIONS[registration.oldStatus] || [];
          if (!allowedStatuses.includes(status)) {
            throw createHttpError(409, "ไม่สามารถเปลี่ยนสถานะคำขอตามลำดับงานนี้ได้");
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
            referenceNo: registration.referenceNo,
            lineUserId: registration.lineUserId,
          };
        });

        const statusText = {
          UNDER_REVIEW: "เจ้าหน้าที่รับตรวจสอบคำขอแล้ว",
          NEED_MORE_INFO: "คำขอต้องแก้ไขหรือเพิ่มข้อมูล",
          APPROVED: "คำขอได้รับอนุมัติแล้ว",
          REJECTED: "คำขอไม่ได้รับอนุมัติ",
        }[result.status] || result.status;
        const notification = await pushLineText(
          result.lineUserId,
          `PRMS-TSM เทศบาลท่าโพธ์\n${statusText}\nเลขที่คำขอ ${result.referenceNo}${note ? `\nหมายเหตุ: ${note}` : ""}`,
        );
        try {
          await pool.execute(
            `INSERT INTO audit_logs
              (id, user_id, action, entity_type, entity_id, new_value, ip_address)
             VALUES (?, ?, ?, 'REGISTRATION', ?, ?, ?)`,
            [
              crypto.randomUUID(),
              req.user.sub,
              `LINE_NOTIFICATION_${notification.status}`,
              result.id,
              JSON.stringify({ status: result.status, httpStatus: notification.httpStatus || null }),
              req.ip,
            ],
          );
        } catch (auditError) {
          console.error("Unable to record LINE notification audit", auditError);
        }

        return res.json({ data: { id: result.id, status: result.status, notification: notification.status } });
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
            p.microchip_no AS microchipNo,
            p.name AS petName,
            p.species,
            p.sex,
            p.breed,
            p.color,
            p.status,
            p.registered_at AS registeredAt,
            o.id AS ownerId,
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

  app.get("/api/admin/pets/:id", authenticate, async (req, res, next) => {
    try {
      const [petRows] = await pool.execute(
        `SELECT p.id, p.registration_no AS registrationNo, p.microchip_no AS microchipNo,
                p.name AS petName, p.species, p.sex, p.breed, p.color,
                p.birth_date AS birthDate, p.status, p.photo_path AS photoPath,
                p.registered_at AS registeredAt,
                o.id AS ownerId, o.full_name AS ownerName, o.phone,
                h.house_no AS houseNo, v.village_no AS villageNo, v.name_th AS villageName
         FROM pets p
         INNER JOIN owners o ON o.id = p.owner_id
         INNER JOIN households h ON h.id = o.household_id
         INNER JOIN villages v ON v.id = h.village_id
         WHERE p.id = ? AND p.deleted_at IS NULL
         LIMIT 1`,
        [req.params.id],
      );
      if (!petRows[0]) return res.status(404).json({ message: "ไม่พบข้อมูลสัตว์" });

      const [statusHistory, ownerHistory, vaccinations, sterilizations] = await Promise.all([
        pool.execute(
          `SELECT history.id, history.old_status AS oldStatus, history.new_status AS newStatus,
                  history.effective_at AS effectiveAt, history.note,
                  users.full_name AS recordedBy
           FROM pet_status_history history
           LEFT JOIN users ON users.id = history.recorded_by
           WHERE history.pet_id = ? ORDER BY history.effective_at DESC, history.created_at DESC`,
          [req.params.id],
        ).then(([rows]) => rows),
        pool.execute(
          `SELECT history.id, previous.full_name AS previousOwner,
                  current.full_name AS newOwner, history.transferred_at AS transferredAt,
                  history.reason, users.full_name AS recordedBy
           FROM pet_owner_history history
           LEFT JOIN owners previous ON previous.id = history.previous_owner_id
           INNER JOIN owners current ON current.id = history.new_owner_id
           LEFT JOIN users ON users.id = history.recorded_by
           WHERE history.pet_id = ? ORDER BY history.transferred_at DESC, history.created_at DESC`,
          [req.params.id],
        ).then(([rows]) => rows),
        pool.execute(
          `SELECT id, vaccine_name AS vaccineName, lot_no AS lotNo,
                  vaccinated_at AS vaccinatedAt, next_due_at AS nextDueAt,
                  provider_name AS providerName
           FROM vaccination_records WHERE pet_id = ? ORDER BY vaccinated_at DESC`,
          [req.params.id],
        ).then(([rows]) => rows),
        pool.execute(
          `SELECT id, sterilized_at AS sterilizedAt, provider_name AS providerName, note
           FROM sterilization_records WHERE pet_id = ? ORDER BY sterilized_at DESC`,
          [req.params.id],
        ).then(([rows]) => rows),
      ]);

      return res.json({ data: { ...petRows[0], statusHistory, ownerHistory, vaccinations, sterilizations } });
    } catch (error) {
      next(error);
    }
  });

  app.patch(
    "/api/admin/pets/:id/status",
    authenticate,
    requireRole("ADMIN", "OFFICER"),
    async (req, res, next) => {
      try {
        const input = petStatusUpdateSchema.parse(req.body);
        const data = await withTransaction(async (db) => {
          const [rows] = await db.execute(
            "SELECT id, status FROM pets WHERE id = ? AND deleted_at IS NULL LIMIT 1 FOR UPDATE",
            [req.params.id],
          );
          const pet = rows[0];
          if (!pet) throw createHttpError(404, "ไม่พบข้อมูลสัตว์");
          if (pet.status === input.status) throw createHttpError(409, "สัตว์มีสถานะนี้อยู่แล้ว");

          await db.execute("UPDATE pets SET status = ? WHERE id = ?", [input.status, req.params.id]);
          await db.execute(
            `INSERT INTO pet_status_history
              (id, pet_id, old_status, new_status, effective_at, note, recorded_by)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [crypto.randomUUID(), req.params.id, pet.status, input.status, input.effectiveAt, input.note, req.user.sub],
          );
          await db.execute(
            `INSERT INTO audit_logs
              (id, user_id, action, entity_type, entity_id, old_value, new_value, ip_address)
             VALUES (?, ?, 'UPDATE_PET_STATUS', 'PET', ?, ?, ?, ?)`,
            [crypto.randomUUID(), req.user.sub, req.params.id, JSON.stringify({ status: pet.status }), JSON.stringify(input), req.ip],
          );
          return { id: req.params.id, ...input };
        });
        return res.json({ data });
      } catch (error) {
        next(error);
      }
    },
  );

  app.patch(
    "/api/admin/pets/:id/owner",
    authenticate,
    requireRole("ADMIN", "OFFICER"),
    async (req, res, next) => {
      try {
        const input = petOwnerTransferSchema.parse(req.body);
        const data = await withTransaction(async (db) => {
          const [petRows] = await db.execute(
            "SELECT id, owner_id AS ownerId, status FROM pets WHERE id = ? AND deleted_at IS NULL LIMIT 1 FOR UPDATE",
            [req.params.id],
          );
          const pet = petRows[0];
          if (!pet) throw createHttpError(404, "ไม่พบข้อมูลสัตว์");
          if (pet.ownerId === input.ownerId) throw createHttpError(409, "เจ้าของใหม่ต้องไม่ใช่เจ้าของปัจจุบัน");
          const [ownerRows] = await db.execute(
            "SELECT id FROM owners WHERE id = ? AND deleted_at IS NULL LIMIT 1",
            [input.ownerId],
          );
          if (!ownerRows[0]) throw createHttpError(404, "ไม่พบเจ้าของใหม่ในทะเบียน");

          await db.execute("UPDATE pets SET owner_id = ?, status = 'ACTIVE' WHERE id = ?", [input.ownerId, req.params.id]);
          await db.execute(
            `INSERT INTO pet_owner_history
              (id, pet_id, previous_owner_id, new_owner_id, transferred_at, reason, recorded_by)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [crypto.randomUUID(), req.params.id, pet.ownerId, input.ownerId, input.transferredAt, input.reason, req.user.sub],
          );
          if (pet.status !== "ACTIVE") {
            await db.execute(
              `INSERT INTO pet_status_history
                (id, pet_id, old_status, new_status, effective_at, note, recorded_by)
               VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?)`,
              [crypto.randomUUID(), req.params.id, pet.status, input.transferredAt, `กลับเป็นสถานะปกติหลังโอนเจ้าของ: ${input.reason}`, req.user.sub],
            );
          }
          await db.execute(
            `INSERT INTO audit_logs
              (id, user_id, action, entity_type, entity_id, old_value, new_value, ip_address)
             VALUES (?, ?, 'TRANSFER_PET_OWNER', 'PET', ?, ?, ?, ?)`,
            [crypto.randomUUID(), req.user.sub, req.params.id, JSON.stringify({ ownerId: pet.ownerId }), JSON.stringify(input), req.ip],
          );
          return { id: req.params.id, ...input };
        });
        return res.json({ data });
      } catch (error) {
        next(error);
      }
    },
  );

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
        const input = vaccinationRecordSchema.parse(req.body);

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

  app.patch(
    "/api/admin/vaccinations/:id",
    authenticate,
    requireRole("ADMIN", "OFFICER"),
    async (req, res, next) => {
      try {
        const input = vaccinationRecordSchema.parse(req.body);
        const data = await withTransaction(async (db) => {
          const [rows] = await db.execute(
            `SELECT id, pet_id AS petId, vaccine_name AS vaccineName, lot_no AS lotNo,
                    vaccinated_at AS vaccinatedAt, next_due_at AS nextDueAt,
                    provider_name AS providerName
             FROM vaccination_records WHERE id = ? LIMIT 1 FOR UPDATE`,
            [req.params.id],
          );
          if (!rows[0]) throw createHttpError(404, "ไม่พบประวัติวัคซีน");
          await db.execute(
            `UPDATE vaccination_records
             SET vaccine_name = ?, lot_no = NULLIF(?, ''), vaccinated_at = ?,
                 next_due_at = NULLIF(?, ''), provider_name = NULLIF(?, ''), recorded_by = ?
             WHERE id = ?`,
            [input.vaccineName, input.lotNo, input.vaccinatedAt, input.nextDueAt || "", input.providerName, req.user.sub, req.params.id],
          );
          await db.execute(
            `INSERT INTO audit_logs
              (id, user_id, action, entity_type, entity_id, old_value, new_value, ip_address)
             VALUES (?, ?, 'UPDATE_VACCINATION', 'PET', ?, ?, ?, ?)`,
            [crypto.randomUUID(), req.user.sub, rows[0].petId, JSON.stringify(rows[0]), JSON.stringify(input), req.ip],
          );
          return { id: req.params.id, ...input };
        });
        return res.json({ data });
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
        const input = sterilizationRecordSchema.parse(req.body);

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

  app.patch(
    "/api/admin/sterilizations/:id",
    authenticate,
    requireRole("ADMIN", "OFFICER"),
    async (req, res, next) => {
      try {
        const input = sterilizationRecordSchema.parse(req.body);
        const data = await withTransaction(async (db) => {
          const [rows] = await db.execute(
            `SELECT id, pet_id AS petId, sterilized_at AS sterilizedAt,
                    provider_name AS providerName, note
             FROM sterilization_records WHERE id = ? LIMIT 1 FOR UPDATE`,
            [req.params.id],
          );
          if (!rows[0]) throw createHttpError(404, "ไม่พบประวัติการทำหมัน");
          await db.execute(
            `UPDATE sterilization_records
             SET sterilized_at = ?, provider_name = NULLIF(?, ''), note = NULLIF(?, ''), recorded_by = ?
             WHERE id = ?`,
            [input.sterilizedAt, input.providerName, input.note, req.user.sub, req.params.id],
          );
          await db.execute(
            `INSERT INTO audit_logs
              (id, user_id, action, entity_type, entity_id, old_value, new_value, ip_address)
             VALUES (?, ?, 'UPDATE_STERILIZATION', 'PET', ?, ?, ?, ?)`,
            [crypto.randomUUID(), req.user.sub, rows[0].petId, JSON.stringify(rows[0]), JSON.stringify(input), req.ip],
          );
          return { id: req.params.id, ...input };
        });
        return res.json({ data });
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
              COUNT(DISTINCT CASE WHEN p.species = 'DOG' THEN p.id END) AS dogs,
              COUNT(DISTINCT CASE WHEN p.species = 'CAT' THEN p.id END) AS cats,
              COUNT(DISTINCT CASE WHEN vr.pet_id IS NOT NULL THEN p.id END) AS vaccinated,
              COUNT(DISTINCT CASE WHEN sr.pet_id IS NOT NULL THEN p.id END) AS sterilized,
              (
                SELECT COUNT(*)
                FROM registrations pending_registration
                INNER JOIN owners pending_owner
                  ON pending_owner.id = pending_registration.owner_id
                 AND pending_owner.deleted_at IS NULL
                INNER JOIN households pending_household
                  ON pending_household.id = pending_owner.household_id
                 AND pending_household.deleted_at IS NULL
                WHERE pending_household.village_id = v.id
                  AND pending_registration.status IN (
                    'SUBMITTED',
                    'UNDER_REVIEW',
                    'NEED_MORE_INFO'
                  )
              ) AS pending,
              (
                SELECT COUNT(*)
                FROM cases village_case
                WHERE village_case.village_id = v.id
                  AND village_case.status NOT IN ('RESOLVED', 'CLOSED')
              ) AS openCases
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
            LEFT JOIN (
              SELECT DISTINCT pet_id
              FROM vaccination_records
              WHERE vaccinated_at >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)
            ) vr
              ON vr.pet_id = p.id
            LEFT JOIN (
              SELECT DISTINCT pet_id
              FROM sterilization_records
            ) sr
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
