import crypto from "node:crypto";
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

export function requestContext(req, res, next) {
  const incoming = String(req.headers["x-request-id"] || "").trim();
  const requestId = /^[A-Za-z0-9._:-]{8,100}$/.test(incoming) ? incoming : crypto.randomUUID();
  const startedAt = process.hrtime.bigint();
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    console.info(JSON.stringify({
      level: "info",
      event: "http_request",
      requestId,
      method: req.method,
      path: req.originalUrl?.split("?")[0] || req.path,
      status: res.statusCode,
      durationMs: Number(durationMs.toFixed(1)),
      userId: req.user?.sub || null,
    }));
  });
  next();
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

export function errorHandler(error, req, res, _next) {
  console.error(JSON.stringify({
    level: "error",
    event: "request_error",
    requestId: req.requestId || null,
    method: req.method,
    path: req.originalUrl?.split("?")[0] || req.path,
    code: error.code || null,
    name: error.name,
    message: error.expose || error instanceof ZodError ? error.message : "Internal server error",
  }));

  if (error instanceof ZodError) {
    return res.status(422).json({
      message: "ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง",
      errors: formatValidationErrors(error),
      requestId: req.requestId,
    });
  }

  if (error.code === "ER_DUP_ENTRY") {
    return res.status(409).json({
      message: "ข้อมูลนี้มีอยู่ในระบบแล้ว",
      requestId: req.requestId,
    });
  }

  if (
    error.code === "ER_NO_REFERENCED_ROW_2" ||
    error.code === "ER_ROW_IS_REFERENCED_2"
  ) {
    return res.status(422).json({
      message: "ไม่สามารถบันทึกข้อมูลได้ เนื่องจากข้อมูลที่เกี่ยวข้องไม่ถูกต้อง",
      requestId: req.requestId,
    });
  }

  return res.status(error.status || 500).json({
    message: error.expose
      ? error.message
      : "ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง",
    requestId: req.requestId,
  });
}
