import jwt from "jsonwebtoken";

const STAFF_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export function verifyAuthenticatedToken(
  token,
  jwtSecret,
  { now = Date.now(), staffSessionMaxAgeMs = STAFF_SESSION_MAX_AGE_MS } = {},
) {
  try {
    return jwt.verify(token, jwtSecret);
  } catch (error) {
    if (error?.name !== "TokenExpiredError") throw error;

    const payload = jwt.verify(token, jwtSecret, { ignoreExpiration: true });
    const issuedAt = Number(payload?.iat || 0) * 1000;
    const ageMs = now - issuedAt;

    if (
      !payload?.staffSession ||
      !Number.isFinite(ageMs) ||
      issuedAt <= 0 ||
      ageMs < -60_000 ||
      ageMs > staffSessionMaxAgeMs
    ) {
      throw error;
    }

    return payload;
  }
}

export class AuthMiddleware {
  constructor({ database, jwtSecret }) {
    this.database = database;
    this.jwtSecret = jwtSecret;
    this.authenticate = this.authenticate.bind(this);
  }

  async authenticate(req, res, next) {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!token) return res.status(401).json({ message: "กรุณาเข้าสู่ระบบ" });

    let payload;
    try {
      payload = verifyAuthenticatedToken(token, this.jwtSecret);
    } catch {
      return res.status(401).json({ message: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" });
    }

    if (!payload.staffSession) {
      req.user = payload;
      return next();
    }

    try {
      const [rows] = await this.database.execute(
        "SELECT id, full_name, email, role, scope_village_id AS villageId FROM users WHERE id = ? AND is_active = 1 LIMIT 1",
        [payload.sub],
      );
      const account = rows[0];
      if (!account) {
        return res.status(401).json({ message: "บัญชีถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ" });
      }

      req.user = {
        ...payload,
        sub: account.id,
        name: account.full_name,
        email: account.email,
        role: account.role,
        villageId: account.villageId || null,
      };
      return next();
    } catch (error) {
      return next(error);
    }
  }

  requireRole(...roles) {
    return (req, res, next) =>
      roles.includes(req.user?.role)
        ? next()
        : res.status(403).json({ message: "ไม่มีสิทธิ์ดำเนินการ" });
  }
}
