import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { ORGANIZATION, REGISTRATION_STATUS, validatePetRegistration } from "@prms/shared";
import { config } from "./config.js";
import { pool, withTransaction } from "./db.js";
import { authenticate, errorHandler, requireRole } from "./middleware.js";

const registrationSchema = z.object({
  ownerName: z.string().trim().min(2).max(150),
  nationalId: z.string().regex(/^\d{13}$/).optional().or(z.literal("")),
  phone: z.string().regex(/^0\d{9}$/),
  houseNo: z.string().trim().min(1).max(30),
  villageId: z.coerce.number().int().positive(),
  addressDetail: z.string().max(255).optional().default(""),
  petName: z.string().trim().min(1).max(100),
  species: z.enum(["DOG", "CAT"]),
  sex: z.enum(["MALE", "FEMALE", "UNKNOWN"]).default("UNKNOWN"),
  breed: z.string().max(100).optional().default("ไม่ระบุ"),
  color: z.string().max(100).optional().default("ไม่ระบุ"),
  birthDate: z.string().date().optional().or(z.literal("")),
});

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: config.origins, credentials: true }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", async (_req, res) => {
    let database = "unavailable";
    try { await pool.query("SELECT 1"); database = "ready"; } catch { /* health remains available */ }
    res.json({ service: ORGANIZATION.productName, organization: ORGANIZATION.shortName, status: "ok", database });
  });

  app.get("/api/public/villages", async (_req, res, next) => {
    try {
      const [rows] = await pool.query("SELECT id, village_no AS villageNo, name_th AS name FROM villages WHERE is_active = 1 ORDER BY village_no");
      res.json({ data: rows });
    } catch (error) { next(error); }
  });

  app.post("/api/public/registrations", async (req, res, next) => {
    try {
      const basic = validatePetRegistration(req.body);
      if (!basic.valid) return res.status(422).json({ message: "ข้อมูลไม่ครบถ้วน", errors: basic.errors });
      const input = registrationSchema.parse(req.body);
      const registrationId = crypto.randomUUID();
      const ownerId = crypto.randomUUID();
      const householdId = crypto.randomUUID();
      const petId = crypto.randomUUID();
      const referenceNo = `TSM-${new Date().getFullYear() + 543}-${crypto.randomInt(100000, 999999)}`;

      await withTransaction(async (db) => {
        await db.execute("INSERT INTO households (id, house_no, village_id, address_detail) VALUES (?, ?, ?, ?)", [householdId, input.houseNo, input.villageId, input.addressDetail]);
        await db.execute("INSERT INTO owners (id, household_id, full_name, national_id, phone) VALUES (?, ?, ?, NULLIF(?, ''), ?)", [ownerId, householdId, input.ownerName, input.nationalId || "", input.phone]);
        await db.execute("INSERT INTO pets (id, owner_id, name, species, sex, breed, color, birth_date) VALUES (?, ?, ?, ?, ?, ?, ?, NULLIF(?, ''))", [petId, ownerId, input.petName, input.species, input.sex, input.breed, input.color, input.birthDate || ""]);
        await db.execute("INSERT INTO registrations (id, reference_no, owner_id, pet_id, status, submitted_at) VALUES (?, ?, ?, ?, ?, NOW())", [registrationId, referenceNo, ownerId, petId, REGISTRATION_STATUS.SUBMITTED]);
      });
      res.status(201).json({ data: { id: registrationId, referenceNo, status: REGISTRATION_STATUS.SUBMITTED } });
    } catch (error) { next(error); }
  });

  app.get("/api/public/registrations/:referenceNo", async (req, res, next) => {
    try {
      const [rows] = await pool.execute("SELECT reference_no AS referenceNo, status, submitted_at AS submittedAt, reviewed_at AS reviewedAt FROM registrations WHERE reference_no = ?", [req.params.referenceNo]);
      if (!rows[0]) return res.status(404).json({ message: "ไม่พบเลขที่คำขอ" });
      res.json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.post("/api/auth/login", async (req, res, next) => {
    try {
      const { email, password } = z.object({ email: z.string().email(), password: z.string().min(8) }).parse(req.body);
      const [rows] = await pool.execute("SELECT id, full_name, email, password_hash, role FROM users WHERE email = ? AND is_active = 1", [email]);
      const user = rows[0];
      if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" });
      const token = jwt.sign({ sub: user.id, name: user.full_name, role: user.role }, config.jwtSecret, { expiresIn: "8h" });
      res.json({ data: { token, user: { id: user.id, name: user.full_name, email: user.email, role: user.role } } });
    } catch (error) { next(error); }
  });

  app.post("/api/auth/dev-login", async (_req, res, next) => {
    if (config.nodeEnv === "production") return res.status(404).json({ message: "ไม่พบหน้าที่ร้องขอ" });
    try {
      const [rows] = await pool.query("SELECT id, full_name, email, role FROM users WHERE is_active = 1 AND role = 'ADMIN' ORDER BY created_at LIMIT 1");
      const user = rows[0];
      if (!user) return res.status(503).json({ message: "ยังไม่มีบัญชีผู้ดูแลระบบ" });
      const token = jwt.sign({ sub:user.id, name:user.full_name, role:user.role }, config.jwtSecret, { expiresIn:"8h" });
      res.json({ data:{ token, user:{ id:user.id, name:user.full_name, email:user.email, role:user.role }, developmentMode:true } });
    } catch (error) { next(error); }
  });

  app.get("/api/admin/dashboard", authenticate, async (_req, res, next) => {
    try {
      const [[pets], [pending], [services], [cases]] = await Promise.all([
        pool.query(`SELECT COUNT(*) total, SUM(p.species='DOG') dogs, SUM(p.species='CAT') cats FROM pets p
          WHERE p.deleted_at IS NULL AND EXISTS(SELECT 1 FROM registrations r WHERE r.pet_id=p.id AND r.status='APPROVED')`),
        pool.query("SELECT COUNT(*) pending FROM registrations WHERE status IN ('SUBMITTED','UNDER_REVIEW','NEED_MORE_INFO')"),
        pool.query("SELECT (SELECT COUNT(*) FROM vaccination_records WHERE vaccinated_at >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)) vaccinations, (SELECT COUNT(*) FROM sterilization_records) sterilizations"),
        pool.query("SELECT COUNT(*) openCases FROM cases WHERE status NOT IN ('RESOLVED','CLOSED')"),
      ]);
      res.json({ data: { ...pets[0], ...pending[0], ...services[0], ...cases[0] } });
    } catch (error) { next(error); }
  });

  app.get("/api/admin/registrations", authenticate, async (req, res, next) => {
    try {
      const status = req.query.status || null;
      const [rows] = await pool.execute(`SELECT r.id, r.reference_no referenceNo, r.status, r.submitted_at submittedAt,
        o.full_name ownerName, p.name petName, p.species, v.village_no villageNo
        FROM registrations r JOIN owners o ON o.id=r.owner_id JOIN pets p ON p.id=r.pet_id
        JOIN households h ON h.id=o.household_id JOIN villages v ON v.id=h.village_id
        WHERE (? IS NULL OR r.status=?) ORDER BY r.submitted_at DESC LIMIT 200`, [status, status]);
      res.json({ data: rows });
    } catch (error) { next(error); }
  });

  app.patch("/api/admin/registrations/:id/status", authenticate, requireRole("ADMIN", "OFFICER"), async (req, res, next) => {
    try {
      const { status, note = "" } = z.object({ status: z.enum(Object.values(REGISTRATION_STATUS)), note: z.string().max(500).optional() }).parse(req.body);
      await withTransaction(async (db) => {
        await db.execute("UPDATE registrations SET status=?, review_note=?, reviewed_by=?, reviewed_at=NOW() WHERE id=?", [status, note, req.user.sub, req.params.id]);
        if (status === REGISTRATION_STATUS.APPROVED) {
          await db.execute(`UPDATE pets p JOIN registrations r ON r.pet_id=p.id
            SET p.registration_no=COALESCE(p.registration_no, CONCAT('PET-', RIGHT(r.reference_no, 6)))
            WHERE r.id=?`, [req.params.id]);
        }
        await db.execute("INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, new_value) VALUES (?, ?, 'UPDATE_STATUS', 'REGISTRATION', ?, JSON_OBJECT('status', ?))", [crypto.randomUUID(), req.user.sub, req.params.id, status]);
      });
      res.json({ data: { id: req.params.id, status } });
    } catch (error) { next(error); }
  });

  app.get("/api/admin/pets", authenticate, async (req, res, next) => {
    try {
      const search = `%${String(req.query.search || "").trim()}%`;
      const species = req.query.species || null;
      const [rows] = await pool.execute(`SELECT p.id, p.registration_no registrationNo, p.name petName,
        p.species, p.sex, p.breed, p.color, p.status, o.full_name ownerName, o.phone,
        h.house_no houseNo, v.village_no villageNo,
        (SELECT MAX(vr.vaccinated_at) FROM vaccination_records vr WHERE vr.pet_id=p.id) lastVaccinatedAt,
        EXISTS(SELECT 1 FROM sterilization_records sr WHERE sr.pet_id=p.id) sterilized
        FROM pets p JOIN owners o ON o.id=p.owner_id JOIN households h ON h.id=o.household_id
        JOIN villages v ON v.id=h.village_id
        WHERE p.deleted_at IS NULL AND EXISTS(SELECT 1 FROM registrations ar WHERE ar.pet_id=p.id AND ar.status='APPROVED')
          AND (? IS NULL OR p.species=?)
          AND (p.name LIKE ? OR o.full_name LIKE ? OR o.phone LIKE ? OR COALESCE(p.registration_no,'') LIKE ?)
        ORDER BY p.created_at DESC LIMIT 300`, [species, species, search, search, search, search]);
      res.json({ data: rows });
    } catch (error) { next(error); }
  });

  app.get("/api/admin/map", authenticate, async (_req, res, next) => {
    try {
      const [rows] = await pool.query(`SELECT p.id,p.name petName,p.species,o.full_name ownerName,
        h.house_no houseNo,v.village_no villageNo,h.latitude,h.longitude,
        EXISTS(SELECT 1 FROM vaccination_records vr WHERE vr.pet_id=p.id AND vr.vaccinated_at>=DATE_SUB(CURDATE(),INTERVAL 1 YEAR)) vaccinated,
        EXISTS(SELECT 1 FROM sterilization_records sr WHERE sr.pet_id=p.id) sterilized
        FROM pets p JOIN registrations r ON r.pet_id=p.id AND r.status='APPROVED'
        JOIN owners o ON o.id=p.owner_id JOIN households h ON h.id=o.household_id JOIN villages v ON v.id=h.village_id
        WHERE p.deleted_at IS NULL ORDER BY v.village_no,p.name`);
      res.json({ data:rows });
    } catch (error) { next(error); }
  });

  app.post("/api/admin/pets/:petId/vaccinations", authenticate, requireRole("ADMIN", "OFFICER"), async (req, res, next) => {
    try {
      const input = z.object({ vaccineName:z.string().trim().min(2).max(150), vaccinatedAt:z.string().date(), nextDueAt:z.string().date().optional().or(z.literal("")), lotNo:z.string().max(100).optional().default(""), providerName:z.string().max(150).optional().default("") }).parse(req.body);
      const id = crypto.randomUUID();
      await withTransaction(async (db) => {
        await db.execute("INSERT INTO vaccination_records (id, pet_id, vaccine_name, lot_no, vaccinated_at, next_due_at, provider_name, recorded_by) VALUES (?, ?, ?, NULLIF(?,''), ?, NULLIF(?,''), NULLIF(?,''), ?)", [id, req.params.petId, input.vaccineName, input.lotNo, input.vaccinatedAt, input.nextDueAt || "", input.providerName, req.user.sub]);
        await db.execute("INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,new_value) VALUES (?,?,'ADD_VACCINATION','PET',?,JSON_OBJECT('vaccinatedAt',?))", [crypto.randomUUID(), req.user.sub, req.params.petId, input.vaccinatedAt]);
      });
      res.status(201).json({ data:{ id } });
    } catch (error) { next(error); }
  });

  app.post("/api/admin/pets/:petId/sterilizations", authenticate, requireRole("ADMIN", "OFFICER"), async (req, res, next) => {
    try {
      const input = z.object({ sterilizedAt:z.string().date(), providerName:z.string().max(150).optional().default(""), note:z.string().max(500).optional().default("") }).parse(req.body);
      const id = crypto.randomUUID();
      await withTransaction(async (db) => {
        await db.execute(`INSERT INTO sterilization_records (id,pet_id,sterilized_at,provider_name,note,recorded_by)
          VALUES (?,?,?,NULLIF(?,''),NULLIF(?,''),?) ON DUPLICATE KEY UPDATE sterilized_at=VALUES(sterilized_at),provider_name=VALUES(provider_name),note=VALUES(note),recorded_by=VALUES(recorded_by)`, [id, req.params.petId, input.sterilizedAt, input.providerName, input.note, req.user.sub]);
        await db.execute("INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,new_value) VALUES (?,?,'RECORD_STERILIZATION','PET',?,JSON_OBJECT('sterilizedAt',?))", [crypto.randomUUID(), req.user.sub, req.params.petId, input.sterilizedAt]);
      });
      res.status(201).json({ data:{ id } });
    } catch (error) { next(error); }
  });

  app.get("/api/admin/cases", authenticate, async (req, res, next) => {
    try {
      const [rows] = await pool.query(`SELECT c.id,c.reference_no referenceNo,c.reporter_name reporterName,c.reporter_phone reporterPhone,
        c.category,c.description,c.status,c.created_at createdAt,v.village_no villageNo,u.full_name assignedTo
        FROM cases c JOIN villages v ON v.id=c.village_id LEFT JOIN users u ON u.id=c.assigned_to
        ORDER BY FIELD(c.status,'RECEIVED','ASSIGNED','IN_PROGRESS','RESOLVED','CLOSED'),c.created_at DESC LIMIT 300`);
      res.json({ data:rows });
    } catch (error) { next(error); }
  });

  app.patch("/api/admin/cases/:id/status", authenticate, requireRole("ADMIN", "OFFICER"), async (req, res, next) => {
    try {
      const { status } = z.object({ status:z.enum(["RECEIVED","ASSIGNED","IN_PROGRESS","RESOLVED","CLOSED"]) }).parse(req.body);
      await withTransaction(async (db) => {
        await db.execute("UPDATE cases SET status=?,assigned_to=COALESCE(assigned_to,?),resolved_at=IF(? IN ('RESOLVED','CLOSED'),NOW(),NULL) WHERE id=?", [status,req.user.sub,status,req.params.id]);
        await db.execute("INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,new_value) VALUES (?,?,'UPDATE_STATUS','CASE',?,JSON_OBJECT('status',?))", [crypto.randomUUID(),req.user.sub,req.params.id,status]);
      });
      res.json({ data:{ id:req.params.id,status } });
    } catch (error) { next(error); }
  });

  app.get("/api/admin/reports/villages", authenticate, async (_req, res, next) => {
    try {
      const [rows] = await pool.query(`SELECT v.village_no villageNo,v.name_th villageName,
        COUNT(DISTINCT p.id) totalPets,SUM(p.species='DOG') dogs,SUM(p.species='CAT') cats,
        COUNT(DISTINCT CASE WHEN vr.id IS NOT NULL THEN p.id END) vaccinated,
        COUNT(DISTINCT sr.pet_id) sterilized
        FROM villages v LEFT JOIN households h ON h.village_id=v.id LEFT JOIN owners o ON o.household_id=h.id
        LEFT JOIN pets p ON p.owner_id=o.id AND p.deleted_at IS NULL
          AND EXISTS(SELECT 1 FROM registrations ar WHERE ar.pet_id=p.id AND ar.status='APPROVED')
        LEFT JOIN vaccination_records vr ON vr.pet_id=p.id AND vr.vaccinated_at>=DATE_SUB(CURDATE(),INTERVAL 1 YEAR)
        LEFT JOIN sterilization_records sr ON sr.pet_id=p.id
        GROUP BY v.id,v.village_no,v.name_th ORDER BY v.village_no`);
      res.json({ data:rows });
    } catch (error) { next(error); }
  });

  app.use(errorHandler);
  return app;
}
