import { pool } from "../apps/api/src/db.js";
import { loadCitizenExperienceByLineUserId } from "../apps/api/src/citizenExperience.js";
import { isValidLineUserId } from "../apps/api/src/lineNativeCitizen.js";
import {
  cleanupWizardRichMenus,
  ensureWizardSchema,
  showWizardMainMenu,
  warmWizardRichMenus,
} from "../apps/api/src/lineRichMenuWizard.js";

const lineUserIds = new Set();

async function collectLineUserIds(sql) {
  try {
    const [rows] = await pool.execute(sql);
    for (const row of rows) {
      const lineUserId = String(row.lineUserId || "").trim();
      if (isValidLineUserId(lineUserId)) lineUserIds.add(lineUserId);
    }
  } catch (error) {
    if (error?.code !== "ER_NO_SUCH_TABLE") throw error;
  }
}

try {
  await ensureWizardSchema();
  const warmed = await warmWizardRichMenus();
  console.log(`Rich Menu static cache: warmed=${warmed.length}`);

  await collectLineUserIds(
    `SELECT DISTINCT line_user_id AS lineUserId
     FROM owners
     WHERE line_user_id IS NOT NULL AND deleted_at IS NULL`,
  );
  await collectLineUserIds(
    `SELECT DISTINCT line_user_id AS lineUserId
     FROM line_runtime_rich_menus`,
  );
  await collectLineUserIds(
    `SELECT DISTINCT line_user_id AS lineUserId
     FROM line_conversation_sessions
     WHERE expires_at > NOW()`,
  );

  let linked = 0;
  let failed = 0;

  for (const lineUserId of lineUserIds) {
    try {
      const state = await loadCitizenExperienceByLineUserId(lineUserId);
      await showWizardMainMenu(lineUserId, state);
      linked += 1;
      console.log(`${lineUserId.slice(0, 9)}... -> ${state.linked ? "owner" : "guest"}`);
    } catch (error) {
      failed += 1;
      console.error(`${lineUserId.slice(0, 9)}... -> FAILED: ${error.message}`);
    }
  }

  const cleanup = await cleanupWizardRichMenus();
  console.log(
    `Rich Menu sync: linked=${linked}, failed=${failed}, ` +
      `deletedRuntime=${cleanup.deletedRuntimeMenus}, deletedCache=${cleanup.deletedCachedMenus}`,
  );

  if (failed > 0) process.exitCode = 1;
} finally {
  await pool.end();
}
