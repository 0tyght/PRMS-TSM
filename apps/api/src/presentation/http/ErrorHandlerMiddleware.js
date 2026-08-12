import { ZodError } from "zod";

export class ErrorHandlerMiddleware {
  constructor({ logger = console } = {}) { this.logger = logger; this.handle = this.handle.bind(this); }

  formatValidationErrors(error) {
    return error.issues.reduce((result, issue) => {
      const field = issue.path.join(".") || "form";
      if (!result[field]) result[field] = issue.message;
      return result;
    }, {});
  }

  handle(error, req, res, _next) {
    this.logger.error(JSON.stringify({ level: "error", event: "request_error", requestId: req.requestId || null, method: req.method, path: req.originalUrl?.split("?")[0] || req.path, code: error.code || null, name: error.name, message: error.expose || error instanceof ZodError ? error.message : "Internal server error" }));
    if (error instanceof ZodError) return res.status(422).json({ message: "ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง", errors: this.formatValidationErrors(error), requestId: req.requestId });
    if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "ข้อมูลนี้มีอยู่ในระบบแล้ว", requestId: req.requestId });
    if (["ER_NO_REFERENCED_ROW_2", "ER_ROW_IS_REFERENCED_2"].includes(error.code)) return res.status(422).json({ message: "ไม่สามารถบันทึกข้อมูลได้ เนื่องจากข้อมูลที่เกี่ยวข้องไม่ถูกต้อง", requestId: req.requestId });
    return res.status(error.status || 500).json({ message: error.expose || error.name === "DomainRuleViolation" ? error.message : "ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง", requestId: req.requestId });
  }
}

