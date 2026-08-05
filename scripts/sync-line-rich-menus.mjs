import { pool } from "../apps/api/src/db.js";
import { syncRichMenuForLineUser } from "../apps/api/src/citizenExperience.js";

const [rows] = await pool.execute(
  `SELECT DISTINCT line_user_id AS lineUserId
   FROM owners
   WHERE line_user_id IS NOT NULL
     AND line_user_id <> ''
     AND deleted_at IS NULL`,
);

let linked = 0;
let skipped = 0;
let failed = 0;

for (const row of rows) {
  try {
    const result = await syncRichMenuForLineUser(row.lineUserId);

    if (result.status === "LINKED") {
      linked += 1;
      console.log(`${row.lineUserId.slice(0, 8)}... -> ${result.menuKey}`);
    } else {
      skipped += 1;
      console.log(`${row.lineUserId.slice(0, 8)}... -> ${result.reason}`);
    }
  } catch (error) {
    failed += 1;
    console.error(
      `${row.lineUserId.slice(0, 8)}... -> ${String(error?.message || error)}`,
    );
  }
}

await pool.end();

console.log("");
console.log(`Rich Menu sync: linked=${linked}, skipped=${skipped}, failed=${failed}`);

if (failed > 0) {
  process.exitCode = 1;
}
