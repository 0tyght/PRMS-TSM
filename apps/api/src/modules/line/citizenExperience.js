import { lineChannelSettings } from "./lineChannelSettings.js";
import { pool } from "../../core/db.js";
import { authenticate, requireRole } from "../../core/middleware.js";

function numberValue(value) {
  return Number(value || 0);
}

function selectMenuKey(state) {
  if (!state.linked) {
    return "guest";
  }

  if (
    state.counts.needsAttention > 0 ||
    state.counts.pending > 0 ||
    state.counts.vaccinationDue > 0 ||
    state.counts.missingPets > 0 ||
    state.location.missing
  ) {
    return "action";
  }

  return "owner";
}

export async function loadCitizenExperienceByLineUserId(lineUserId) {
  const normalizedLineUserId = String(lineUserId || "").trim();

  if (!normalizedLineUserId) {
    return {
      linked: false,
      menuKey: "guest",
      owner: null,
      location: { latitude: null, longitude: null, missing: true },
      counts: {
        pets: 0,
        pending: 0,
        needsAttention: 0,
        vaccinationDue: 0,
        unsterilized: 0,
        missingPets: 0,
      },
      actions: ["REGISTER", "TRACK", "LINK"],
    };
  }

  const [ownerRows] = await pool.execute(
    `SELECT
       o.id,
       o.full_name AS fullName,
       o.phone,
       h.id AS householdId,
       h.house_no AS houseNo,
       h.address_detail AS addressDetail,
       CAST(h.latitude AS DECIMAL(10, 7)) AS latitude,
       CAST(h.longitude AS DECIMAL(10, 7)) AS longitude,
       v.id AS villageId,
       v.village_no AS villageNo,
       v.name_th AS villageName
     FROM owners o
     INNER JOIN households h
       ON h.id = o.household_id
      AND h.deleted_at IS NULL
     INNER JOIN villages v
       ON v.id = h.village_id
     WHERE o.line_user_id = ?
       AND o.deleted_at IS NULL
     LIMIT 1`,
    [normalizedLineUserId],
  );

  const owner = ownerRows[0] || null;

  if (!owner) {
    const state = {
      linked: false,
      menuKey: "guest",
      owner: null,
      location: { latitude: null, longitude: null, missing: true },
      counts: {
        pets: 0,
        pending: 0,
        needsAttention: 0,
        vaccinationDue: 0,
        unsterilized: 0,
        missingPets: 0,
      },
      actions: ["REGISTER", "TRACK", "LINK"],
    };

    return state;
  }

  const [petRows, requestRows] = await Promise.all([
    pool.execute(
      `SELECT
         COUNT(*) AS pets,
         SUM(CASE WHEN p.status = 'MISSING' THEN 1 ELSE 0 END) AS missingPets,
         SUM(
           CASE
             WHEN p.status = 'ACTIVE'
              AND NOT EXISTS (
                SELECT 1
                FROM sterilization_records sr
                WHERE sr.pet_id = p.id
              )
             THEN 1
             ELSE 0
           END
         ) AS unsterilized,
         SUM(
           CASE
             WHEN p.status = 'ACTIVE'
              AND (
                NOT EXISTS (
                  SELECT 1
                  FROM vaccination_records vr0
                  WHERE vr0.pet_id = p.id
                )
                OR COALESCE(
                  (
                    SELECT vr.next_due_at
                    FROM vaccination_records vr
                    WHERE vr.pet_id = p.id
                    ORDER BY vr.vaccinated_at DESC
                    LIMIT 1
                  ),
                  DATE_ADD(
                    (
                      SELECT MAX(vr2.vaccinated_at)
                      FROM vaccination_records vr2
                      WHERE vr2.pet_id = p.id
                    ),
                    INTERVAL 1 YEAR
                  )
                ) <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
              )
             THEN 1
             ELSE 0
           END
         ) AS vaccinationDue
       FROM pets p
       WHERE p.owner_id = ?
         AND p.deleted_at IS NULL`,
      [owner.id],
    ).then(([rows]) => rows),
    pool.execute(
      `SELECT
         SUM(CASE WHEN request_status = 'NEED_MORE_INFO' THEN 1 ELSE 0 END) AS needsAttention,
         SUM(CASE WHEN request_status IN ('SUBMITTED', 'UNDER_REVIEW') THEN 1 ELSE 0 END) AS pending
       FROM (
         SELECT status AS request_status
         FROM registrations
         WHERE owner_id = ?
         UNION ALL
         SELECT status AS request_status
         FROM citizen_submissions
         WHERE owner_id = ?
       ) requests`,
      [owner.id, owner.id],
    ).then(([rows]) => rows),
  ]);

  const petStats = petRows[0] || {};
  const requestStats = requestRows[0] || {};
  const latitude = owner.latitude === null ? null : Number(owner.latitude);
  const longitude = owner.longitude === null ? null : Number(owner.longitude);

  const state = {
    linked: true,
    menuKey: "owner",
    owner: {
      id: owner.id,
      fullName: owner.fullName,
      phone: owner.phone,
      houseNo: owner.houseNo,
      addressDetail: owner.addressDetail || "",
      villageId: numberValue(owner.villageId),
      villageNo: numberValue(owner.villageNo),
      villageName: owner.villageName,
    },
    location: {
      latitude,
      longitude,
      missing: !Number.isFinite(latitude) || !Number.isFinite(longitude),
    },
    counts: {
      pets: numberValue(petStats.pets),
      pending: numberValue(requestStats.pending),
      needsAttention: numberValue(requestStats.needsAttention),
      vaccinationDue: numberValue(petStats.vaccinationDue),
      unsterilized: numberValue(petStats.unsterilized),
      missingPets: numberValue(petStats.missingPets),
    },
    actions: [],
  };

  if (state.counts.needsAttention > 0) state.actions.push("REVIEW_REQUIRED");
  if (state.counts.vaccinationDue > 0) state.actions.push("VACCINATION_DUE");
  if (state.counts.unsterilized > 0) state.actions.push("STERILIZATION");
  if (state.counts.missingPets > 0) state.actions.push("MISSING_PET");
  if (state.location.missing) state.actions.push("LOCATION_REQUIRED");
  if (state.counts.pending > 0) state.actions.push("PENDING");
  if (!state.actions.length) state.actions.push("READY");

  state.menuKey = selectMenuKey(state);
  return state;
}

