import jwt from "jsonwebtoken";
import { ZodError } from "zod";
import { config } from "./config.js";

export function authenticate(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");

  if (!token) {
    return res.status(401).json({ message: "กรุณาเข้าสู่ระบบ" });
  }

  try {
    req.user = jwt.verify(token, config.jwtSecret);
    return next();
  } catch {
    return res
      .status(401)
      .json({ message: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (roles.includes(req.user?.role)) {
      return next();
    }

    return res.status(403).json({ message: "ไม่มีสิทธิ์ดำเนินการ" });
  };
}

function formatValidationErrors(error) {
  return error.issues.reduce((result, issue) => {
    const field = issue.path.join(".") || "form";

    if (!result[field]) {
      result[field] = issue.message;
    }

    return result;
  }, {});
}

export function errorHandler(error, _req, res, _next) {
  console.error(error);

  if (error instanceof ZodError) {
    return res.status(422).json({
      message: "ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง",
      errors: formatValidationErrors(error),
    });
  }

  if (error.code === "ER_DUP_ENTRY") {
    return res.status(409).json({
      message: "ข้อมูลนี้มีอยู่ในระบบแล้ว",
    });
  }

  if (
    error.code === "ER_NO_REFERENCED_ROW_2" ||
    error.code === "ER_ROW_IS_REFERENCED_2"
  ) {
    return res.status(422).json({
      message: "ไม่สามารถบันทึกข้อมูลได้ เนื่องจากข้อมูลที่เกี่ยวข้องไม่ถูกต้อง",
    });
  }

  return res.status(error.status || 500).json({
    message: error.expose
      ? error.message
      : "ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง",
  });
}