import fs from "node:fs";
import path from "node:path";

const repoRoot = process.argv[2]
  ? path.resolve(process.argv[2])
  : process.cwd();

function read(relative) {
  return fs
    .readFileSync(path.join(repoRoot, relative), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function write(relative, content) {
  fs.writeFileSync(path.join(repoRoot, relative), content, "utf8");
  console.log(`อัปเดต ${relative}`);
}

function ensureContains(source, marker, label) {
  if (!source.includes(marker)) {
    throw new Error(`ไม่พบตำแหน่ง ${label}`);
  }
}

function insertAfter(source, marker, addition, label) {
  if (source.includes(addition.trim())) return source;
  ensureContains(source, marker, label);
  return source.replace(marker, `${marker}${addition}`);
}

function insertBefore(source, marker, addition, label) {
  if (source.includes(addition.trim())) return source;
  ensureContains(source, marker, label);
  return source.replace(marker, `${addition}${marker}`);
}

function replaceOnce(source, pattern, replacement, label) {
  const matches = source.match(pattern);
  if (!matches) throw new Error(`ไม่พบตำแหน่ง ${label}`);
  return source.replace(pattern, replacement);
}

function replaceFunctionBlock(
  source,
  startMarker,
  nextMarker,
  replacement,
  label,
) {
  const startIndex = source.indexOf(startMarker);

  if (startIndex < 0) {
    throw new Error(`ไม่พบจุดเริ่มต้น ${label}`);
  }

  const nextIndex = source.indexOf(nextMarker, startIndex + startMarker.length);

  if (nextIndex < 0) {
    throw new Error(`ไม่พบจุดสิ้นสุด ${label}`);
  }

  const suffix = source.slice(nextIndex);
  const separator = replacement.endsWith("\n") ? "" : "\n";

  return (
    source.slice(0, startIndex) +
    replacement +
    separator +
    suffix
  );
}

function patchApp() {
  const relative = "apps/api/src/app.js";
  let source = read(relative);

  const experienceImport =
    'import { registerCitizenExperienceRoutes } from "./citizenExperience.js";';

  if (!source.includes(experienceImport)) {
    const marker =
      'import { deliverLineNotification, enqueueLineNotification } from "./lineNotifications.js";';
    ensureContains(source, marker, "import lineNotifications");
    source = source.replace(marker, `${marker}\n${experienceImport}`);
  }

  const webhookImport =
    'import { handleLineWebhook } from "./lineBot.js";';

  if (!source.includes(webhookImport)) {
    const marker = experienceImport;
    ensureContains(source, marker, "citizenExperience import");
    source = source.replace(marker, `${marker}\n${webhookImport}`);
  }

  if (!source.includes('"/api/line/webhook"')) {
    const jsonMarker = '  app.use(express.json({ limit: "15mb" }));';
    ensureContains(source, jsonMarker, "express json middleware");

    const webhookRoute = `  app.post(
    ["/api/line/webhook", "/api/v1/line/webhook"],
    express.raw({
      type: "application/json",
      limit: "1mb",
    }),
    handleLineWebhook,
  );

`;

    source = source.replace(jsonMarker, `${webhookRoute}${jsonMarker}`);
  }

  if (!source.includes("latitude: z.coerce.number()")) {
    const marker =
      '  addressDetail: z.string().trim().max(255).optional().default(""),';
    ensureContains(source, marker, "registration addressDetail");

    source = source.replace(
      marker,
      `${marker}
  latitude: z.coerce.number().min(-90).max(90).nullable().optional().default(null),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional().default(null),`,
    );
  }

  const householdReplacement = `async function findOrCreateHousehold(db, input) {
  const [rows] = await db.execute(
    \`
      SELECT
        id,
        address_detail AS addressDetail,
        latitude,
        longitude
      FROM households
      WHERE deleted_at IS NULL
        AND village_id = ?
        AND house_no = ?
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE
    \`,
    [input.villageId, input.houseNo],
  );

  const latitude = Number.isFinite(Number(input.latitude))
    ? Number(input.latitude)
    : null;
  const longitude = Number.isFinite(Number(input.longitude))
    ? Number(input.longitude)
    : null;

  const existing = rows[0];

  if (existing) {
    await db.execute(
      \`
        UPDATE households
        SET address_detail = COALESCE(NULLIF(?, ''), address_detail),
            latitude = COALESCE(?, latitude),
            longitude = COALESCE(?, longitude)
        WHERE id = ?
      \`,
      [
        input.addressDetail || "",
        latitude,
        longitude,
        existing.id,
      ],
    );

    return existing.id;
  }

  const householdId = crypto.randomUUID();

  await db.execute(
    \`
      INSERT INTO households (
        id,
        house_no,
        village_id,
        address_detail,
        latitude,
        longitude
      )
      VALUES (?, ?, ?, NULLIF(?, ''), ?, ?)
    \`,
    [
      householdId,
      input.houseNo,
      input.villageId,
      input.addressDetail,
      latitude,
      longitude,
    ],
  );

  return householdId;
}

`;

  source = replaceFunctionBlock(
    source,
    "async function findOrCreateHousehold(db, input) {",
    "async function findOrCreateOwner(db, input) {",
    householdReplacement,
    "findOrCreateHousehold",
  );

  const ownerReplacement = `async function findOrCreateOwner(db, input) {
  const existingOwner = await findOwner(db, input);
  const latitude = Number.isFinite(Number(input.latitude))
    ? Number(input.latitude)
    : null;
  const longitude = Number.isFinite(Number(input.longitude))
    ? Number(input.longitude)
    : null;

  if (existingOwner) {
    await db.execute(
      \`
        UPDATE owners
        SET full_name = ?,
            phone = ?,
            consent_at = COALESCE(consent_at, NOW()),
            deleted_at = NULL
        WHERE id = ?
      \`,
      [input.ownerName, input.phone, existingOwner.id],
    );

    await db.execute(
      \`
        UPDATE households
        SET house_no = ?,
            village_id = ?,
            address_detail = COALESCE(NULLIF(?, ''), address_detail),
            latitude = COALESCE(?, latitude),
            longitude = COALESCE(?, longitude)
        WHERE id = ?
          AND deleted_at IS NULL
      \`,
      [
        input.houseNo,
        input.villageId,
        input.addressDetail || "",
        latitude,
        longitude,
        existingOwner.householdId,
      ],
    );

    return {
      ownerId: existingOwner.id,
      householdId: existingOwner.householdId,
      reused: true,
    };
  }

  const householdId = await findOrCreateHousehold(db, input);
  const ownerId = crypto.randomUUID();

  await db.execute(
    \`
      INSERT INTO owners (
        id,
        household_id,
        full_name,
        national_id_hash,
        national_id_last4,
        phone,
        consent_at
      )
      VALUES (?, ?, ?, ?, ?, ?, NOW())
    \`,
    [
      ownerId,
      householdId,
      input.ownerName,
      hashNationalId(input.nationalId),
      input.nationalId ? input.nationalId.slice(-4) : null,
      input.phone,
    ],
  );

  return {
    ownerId,
    householdId,
    reused: false,
  };
}

`;

  source = replaceFunctionBlock(
    source,
    "async function findOrCreateOwner(db, input) {",
    "async function findRecentDuplicateRegistration(db, ownerId, input) {",
    ownerReplacement,
    "findOrCreateOwner",
  );

  const newOwnerSelect = `SELECT o.id, o.full_name AS fullName, o.phone, h.house_no AS houseNo,
                   h.address_detail AS addressDetail,
                   CAST(h.latitude AS DECIMAL(10, 7)) AS latitude,
                   CAST(h.longitude AS DECIMAL(10, 7)) AS longitude,
                   v.id AS villageId, v.village_no AS villageNo, v.name_th AS villageName`;

  if (!source.includes("CAST(h.latitude AS DECIMAL(10, 7)) AS latitude")) {
    source = replaceOnce(
      source,
      /SELECT o\.id, o\.full_name AS fullName, o\.phone, h\.house_no AS houseNo,\s*\n\s*v\.village_no AS villageNo, v\.name_th AS villageName/,
      newOwnerSelect,
      "citizen me owner select",
    );
  }

  const routeLine = "  registerCitizenExperienceRoutes(app);\n\n";
  if (!source.includes("registerCitizenExperienceRoutes(app);")) {
    const marker =
      '  app.post("/api/citizen/line/session", lineSessionRateLimit, async (req, res, next) => {';
    source = insertBefore(
      source,
      marker,
      routeLine,
      "citizen line session route",
    );
  }

  write(relative, source);
}

function patchConfig() {
  const relative = "apps/api/src/config.js";
  let source = read(relative);

  if (!source.includes("lineChannelSecret:")) {
    const marker =
      "  lineChannelId: readText(process.env.LINE_CHANNEL_ID),";
    source = insertAfter(
      source,
      marker,
      "\n\n  lineChannelSecret: readText(process.env.LINE_CHANNEL_SECRET),",
      "LINE Channel ID config",
    );
  }

  const properties = [
    [
      "lineRichMenuGuestId:",
      "  lineRichMenuGuestId: readText(process.env.LINE_RICH_MENU_GUEST_ID),",
    ],
    [
      "lineRichMenuOwnerId:",
      "  lineRichMenuOwnerId: readText(process.env.LINE_RICH_MENU_OWNER_ID),",
    ],
    [
      "lineRichMenuActionId:",
      "  lineRichMenuActionId: readText(process.env.LINE_RICH_MENU_ACTION_ID),",
    ],
  ];

  if (properties.some(([needle]) => !source.includes(needle))) {
    const marker =
      "  lineChannelAccessToken: readText(process.env.LINE_CHANNEL_ACCESS_TOKEN),";
    ensureContains(source, marker, "LINE access token config");

    const additions = properties
      .filter(([needle]) => !source.includes(needle))
      .map(([, line]) => line)
      .join("\n\n");

    source = source.replace(marker, `${marker}\n\n${additions}`);
  }

  write(relative, source);
}

function patchNotifications() {
  const relative = "apps/api/src/lineNotifications.js";
  let source = read(relative);

  const importLine =
    'import { syncRichMenuForLineUser } from "./citizenExperience.js";';

  if (!source.includes(importLine)) {
    const marker = 'import { pool } from "./db.js";';
    source = insertAfter(
      source,
      marker,
      `\n${importLine}`,
      "lineNotifications pool import",
    );
  }

  source = source.replaceAll(
    "เทศบาลท่าโพธ์",
    "เทศบาลเมืองท่าโพธิ์",
  );

  if (!source.includes("[line-notification] rich menu sync failed")) {
    const marker = `      await pool.execute(
        \`UPDATE notifications SET delivery_status = 'SENT', sent_at = NOW(), last_http_status = ?, last_error = NULL WHERE id = ?\`,
        [response.status, id],
      );`;

    ensureContains(source, marker, "notification sent update");

    const addition = `${marker}
      await syncRichMenuForLineUser(notification.lineUserId).catch((error) => {
        console.error(
          "[line-notification] rich menu sync failed",
          String(error?.message || error),
        );
      });`;

    source = source.replace(marker, addition);
  }

  write(relative, source);
}

function patchDb() {
  const relative = "apps/api/src/db.js";
  let source = read(relative);

  if (!source.includes('charset: "utf8mb4"')) {
    const marker = '  timezone: "+07:00",';
    source = insertAfter(
      source,
      marker,
      '\n  charset: "utf8mb4",',
      "database timezone",
    );
  }

  write(relative, source);
}

function patchEnvExample() {
  const relative = ".env.example";
  let source = read(relative);

  const additions = [
    "LINE_RICH_MENU_GUEST_ID=",
    "LINE_RICH_MENU_OWNER_ID=",
    "LINE_RICH_MENU_ACTION_ID=",
  ];

  if (!source.includes("LINE_RICH_MENU_GUEST_ID=")) {
    if (!source.endsWith("\n")) source += "\n";
    source += `
# Dynamic Rich Menu IDs (สร้างด้วย scripts/setup-line-rich-menus.ps1)
${additions.join("\n")}
`;
  }

  write(relative, source);
}

patchApp();
patchConfig();
patchNotifications();
patchDb();
patchEnvExample();

console.log("แพตช์ API และ Environment สำเร็จ");