export async function syncRichMenuForLineUser(lineUserId, suppliedState = null) {
  const normalizedLineUserId = String(lineUserId || "").trim();

  if (!normalizedLineUserId) {
    return { status: "SKIPPED", reason: "NO_LINE_USER_ID" };
  }

  if (!/^U[0-9a-f]{32}$/i.test(normalizedLineUserId)) {
    return { status: "SKIPPED", reason: "INVALID_OR_DEMO_LINE_USER_ID" };
  }

  const citizenChannel = await lineChannelSettings.get("CITIZEN");
  if (!citizenChannel.channelAccessToken) {
    return { status: "SKIPPED", reason: "NO_CHANNEL_ACCESS_TOKEN" };
  }

  const state = suppliedState || await loadCitizenExperienceByLineUserId(normalizedLineUserId);
  const { showWizardMainMenu } = await import("./lineRichMenuWizard.js");
  const linked = await showWizardMainMenu(normalizedLineUserId, state);

  return {
    status: linked ? "LINKED" : "SKIPPED",
    reason: linked ? undefined : "INVALID_LINE_USER_ID",
    menuKey: state.linked ? "owner" : "guest",
  };
}

function countLine(label, value) {
  return `${label} ${Number(value || 0).toLocaleString("th-TH")} รายการ`;
}

export function buildCitizenStatusFlex(state) {
  const counts = state.counts || {};
  const accent = state.menuKey === "action" ? "#D97706" : "#087F5B";
  const heading = state.linked
    ? `สวัสดี ${state.owner?.fullName || "เจ้าของสัตว์เลี้ยง"}`
    : "เริ่มใช้บริการ ThaPho PET";

  const summary = state.linked
    ? [
        countLine("สัตว์ในทะเบียน", counts.pets),
        countLine("ข้อมูลรอตรวจสอบ", counts.pending),
        countLine("ต้องแก้ไขข้อมูล", counts.needsAttention),
        countLine("วัคซีนใกล้ครบกำหนด", counts.vaccinationDue),
      ].join("\n")
    : "ลงทะเบียนสัตว์ ติดตามข้อมูลที่ส่ง หรือเชื่อมทะเบียนเดิมได้จากเมนูด้านล่าง";

  return {
    type: "flex",
    altText: state.linked
      ? `ข้อมูล ThaPho PET: มีสัตว์ ${Number(counts.pets || 0)} ตัว`
      : "เริ่มใช้บริการ ThaPho PET",
    contents: {
      type: "bubble",
      size: "kilo",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: accent,
        paddingAll: "18px",
        contents: [
          { type: "text", text: "THAPHO PET", color: "#FFFFFF", weight: "bold", size: "xs" },
          { type: "text", text: heading, color: "#FFFFFF", weight: "bold", size: "lg", wrap: true, margin: "sm" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "18px",
        contents: [
          { type: "text", text: summary, wrap: true, size: "sm", color: "#334155" },
          ...(state.linked && state.location?.missing
            ? [{
                type: "text",
                text: "ยังไม่ได้ระบุตำแหน่งบ้าน เลือก ‘ข้อมูลเจ้าของ’ จาก Rich Menu เพื่อเพิ่มตำแหน่ง",
                wrap: true,
                size: "sm",
                color: "#B45309",
                weight: "bold",
                margin: "md",
              }]
            : []),
          {
            type: "text",
            text: "เลือกบริการจาก Rich Menu ด้านล่าง",
            wrap: true,
            size: "xs",
            color: "#64748B",
            margin: "lg",
          },
        ],
      },
    },
  };
}
