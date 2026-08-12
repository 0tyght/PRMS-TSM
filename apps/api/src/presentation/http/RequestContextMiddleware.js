import crypto from "node:crypto";

export class RequestContextMiddleware {
  constructor({ logger = console } = {}) { this.logger = logger; this.handle = this.handle.bind(this); }

  handle(req, res, next) {
    const incoming = String(req.headers["x-request-id"] || "").trim();
    const requestId = /^[A-Za-z0-9._:-]{8,100}$/.test(incoming) ? incoming : crypto.randomUUID();
    const startedAt = process.hrtime.bigint();
    req.requestId = requestId;
    res.setHeader("X-Request-Id", requestId);
    res.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      this.logger.info(JSON.stringify({ level: "info", event: "http_request", requestId, method: req.method, path: req.originalUrl?.split("?")[0] || req.path, status: res.statusCode, durationMs: Number(durationMs.toFixed(1)), userId: req.user?.sub || null }));
    });
    next();
  }
}

