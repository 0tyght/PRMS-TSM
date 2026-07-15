import jwt from "jsonwebtoken";
import { config } from "./config.js";

export function authenticate(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ message: "กรุณาเข้าสู่ระบบ" });
  try {
    req.user = jwt.verify(token, config.jwtSecret);
    next();
  } catch {
    res.status(401).json({ message: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => roles.includes(req.user?.role)
    ? next()
    : res.status(403).json({ message: "ไม่มีสิทธิ์ดำเนินการ" });
}

export function errorHandler(error, _req, res, _next) {
  console.error(error);
  if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "ข้อมูลนี้มีอยู่ในระบบแล้ว" });
  res.status(error.status || 500).json({ message: error.expose ? error.message : "ระบบขัดข้อง กรุณาลองใหม่" });
}
