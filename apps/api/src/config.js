import "dotenv/config";

export const config = Object.freeze({
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 4100),
  jwtSecret: process.env.JWT_SECRET || "development-only-change-me",
  origins: [
    process.env.ADMIN_WEB_ORIGIN || "http://localhost:5173",
    process.env.CITIZEN_WEB_ORIGIN || "http://localhost:5174",
  ],
  db: {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "prms_tsm",
  },
});
