import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_ENV_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../.env",
);

loadEnv({
  path: ROOT_ENV_PATH,
  override: false,
  quiet: true,
});
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

  mfaEncryptionKey: readText(process.env.MFA_ENCRYPTION_KEY, jwtSecret),

  lineChannelSecret: readText(process.env.LINE_CHANNEL_SECRET),

  lineChannelAccessToken: readText(process.env.LINE_CHANNEL_ACCESS_TOKEN),

  lineRichMenuGuestId: readText(process.env.LINE_RICH_MENU_GUEST_ID),

  lineRichMenuOwnerId: readText(process.env.LINE_RICH_MENU_OWNER_ID),

  lineRichMenuActionId: readText(process.env.LINE_RICH_MENU_ACTION_ID),

  lineConfigured: Boolean(
    readText(process.env.LINE_CHANNEL_SECRET) &&
    readText(process.env.LINE_CHANNEL_ACCESS_TOKEN)
  ),

  privateStorageDir: path.resolve(readText(process.env.PRIVATE_STORAGE_DIR, "./storage/uploads")),

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
