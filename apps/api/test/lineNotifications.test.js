import test from "node:test";
import assert from "node:assert/strict";
import { enqueueLineNotification } from "../src/lineNotifications.js";

test("stores a durable LINE notification event inside the caller transaction", async () => {
  const calls = [];
  const db = { execute: async (sql, params) => { calls.push({ sql, params }); return [{ affectedRows: 1 }]; } };
  const result = await enqueueLineNotification(db, {
    ownerId: "owner-1",
    entityType: "REGISTRATION",
    entityId: "registration-1",
    lineUserId: "",
    templateCode: "REGISTRATION_APPROVED",
    message: "อนุมัติแล้ว",
  });
  assert.equal(result.status, "SKIPPED");
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /INSERT INTO notifications/);
  assert.equal(calls[0].params[1], "owner-1");
  assert.equal(calls[0].params.at(-1), "OWNER_NOT_LINKED");
});
