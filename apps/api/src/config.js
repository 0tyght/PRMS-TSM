import "dotenv/config";

const DEVELOPMENT_SECRET = "development-only-change-me";

function readText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function readPort(value, fallback, variableName) {
  const port = Number(value || fallback);

  if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new Error(
      `${variableName} ต้องเป็นหมายเลขพอร์ตระหว่าง 1 ถึง 65535`,
    );
  }

  return port;
}

function normalizeOrigin(value) {
  const origin = readText(value);

  if (!origin) {
    return "";
  }

  return origin.replace(/\/+$/, "");
}

function validateProductionSecret(nodeEnv, jwtSecret) {
  if (nodeEnv !== "production") {
    return;
  }

  if (!jwtSecret) {
    throw new Error(
      "ไม่พบ JWT_SECRET ในไฟล์ .env สำหรับ Production",
    );
  }

  if (jwtSecret.length < 32) {
    throw new Error(
      "JWT_SECRET สำหรับ Production ต้องมีความยาวอย่างน้อย 32 ตัวอักษร",
    );
  }

  const weakSecrets = new Set([
    DEVELOPMENT_SECRET,
    "change-this-to-a-long-random-secret",
    "change-me",
    "secret",
    "password",
  ]);

  if (weakSecrets.has(jwtSecret.toLowerCase())) {
    throw new Error(
      "JWT_SECRET ยังเป็นค่าเริ่มต้น กรุณาสร้างค่าแบบสุ่มใหม่",
    );
  }
}

const nodeEnv = readText(
  process.env.NODE_ENV,
  "development",
).toLowerCase();

const jwtSecret = readText(
  process.env.JWT_SECRET,
  nodeEnv === "production" ? "" : DEVELOPMENT_SECRET,
);

validateProductionSecret(nodeEnv, jwtSecret);

const origins = [
  normalizeOrigin(
    process.env.ADMIN_WEB_ORIGIN ||
      "http://localhost:5173",
  ),
  normalizeOrigin(
    process.env.CITIZEN_WEB_ORIGIN ||
      "http://localhost:5174",
  ),
  normalizeOrigin(
    process.env.PUBLIC_WEB_ORIGIN ||
      "https://0tyght.github.io",
  ),
].filter(Boolean);

export const config = Object.freeze({
  nodeEnv,

  port: readPort(
    process.env.PORT,
    4100,
    "PORT",
  ),

  jwtSecret,

  lineChannelId: readText(process.env.LINE_CHANNEL_ID),

  lineLiffId: readText(process.env.LINE_LIFF_ID),

  lineChannelAccessToken: readText(process.env.LINE_CHANNEL_ACCESS_TOKEN),

  lineConfigured: Boolean(
    readText(process.env.LINE_CHANNEL_ID) &&
    readText(process.env.LINE_CHANNEL_SECRET) &&
    readText(process.env.LINE_CHANNEL_ACCESS_TOKEN) &&
    readText(process.env.LINE_LIFF_ID)
  ),

  origins: Object.freeze([...new Set(origins)]),

  db: Object.freeze({
    host: readText(
      process.env.DB_HOST,
      "127.0.0.1",
    ),

    port: readPort(
      process.env.DB_PORT,
      3306,
      "DB_PORT",
    ),

    user: readText(
      process.env.DB_USER,
      "root",
    ),

    password: String(
      process.env.DB_PASSWORD ?? "",
    ),

    database: readText(
      process.env.DB_NAME,
      "prms_tsm",
    ),
  }),
});
