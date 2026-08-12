import { config } from "./config.js";
import { pool } from "./db.js";
import { AuthMiddleware } from "../presentation/http/AuthMiddleware.js";
import { ErrorHandlerMiddleware } from "../presentation/http/ErrorHandlerMiddleware.js";
import { RequestContextMiddleware } from "../presentation/http/RequestContextMiddleware.js";

export const authMiddleware = new AuthMiddleware({ database: pool, jwtSecret: config.jwtSecret });
export const requestContextMiddleware = new RequestContextMiddleware();
export const errorHandlerMiddleware = new ErrorHandlerMiddleware();

export async function authenticate(req, res, next) {
  return authMiddleware.authenticate(req, res, next);
}

export function requireRole(...roles) {
  return authMiddleware.requireRole(...roles);
}

export function requestContext(req, res, next) {
  return requestContextMiddleware.handle(req, res, next);
}

export function errorHandler(error, req, res, _next) {
  return errorHandlerMiddleware.handle(error, req, res, _next);
}
